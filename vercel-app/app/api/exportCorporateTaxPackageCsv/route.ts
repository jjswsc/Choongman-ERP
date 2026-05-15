import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { computeCorporateTaxComputation } from '@/lib/corporate-tax'
import { requireAuth } from '@/lib/verify-auth'

function escCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const userRole = String(auth.role || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'half_year' || periodTypeRaw === 'annual' ? periodTypeRaw : 'monthly'
  const storeFilter = String(searchParams.get('storeFilter') || 'All').trim()
  const userStore = String(auth.store || '').trim()
  const taxRateRaw = Number(searchParams.get('taxRate'))

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const data = await computeCorporateTaxComputation({
      yearMonth,
      periodType,
      storeFilter,
      userStore,
      userRole,
      taxRate: Number.isFinite(taxRateRaw) ? taxRateRaw : undefined,
    })
    const lines: string[] = []
    lines.push('section,key,value')
    lines.push(`summary,period_type,${data.periodType}`)
    lines.push(`summary,filing_form,${data.filingForm}`)
    lines.push(`summary,period_key,${data.periodKey}`)
    lines.push(`summary,months,${escCell(data.months.join('|'))}`)
    lines.push(`summary,store_filter,${escCell(data.storeFilter)}`)
    lines.push(`summary,accounting_profit,${data.accountingProfit}`)
    lines.push(`summary,tax_add_back,${data.taxAddBack}`)
    lines.push(`summary,tax_deduction,${data.taxDeduction}`)
    lines.push(`summary,taxable_income,${data.taxableIncome}`)
    lines.push(`summary,projected_annual_taxable_income,${data.projectedAnnualTaxableIncome}`)
    lines.push(`summary,tax_rate,${data.taxRate}`)
    lines.push(`summary,estimated_tax,${data.estimatedTax}`)
    lines.push(`summary,filing_tax_due,${data.filingTaxDue}`)
    for (const item of data.adjustments) {
      lines.push(
        `adjustment,${escCell(item.type + ':' + item.itemName)},${item.amount}`
      )
      if (item.memo) {
        lines.push(`evidence,${escCell(item.itemName)},${escCell(item.memo)}`)
      }
    }
    const csv = lines.join('\r\n')
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="corporate-tax-package-${data.periodKey}.csv"`,
      },
    })
  } catch (e) {
    console.error('exportCorporateTaxPackageCsv:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}


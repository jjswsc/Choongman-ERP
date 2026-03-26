import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { computeCorporateTaxComputation } from '@/lib/corporate-tax'

function escCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'half_year' || periodTypeRaw === 'annual' ? periodTypeRaw : 'monthly'
  const storeFilter = String(searchParams.get('storeFilter') || 'All').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
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
    lines.push(`summary,period_key,${data.periodKey}`)
    lines.push(`summary,months,${escCell(data.months.join('|'))}`)
    lines.push(`summary,store_filter,${escCell(data.storeFilter)}`)
    lines.push(`summary,accounting_profit,${data.accountingProfit}`)
    lines.push(`summary,tax_add_back,${data.taxAddBack}`)
    lines.push(`summary,tax_deduction,${data.taxDeduction}`)
    lines.push(`summary,taxable_income,${data.taxableIncome}`)
    lines.push(`summary,tax_rate,${data.taxRate}`)
    lines.push(`summary,estimated_tax,${data.estimatedTax}`)
    for (const item of data.adjustments) {
      lines.push(
        `adjustment,${escCell(item.type + ':' + item.itemName)},${item.amount}`
      )
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


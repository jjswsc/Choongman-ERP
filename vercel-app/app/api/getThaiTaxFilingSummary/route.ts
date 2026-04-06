import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { buildMonthInFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { appendStoreNameFilter } from '@/lib/accounting-ledger-store-filter'

type VatRow = {
  direction?: string
  net_amount?: number
  vat_amount?: number
  counterparty_tax_id?: string | null
  invoice_number?: string | null
}

type WhtRow = {
  form_hint?: string | null
  gross_amount?: number | null
  wht_amount?: number
  payee_tax_id?: string | null
  certificate_no?: string | null
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'annual' || periodTypeRaw === 'half_year' ? periodTypeRaw : 'monthly'
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    const monthList = buildMonthInFilter(period.months)
    const monthBase = `tax_month=in.(${monthList})`
    const vatFilter = appendStoreNameFilter(monthBase, storeFilter)
    const whtFilter = appendStoreNameFilter(monthBase, storeFilter)

    const [vatRows, whtRows] = await Promise.all([
      supabaseSelectFilter('vat_ledger_entries', vatFilter, {
        select: 'direction,net_amount,vat_amount,counterparty_tax_id,invoice_number',
        limit: 20000,
      }) as Promise<VatRow[] | null>,
      supabaseSelectFilter('withholding_tax_ledger_entries', whtFilter, {
        select: 'form_hint,gross_amount,wht_amount,payee_tax_id,certificate_no',
        limit: 20000,
      }) as Promise<WhtRow[] | null>,
    ])

    const vat = {
      outputNet: 0,
      outputVat: 0,
      inputNet: 0,
      inputVat: 0,
      payableVat: 0,
      missingTaxIdCount: 0,
      missingInvoiceCount: 0,
      rowCount: 0,
    }
    for (const row of vatRows || []) {
      const dir = String(row.direction || '').toLowerCase()
      const net = Number(row.net_amount) || 0
      const amt = Number(row.vat_amount) || 0
      if (dir === 'output') {
        vat.outputNet += net
        vat.outputVat += amt
      } else {
        vat.inputNet += net
        vat.inputVat += amt
      }
      if (!String(row.counterparty_tax_id || '').trim()) vat.missingTaxIdCount += 1
      if (!String(row.invoice_number || '').trim()) vat.missingInvoiceCount += 1
      vat.rowCount += 1
    }
    vat.payableVat = vat.outputVat - vat.inputVat

    const whtByForm: Record<string, { gross: number; withheld: number; rows: number }> = {}
    const wht = {
      totalGross: 0,
      totalWithheld: 0,
      missingTaxIdCount: 0,
      missingCertificateCount: 0,
      rowCount: 0,
      byForm: whtByForm,
    }
    for (const row of whtRows || []) {
      const form = String(row.form_hint || 'PND53').trim().toUpperCase()
      const gross = Number(row.gross_amount) || 0
      const withheld = Number(row.wht_amount) || 0
      if (!whtByForm[form]) whtByForm[form] = { gross: 0, withheld: 0, rows: 0 }
      whtByForm[form].gross += gross
      whtByForm[form].withheld += withheld
      whtByForm[form].rows += 1
      wht.totalGross += gross
      wht.totalWithheld += withheld
      if (!String(row.payee_tax_id || '').trim()) wht.missingTaxIdCount += 1
      if (!String(row.certificate_no || '').trim()) wht.missingCertificateCount += 1
      wht.rowCount += 1
    }

    return NextResponse.json(
      {
        period,
        vat,
        wht,
      },
      { headers }
    )
  } catch (e) {
    console.error('getThaiTaxFilingSummary:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}


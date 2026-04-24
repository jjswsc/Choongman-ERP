import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import {
  syncTaxVatLedgersFromStockAndExpenses,
  syncTaxWithholdingLedgersFromPayroll,
  syncTaxWithholdingLedgersFromExpenses,
} from '@/lib/tax-ledger-auto-sync'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole, isOfficeStore } from '@/lib/permissions'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

type VatRow = {
  direction?: string
  net_amount?: number
  vat_amount?: number
  counterparty_tax_id?: string | null
  invoice_number?: string | null
  store_name?: string | null
}

type WhtRow = {
  form_hint?: string | null
  gross_amount?: number | null
  wht_amount?: number
  payee_tax_id?: string | null
  certificate_no?: string | null
  store_name?: string | null
}

type RpcSummaryRow = {
  vat_output_net?: number | null
  vat_output_vat?: number | null
  vat_input_net?: number | null
  vat_input_vat?: number | null
  vat_payable_vat?: number | null
  vat_missing_tax_id_count?: number | null
  vat_missing_invoice_count?: number | null
  vat_row_count?: number | null
  wht_total_gross?: number | null
  wht_total_withheld?: number | null
  wht_missing_tax_id_count?: number | null
  wht_missing_certificate_count?: number | null
  wht_row_count?: number | null
  wht_by_form?: Record<string, { gross?: number; withheld?: number; rows?: number }> | null
}

function isMissingTaxSummaryRpcError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('get_thai_tax_filing_summary_agg') || msg.includes('42883')
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const userRole = String(authResult.auth.role || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'annual' || periodTypeRaw === 'half_year' ? periodTypeRaw : 'monthly'
  const requestedStoreFilter = String(searchParams.get('storeFilter') || '').trim()
  const allowedStores =
    (Array.isArray(authResult.auth.allowedStores) ? authResult.auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(authResult.auth.store || '').trim())
  const userStore = String(authResult.auth.store || '').trim()
  const isOfficeLevel =
    isOfficeRole(userRole) ||
    isAccountingRole(userRole) ||
    isOfficeStore(userStore) ||
    isHeadOfficeLikeStoreName(userStore)
  let storeFilter = requestedStoreFilter
  if (!isOfficeLevel) {
    if (!requestedStoreFilter || requestedStoreFilter === 'All') {
      storeFilter = String(allowedStores[0] || '').trim()
      if (!storeFilter) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, requestedStoreFilter))
      if (!allowed) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
  }

  try {
    assertCanManageAccountingCompliance(userRole, String(authResult.auth.store || ''))
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
    try {
      await syncTaxVatLedgersFromStockAndExpenses({
        months: period.months,
        storeFilter,
      })
      await syncTaxWithholdingLedgersFromExpenses({
        months: period.months,
        storeFilter,
      })
      await syncTaxWithholdingLedgersFromPayroll({
        months: period.months,
        storeFilter,
      })
    } catch (e) {
      console.warn('getThaiTaxFilingSummary auto-sync skipped:', e)
    }
    const useRpcSummary = !storeFilter || storeFilter === 'All' || storeFilter === '*'
    if (useRpcSummary) {
      try {
      const rpcRows = await supabaseRpc<RpcSummaryRow[]>('get_thai_tax_filing_summary_agg', {
        p_tax_months: period.months,
        p_store_name: storeFilter || 'All',
      })
      const one = rpcRows?.[0] || {}
      const byForm = one.wht_by_form && typeof one.wht_by_form === 'object' ? one.wht_by_form : {}
      const normalizedByForm: Record<string, { gross: number; withheld: number; rows: number }> = {}
      Object.entries(byForm).forEach(([k, v]) => {
        normalizedByForm[String(k)] = {
          gross: Number(v?.gross || 0),
          withheld: Number(v?.withheld || 0),
          rows: Number(v?.rows || 0),
        }
      })
      return NextResponse.json(
        {
          period,
          vat: {
            outputNet: Number(one.vat_output_net || 0),
            outputVat: Number(one.vat_output_vat || 0),
            inputNet: Number(one.vat_input_net || 0),
            inputVat: Number(one.vat_input_vat || 0),
            payableVat: Number(one.vat_payable_vat || 0),
            missingTaxIdCount: Number(one.vat_missing_tax_id_count || 0),
            missingInvoiceCount: Number(one.vat_missing_invoice_count || 0),
            rowCount: Number(one.vat_row_count || 0),
          },
          wht: {
            totalGross: Number(one.wht_total_gross || 0),
            totalWithheld: Number(one.wht_total_withheld || 0),
            missingTaxIdCount: Number(one.wht_missing_tax_id_count || 0),
            missingCertificateCount: Number(one.wht_missing_certificate_count || 0),
            rowCount: Number(one.wht_row_count || 0),
            byForm: normalizedByForm,
          },
          fallbackUsed: false,
        },
        { headers }
      )
      } catch (rpcError) {
        if (!isMissingTaxSummaryRpcError(rpcError)) throw rpcError
        console.warn('getThaiTaxFilingSummary rpc fallback: missing function')
      }
    }

    const monthBase = buildTaxMonthPostgrestFilter(period.months)
    const [vatRows, whtRows] = await Promise.all([
      supabaseSelectFilter('vat_ledger_entries', monthBase, {
        select: 'direction,net_amount,vat_amount,counterparty_tax_id,invoice_number,store_name',
        limit: 20000,
      }) as Promise<VatRow[] | null>,
      supabaseSelectFilter('withholding_tax_ledger_entries', monthBase, {
        select: 'form_hint,gross_amount,wht_amount,payee_tax_id,certificate_no,store_name',
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
      if (!storeScope.matches(String(row.store_name || ''))) continue
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
      if (!storeScope.matches(String(row.store_name || ''))) continue
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
        fallbackUsed: true,
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


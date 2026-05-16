import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { buildTaxMonthPostgrestFilter } from '@/lib/thai-tax-period'

export type VatLedgerStoreNameGapSample = {
  id?: number
  doc_date: string
  direction: string
  net_amount: number
  vat_amount: number
  counterparty_name: string
  invoice_number: string
  memo: string
}

export type VatLedgerStoreNameGapsReport = {
  taxMonths: string[]
  storeFilter: string
  inScopeRowCount: number
  emptyStoreNameRowCount: number
  emptyStoreNameOutputNet: number
  emptyStoreNameOutputVat: number
  emptyStoreNameInputNet: number
  emptyStoreNameInputVat: number
  otherStoreRowCount: number
  otherStoreOutputVat: number
  otherStoreInputVat: number
  samples: VatLedgerStoreNameGapSample[]
}

type VatRowLite = {
  id?: number
  doc_date?: string
  tax_month?: string
  direction?: string
  net_amount?: number
  vat_amount?: number
  counterparty_name?: string | null
  invoice_number?: string | null
  memo?: string | null
  store_name?: string | null
}

function dirOf(row: VatRowLite): string {
  return String(row.direction || '').toLowerCase()
}

function isEmptyStoreName(row: VatRowLite): boolean {
  return !String(row.store_name || '').trim()
}

export async function analyzeVatLedgerStoreNameGaps(params: {
  months: string[]
  storeFilter: string
  matchesStore: (storeName: string) => boolean
}): Promise<VatLedgerStoreNameGapsReport> {
  const months = (params.months || []).map((m) => String(m || '').slice(0, 7)).filter(Boolean)
  const storeFilter = String(params.storeFilter || '').trim() || 'All'
  const filterAll = !storeFilter || storeFilter === 'All' || storeFilter === '*'

  if (!months.length) {
    return {
      taxMonths: [],
      storeFilter,
      inScopeRowCount: 0,
      emptyStoreNameRowCount: 0,
      emptyStoreNameOutputNet: 0,
      emptyStoreNameOutputVat: 0,
      emptyStoreNameInputNet: 0,
      emptyStoreNameInputVat: 0,
      otherStoreRowCount: 0,
      otherStoreOutputVat: 0,
      otherStoreInputVat: 0,
      samples: [],
    }
  }

  const monthFilter = buildTaxMonthPostgrestFilter(months)
  const rows = (await supabaseSelectFilterAllPages('vat_ledger_entries', monthFilter, {
    select:
      'id,doc_date,tax_month,direction,net_amount,vat_amount,counterparty_name,invoice_number,memo,store_name',
    order: 'doc_date.asc,id.asc',
    pageSize: 4000,
    maxRows: 100000,
  })) as VatRowLite[]

  let inScopeRowCount = 0
  let emptyStoreNameRowCount = 0
  let emptyStoreNameOutputNet = 0
  let emptyStoreNameOutputVat = 0
  let emptyStoreNameInputNet = 0
  let emptyStoreNameInputVat = 0
  let otherStoreRowCount = 0
  let otherStoreOutputVat = 0
  let otherStoreInputVat = 0
  const samples: VatLedgerStoreNameGapSample[] = []

  for (const row of rows || []) {
    const empty = isEmptyStoreName(row)
    const inScope = !empty && params.matchesStore(String(row.store_name || ''))

    if (inScope) inScopeRowCount += 1

    if (empty) {
      emptyStoreNameRowCount += 1
      const net = Number(row.net_amount) || 0
      const vat = Number(row.vat_amount) || 0
      if (dirOf(row) === 'output') {
        emptyStoreNameOutputNet += net
        emptyStoreNameOutputVat += vat
      } else {
        emptyStoreNameInputNet += net
        emptyStoreNameInputVat += vat
      }
      if (samples.length < 25) {
        samples.push({
          id: row.id != null ? Number(row.id) : undefined,
          doc_date: String(row.doc_date || '').slice(0, 10),
          direction: dirOf(row) || 'input',
          net_amount: net,
          vat_amount: vat,
          counterparty_name: String(row.counterparty_name || ''),
          invoice_number: String(row.invoice_number || ''),
          memo: String(row.memo || '').slice(0, 200),
        })
      }
      continue
    }

    if (!filterAll && !inScope) {
      otherStoreRowCount += 1
      const vat = Number(row.vat_amount) || 0
      if (dirOf(row) === 'output') otherStoreOutputVat += vat
      else otherStoreInputVat += vat
    }
  }

  return {
    taxMonths: months,
    storeFilter,
    inScopeRowCount,
    emptyStoreNameRowCount,
    emptyStoreNameOutputNet: Math.round(emptyStoreNameOutputNet * 100) / 100,
    emptyStoreNameOutputVat: Math.round(emptyStoreNameOutputVat * 100) / 100,
    emptyStoreNameInputNet: Math.round(emptyStoreNameInputNet * 100) / 100,
    emptyStoreNameInputVat: Math.round(emptyStoreNameInputVat * 100) / 100,
    otherStoreRowCount,
    otherStoreOutputVat: Math.round(otherStoreOutputVat * 100) / 100,
    otherStoreInputVat: Math.round(otherStoreInputVat * 100) / 100,
    samples,
  }
}

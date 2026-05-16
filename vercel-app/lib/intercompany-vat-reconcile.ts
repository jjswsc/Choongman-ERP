import { isOfficeStore } from '@/lib/permissions'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { buildTaxMonthPostgrestFilter } from '@/lib/thai-tax-period'
import {
  supabaseSelect,
  supabaseSelectFilterRange,
  supabaseSelectFilterAllPages,
} from '@/lib/supabase-server'

type StockLogRow = {
  log_date?: string | null
  location?: string | null
  vendor_target?: string | null
  item_code?: string | null
  qty?: number | string | null
  invoice_unit_price?: number | string | null
  unit_cost?: number | string | null
  reference_no?: string | null
}

type VatLedgerLite = {
  store_name?: string | null
  invoice_number?: string | null
  net_amount?: number | string | null
  vat_amount?: number | string | null
  direction?: string | null
}

export type IntercompanyVatReconcileRow = {
  storeName: string
  referenceNo: string
  hqIssuedNet: number
  storeInputNet: number
  storeInputVat: number
  diffNet: number
  status: 'missing_in_store_input' | 'extra_in_store_input' | 'net_diff'
}

export type IntercompanyVatReconcileReport = {
  months: string[]
  storeFilter: string
  issuedCount: number
  matchedCount: number
  missingInStoreCount: number
  extraInStoreCount: number
  diffCount: number
  hqIssuedNetTotal: number
  storeInputNetTotal: number
  storeInputVatTotal: number
  diffNetTotal: number
  rows: IntercompanyVatReconcileRow[]
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function monthStartYmd(ym: string): string {
  return `${ym}-01`
}

function monthEndYmd(ym: string): string {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return `${ym}-28`
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

function makeKey(storeName: string, referenceNo: string): string {
  return `${storeName}||${referenceNo}`
}

export async function analyzeIntercompanyVatReconcile(params: {
  months: string[]
  storeFilter: string
  matchesStore: (storeName: string) => boolean
}): Promise<IntercompanyVatReconcileReport> {
  const months = (params.months || []).map((x) => String(x || '').slice(0, 7)).filter(Boolean)
  const storeFilter = String(params.storeFilter || '').trim() || 'All'
  if (!months.length) {
    return {
      months: [],
      storeFilter,
      issuedCount: 0,
      matchedCount: 0,
      missingInStoreCount: 0,
      extraInStoreCount: 0,
      diffCount: 0,
      hqIssuedNetTotal: 0,
      storeInputNetTotal: 0,
      storeInputVatTotal: 0,
      diffNetTotal: 0,
      rows: [],
    }
  }

  const startYmd = monthStartYmd(months[0]!)
  const endYmd = monthEndYmd(months[months.length - 1]!)
  const itemRows = (await supabaseSelect('items', {
    select: 'code,cost',
    order: 'id.asc',
    limit: 15000,
  })) as { code?: string; cost?: number | null }[] | null
  const itemCostMap: Record<string, number> = {}
  for (const it of itemRows || []) {
    const code = String(it.code || '').trim()
    if (!code) continue
    itemCostMap[code] = Number(it.cost) || 0
  }

  const stockFilter = [
    'log_type=in.(Outbound,ForceOutbound)',
    `log_date=gte.${startYmd}`,
    `log_date=lte.${endYmd}T23:59:59.999`,
  ].join('&')
  const stockRows = (await supabaseSelectFilterAllPages('stock_logs', stockFilter, {
    select: 'log_date,location,vendor_target,item_code,qty,invoice_unit_price,unit_cost,reference_no',
    order: 'id.asc',
    pageSize: 5000,
    maxRows: 300000,
  })) as StockLogRow[]

  const hqByKey = new Map<string, { storeName: string; referenceNo: string; net: number }>()
  for (const r of stockRows || []) {
    const location = String(r.location || '').trim()
    if (!(isOfficeStore(location) || isHeadOfficeLikeStoreName(location) || location === '본사')) continue
    const storeName = String(r.vendor_target || '').trim()
    if (!storeName || !params.matchesStore(storeName)) continue
    const referenceNo = String(r.reference_no || '').trim()
    if (!referenceNo) continue
    const qtyAbs = Math.abs(Number(r.qty) || 0)
    if (qtyAbs <= 0) continue
    const itemCode = String(r.item_code || '').trim()
    const unit =
      Number(r.invoice_unit_price) > 0
        ? Number(r.invoice_unit_price)
        : Number(r.unit_cost) > 0
          ? Number(r.unit_cost)
          : itemCode
            ? Number(itemCostMap[itemCode] || 0)
            : 0
    const net = round2(qtyAbs * unit)
    if (net <= 0) continue
    const key = makeKey(storeName, referenceNo)
    const prev = hqByKey.get(key)
    hqByKey.set(key, {
      storeName,
      referenceNo,
      net: round2((prev?.net || 0) + net),
    })
  }

  const monthFilter = buildTaxMonthPostgrestFilter(months)
  const vatRows = (await supabaseSelectFilterAllPages('vat_ledger_entries', `direction=eq.input&${monthFilter}`, {
    select: 'store_name,invoice_number,net_amount,vat_amount,direction',
    order: 'id.asc',
    pageSize: 5000,
    maxRows: 300000,
  })) as VatLedgerLite[]

  const storeByKey = new Map<string, { net: number; vat: number }>()
  for (const r of vatRows || []) {
    const storeName = String(r.store_name || '').trim()
    if (!storeName || !params.matchesStore(storeName)) continue
    const referenceNo = String(r.invoice_number || '').trim()
    if (!referenceNo) continue
    const key = makeKey(storeName, referenceNo)
    const prev = storeByKey.get(key)
    const net = round2((prev?.net || 0) + (Number(r.net_amount) || 0))
    const vat = round2((prev?.vat || 0) + (Number(r.vat_amount) || 0))
    storeByKey.set(key, { net, vat })
  }

  const keys = new Set<string>([...hqByKey.keys(), ...storeByKey.keys()])
  let matchedCount = 0
  let missingInStoreCount = 0
  let extraInStoreCount = 0
  let diffCount = 0
  let hqIssuedNetTotal = 0
  let storeInputNetTotal = 0
  let storeInputVatTotal = 0
  const rows: IntercompanyVatReconcileRow[] = []

  for (const key of keys) {
    const hq = hqByKey.get(key)
    const st = storeByKey.get(key)
    const storeName = hq?.storeName || key.split('||')[0] || ''
    const referenceNo = hq?.referenceNo || key.split('||')[1] || ''
    const hqIssuedNet = round2(hq?.net || 0)
    const storeInputNet = round2(st?.net || 0)
    const storeInputVat = round2(st?.vat || 0)
    const diffNet = round2(storeInputNet - hqIssuedNet)
    hqIssuedNetTotal += hqIssuedNet
    storeInputNetTotal += storeInputNet
    storeInputVatTotal += storeInputVat

    if (hqIssuedNet > 0 && storeInputNet === 0) {
      missingInStoreCount += 1
      rows.push({
        storeName,
        referenceNo,
        hqIssuedNet,
        storeInputNet,
        storeInputVat,
        diffNet,
        status: 'missing_in_store_input',
      })
      continue
    }
    if (hqIssuedNet === 0 && storeInputNet > 0) {
      extraInStoreCount += 1
      rows.push({
        storeName,
        referenceNo,
        hqIssuedNet,
        storeInputNet,
        storeInputVat,
        diffNet,
        status: 'extra_in_store_input',
      })
      continue
    }
    if (Math.abs(diffNet) > 0.01) {
      diffCount += 1
      rows.push({
        storeName,
        referenceNo,
        hqIssuedNet,
        storeInputNet,
        storeInputVat,
        diffNet,
        status: 'net_diff',
      })
      continue
    }
    matchedCount += 1
  }

  rows.sort((a, b) => Math.abs(b.diffNet) - Math.abs(a.diffNet))
  return {
    months,
    storeFilter,
    issuedCount: hqByKey.size,
    matchedCount,
    missingInStoreCount,
    extraInStoreCount,
    diffCount,
    hqIssuedNetTotal: round2(hqIssuedNetTotal),
    storeInputNetTotal: round2(storeInputNetTotal),
    storeInputVatTotal: round2(storeInputVatTotal),
    diffNetTotal: round2(storeInputNetTotal - hqIssuedNetTotal),
    rows: rows.slice(0, 80),
  }
}

/** 해당 기간·매장에 본사 출고(세금계산서 reference) 이력이 있는지 — 대사 UI 노출 여부 판단용 */
export async function probeStoreHasHqOutboundSupply(params: {
  months: string[]
  matchesStore: (storeName: string) => boolean
}): Promise<boolean> {
  const months = (params.months || []).map((x) => String(x || '').slice(0, 7)).filter(Boolean)
  if (!months.length) return false

  const startYmd = monthStartYmd(months[0]!)
  const endYmd = monthEndYmd(months[months.length - 1]!)
  const stockFilter = [
    'log_type=in.(Outbound,ForceOutbound)',
    `log_date=gte.${startYmd}`,
    `log_date=lte.${endYmd}T23:59:59.999`,
  ].join('&')

  const pageSize = 2000
  const maxScan = 20000
  for (let start = 0; start < maxScan; start += pageSize) {
    const end = start + pageSize - 1
    const page = (await supabaseSelectFilterRange('stock_logs', stockFilter, {
      select: 'location,vendor_target,reference_no',
      order: 'id.asc',
      rangeStart: start,
      rangeEnd: end,
    })) as StockLogRow[] | null
    const rows = page || []
    if (!rows.length) break
    for (const r of rows) {
      const location = String(r.location || '').trim()
      if (!(isOfficeStore(location) || isHeadOfficeLikeStoreName(location) || location === '본사')) continue
      const storeName = String(r.vendor_target || '').trim()
      if (!storeName || !params.matchesStore(storeName)) continue
      const referenceNo = String(r.reference_no || '').trim()
      if (!referenceNo) continue
      return true
    }
    if (rows.length < pageSize) break
  }
  return false
}

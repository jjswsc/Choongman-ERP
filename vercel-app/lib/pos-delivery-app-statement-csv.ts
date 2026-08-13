/**
 * 배달앱 가맹점 명세서 CSV — Grab Transaction_Store 형식 (Thai/EN 헤더).
 * 브라우저에서 파싱해 ERP 일별과 대조한다.
 */
export type MerchantStatementApp = 'grab' | 'lineman' | 'shopee'

export type MerchantStatementKind = 'delivery' | 'dine' | 'adjust'

export type MerchantStatementDay = {
  date: string
  deliveryCount: number
  deliverySales: number
  inStoreCount: number
  inStoreSales: number
  adjustCount: number
  adjustSales: number
}

export type ParseMerchantStatementResult = {
  ok: true
  app: MerchantStatementApp
  storeLabel: string
  days: MerchantStatementDay[]
  totals: MerchantStatementDay
  skippedRows: number
  parsedRows: number
} | {
  ok: false
  message: string
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

function parseRfc4180Csv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const next = src[i + 1]
    if (inQuotes) {
      if (c === '"') {
        if (next === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      row.push(field)
      field = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
      if (c === '\r' && next === '\n') i++
    } else field += c
  }
  if (field.length || row.length) {
    row.push(field)
    if (row.some((x) => x !== '')) rows.push(row)
  }
  return rows
}

function normHeader(h: string): string {
  return String(h || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function headerIndex(headers: string[], preds: ((h: string) => boolean)[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = normHeader(headers[i] ?? '')
    if (preds.some((p) => p(h))) return i
  }
  return -1
}

export function parseMerchantStatementDate(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const dmy = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/)
  if (dmy) {
    const y = dmy[3].length === 2 ? (Number(dmy[3]) >= 50 ? `19${dmy[3]}` : `20${dmy[3]}`) : dmy[3]
    return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  const en = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/)
  if (en) {
    const month = MONTHS[en[2].toLowerCase()]
    if (!month) return ''
    return `${en[3]}-${String(month).padStart(2, '0')}-${en[1].padStart(2, '0')}`
  }
  return ''
}

function parseAmount(s: string): number {
  const cleaned = String(s || '')
    .replace(/[฿\s]/g, '')
    .replace(/,/g, '')
    .trim()
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function classifyGrabRow(params: {
  category: string
  sub: string
  shortId: string
}): MerchantStatementKind | 'skip' {
  const cat = `${params.category} ${params.sub}`.toLowerCase()
  const short = params.shortId.trim().toUpperCase()
  if (
    cat.includes('ปรับรายได้') ||
    cat.includes('chargeback') ||
    cat.includes('หักเงิน') ||
    cat.includes('adjustment')
  ) {
    return 'adjust'
  }
  if (cat.includes('ส่วนลดหน้าร้าน') || cat.includes('dine') || cat.includes('in-store') || short.startsWith('GD-')) {
    return 'dine'
  }
  if (cat.includes('ชำระเงิน') || cat.includes('completed') || short.startsWith('GF-')) {
    return 'delivery'
  }
  return 'skip'
}

function emptyDay(date: string): MerchantStatementDay {
  return {
    date,
    deliveryCount: 0,
    deliverySales: 0,
    inStoreCount: 0,
    inStoreSales: 0,
    adjustCount: 0,
    adjustSales: 0,
  }
}

function detectApp(headers: string[], sample: string): MerchantStatementApp | null {
  const blob = `${headers.join(' ')} ${sample}`.toLowerCase()
  if (
    headers.some((h) => /ยอดขายสุทธิ/.test(h)) &&
    headers.some((h) => /หมวดหมู่|category/.test(normHeader(h)))
  ) {
    return 'grab'
  }
  if (blob.includes('grabfood') || blob.includes('transaction_store') || blob.includes('merchant id')) {
    return 'grab'
  }
  if (blob.includes('line man') || blob.includes('lineman') || blob.includes('ไลน์แมน')) return 'lineman'
  if (blob.includes('shopee')) return 'shopee'
  return null
}

/**
 * Grab 가맹점 Transaction CSV (Transaction_Store_*.csv).
 * หมวดหมู่ ชำระเงิน = 배달, ส่วนลดหน้าร้าน = dine, การปรับรายได้ = 조정(대조에서 제외).
 */
export function parseMerchantStatementCsv(text: string): ParseMerchantStatementResult {
  const table = parseRfc4180Csv(text)
  if (table.length < 2) {
    return { ok: false, message: 'empty_csv' }
  }
  const headers = table[0] ?? []
  const app = detectApp(headers, table.slice(1, 4).flat().join(' '))
  if (app === 'lineman' || app === 'shopee') {
    return { ok: false, message: `unsupported_${app}` }
  }
  if (app !== 'grab') {
    return { ok: false, message: 'unrecognized_csv' }
  }

  const iDate = headerIndex(headers, [
    (h) => h.includes('วันที่สร้าง') || h === 'created on' || h.includes('created time'),
  ])
  const iCat = headerIndex(headers, [(h) => h.includes('หมวดหมู่') || h === 'category'])
  const iSub = headerIndex(headers, [(h) => h.includes('รายการย่อย') || h.includes('sub-category') || h.includes('subcategory')])
  const iNet = headerIndex(headers, [(h) => h.includes('ยอดขายสุทธิ') || h.includes('net sales')])
  const iShort = headerIndex(headers, [
    (h) => h.includes('รหัสคำสั่งซื้อสั้น') || h.includes('short order') || h.includes('order id'),
  ])
  const iStore = headerIndex(headers, [
    (h) => h.includes('ชื่อร้าน') || h === 'store name' || h.includes('outlet'),
  ])
  if (iDate < 0 || iCat < 0 || iNet < 0) {
    return { ok: false, message: 'missing_grab_columns' }
  }

  const days = new Map<string, MerchantStatementDay>()
  let skippedRows = 0
  let parsedRows = 0
  let storeLabel = ''

  for (let r = 1; r < table.length; r++) {
    const cols = table[r] ?? []
    const date = parseMerchantStatementDate(cols[iDate] ?? '')
    if (!date) {
      skippedRows += 1
      continue
    }
    const kind = classifyGrabRow({
      category: cols[iCat] ?? '',
      sub: iSub >= 0 ? cols[iSub] ?? '' : '',
      shortId: iShort >= 0 ? cols[iShort] ?? '' : '',
    })
    if (kind === 'skip') {
      skippedRows += 1
      continue
    }
    const net = parseAmount(cols[iNet] ?? '')
    if (!storeLabel && iStore >= 0) storeLabel = String(cols[iStore] ?? '').trim()
    const day = days.get(date) ?? emptyDay(date)
    if (kind === 'delivery') {
      day.deliveryCount += 1
      day.deliverySales = Math.round((day.deliverySales + net) * 100) / 100
    } else if (kind === 'dine') {
      day.inStoreCount += 1
      day.inStoreSales = Math.round((day.inStoreSales + net) * 100) / 100
    } else {
      day.adjustCount += 1
      day.adjustSales = Math.round((day.adjustSales + net) * 100) / 100
    }
    days.set(date, day)
    parsedRows += 1
  }

  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
  const totals = emptyDay('')
  for (const d of list) {
    totals.deliveryCount += d.deliveryCount
    totals.deliverySales = Math.round((totals.deliverySales + d.deliverySales) * 100) / 100
    totals.inStoreCount += d.inStoreCount
    totals.inStoreSales = Math.round((totals.inStoreSales + d.inStoreSales) * 100) / 100
    totals.adjustCount += d.adjustCount
    totals.adjustSales = Math.round((totals.adjustSales + d.adjustSales) * 100) / 100
  }

  return {
    ok: true,
    app: 'grab',
    storeLabel,
    days: list,
    totals,
    skippedRows,
    parsedRows,
  }
}

export type StatementCompareStatus = 'match' | 'mismatch' | 'csv_only' | 'erp_only'

export type StatementCompareDay = {
  date: string
  status: StatementCompareStatus
  csvDeliverySales: number
  erpDeliverySales: number
  deliverySalesDiff: number
  csvDeliveryCount: number
  erpDeliveryCount: number
  deliveryCountDiff: number
  csvInStoreSales: number
  erpInStoreSales: number
  inStoreSalesDiff: number
  csvInStoreCount: number
  erpInStoreCount: number
  inStoreCountDiff: number
  csvNet: number
  erpNet: number
  netDiff: number
  csvAdjustSales: number
}

const MONEY_TOLERANCE = 0.5

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export type ErpStatementDay = {
  date: string
  deliveryCount: number
  deliverySales: number
  inStoreCount: number
  inStoreSales: number
}

export function mergeErpStatementDays(
  rows: { appCode: string; days: ErpStatementDay[] }[],
  app: MerchantStatementApp
): ErpStatementDay[] {
  const map = new Map<string, ErpStatementDay>()
  for (const row of rows) {
    if (row.appCode !== app) continue
    for (const d of row.days) {
      const prev = map.get(d.date) ?? {
        date: d.date,
        deliveryCount: 0,
        deliverySales: 0,
        inStoreCount: 0,
        inStoreSales: 0,
      }
      prev.deliveryCount += d.deliveryCount
      prev.deliverySales = round2(prev.deliverySales + d.deliverySales)
      prev.inStoreCount += d.inStoreCount
      prev.inStoreSales = round2(prev.inStoreSales + d.inStoreSales)
      map.set(d.date, prev)
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function compareMerchantStatementToErp(
  csvDays: MerchantStatementDay[],
  erpDays: ErpStatementDay[]
): StatementCompareDay[] {
  const csvMap = new Map(csvDays.map((d) => [d.date, d]))
  const erpMap = new Map(erpDays.map((d) => [d.date, d]))
  const dates = [...new Set([...csvMap.keys(), ...erpMap.keys()])].sort()
  return dates.map((date) => {
    const csv = csvMap.get(date)
    const erp = erpMap.get(date)
    const csvDeliverySales = csv?.deliverySales ?? 0
    const erpDeliverySales = erp?.deliverySales ?? 0
    const csvDeliveryCount = csv?.deliveryCount ?? 0
    const erpDeliveryCount = erp?.deliveryCount ?? 0
    const csvInStoreSales = csv?.inStoreSales ?? 0
    const erpInStoreSales = erp?.inStoreSales ?? 0
    const csvInStoreCount = csv?.inStoreCount ?? 0
    const erpInStoreCount = erp?.inStoreCount ?? 0
    const csvNet = round2(csvDeliverySales + csvInStoreSales)
    const erpNet = round2(erpDeliverySales + erpInStoreSales)
    let status: StatementCompareStatus = 'match'
    if (csv && !erp) status = 'csv_only'
    else if (!csv && erp) status = 'erp_only'
    else {
      const moneyMismatch =
        Math.abs(csvDeliverySales - erpDeliverySales) > MONEY_TOLERANCE ||
        Math.abs(csvInStoreSales - erpInStoreSales) > MONEY_TOLERANCE
      const countMismatch = csvDeliveryCount !== erpDeliveryCount || csvInStoreCount !== erpInStoreCount
      if (moneyMismatch || countMismatch) status = 'mismatch'
    }
    return {
      date,
      status,
      csvDeliverySales,
      erpDeliverySales,
      deliverySalesDiff: round2(csvDeliverySales - erpDeliverySales),
      csvDeliveryCount,
      erpDeliveryCount,
      deliveryCountDiff: csvDeliveryCount - erpDeliveryCount,
      csvInStoreSales,
      erpInStoreSales,
      inStoreSalesDiff: round2(csvInStoreSales - erpInStoreSales),
      csvInStoreCount,
      erpInStoreCount,
      inStoreCountDiff: csvInStoreCount - erpInStoreCount,
      csvNet,
      erpNet,
      netDiff: round2(csvNet - erpNet),
      csvAdjustSales: csv?.adjustSales ?? 0,
    }
  })
}

export function summarizeStatementCompare(days: StatementCompareDay[]): {
  match: number
  mismatch: number
  csvOnly: number
  erpOnly: number
  mismatchDates: string[]
} {
  const mismatchDates: string[] = []
  let match = 0
  let mismatch = 0
  let csvOnly = 0
  let erpOnly = 0
  for (const d of days) {
    if (d.status === 'match') match += 1
    else if (d.status === 'mismatch') {
      mismatch += 1
      mismatchDates.push(d.date)
    } else if (d.status === 'csv_only') {
      csvOnly += 1
      mismatchDates.push(d.date)
    } else {
      erpOnly += 1
      mismatchDates.push(d.date)
    }
  }
  return { match, mismatch, csvOnly, erpOnly, mismatchDates }
}

import { stockLogBangkokDateRangeFilter } from '@/lib/bangkok-date'
import { getBangkokDateRangeUtc } from '@/lib/bangkok-time'
import { isOutboundLogDateInBangkokYmdRange } from '@/lib/hq-outbound-income-total'
import { formatDateBangkok, formatDateHourMinBangkok } from '@/lib/outbound-order-line-match'
import { supabaseRpc, supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

const HISTORY_ROW_LIMIT = 50000

export interface UsageHistoryRow {
  date: string
  dateTime: string
  item: string
  itemCode: string
  category: string
  qty: number
  amount: number
  userName?: string
  userNick?: string
}

export interface AdjustmentHistoryRow {
  date: string
  store: string
  item: string
  itemCode: string
  category: string
  spec: string
  diff: number
  vendorTarget: string
}

type UsageHistoryRpcRow = {
  date?: string
  date_time?: string
  item?: string
  item_code?: string
  category?: string
  qty?: number | string
  amount?: number | string
  user_name?: string | null
  user_nick?: string | null
}

type AdjustmentHistoryRpcRow = {
  date?: string
  store?: string
  item?: string
  item_code?: string
  category?: string
  spec?: string
  diff?: number | string
  vendor_target?: string
}

function bangkokUtcRange(startStr: string, endStr: string): {
  lo: string
  hi: string
  dayStartUtcIso: string
  nextDayStartUtcIso: string
} {
  const { lo, hi } = stockLogBangkokDateRangeFilter(startStr, endStr)
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(lo, hi)
  return { lo, hi, dayStartUtcIso, nextDayStartUtcIso }
}

function mapUsageRpcRow(row: UsageHistoryRpcRow): UsageHistoryRow {
  const userName = String(row.user_name || '').trim() || undefined
  const userNickRaw = String(row.user_nick || '').trim()
  return {
    date: String(row.date || '').trim(),
    dateTime: String(row.date_time || '').trim(),
    item: String(row.item || '').trim(),
    itemCode: String(row.item_code || '').trim(),
    category: String(row.category || '').trim(),
    qty: Math.abs(Number(row.qty) || 0),
    amount: Number(row.amount) || 0,
    userName,
    userNick: userNickRaw || userName,
  }
}

export async function fetchUsageHistoryRows(params: {
  store: string
  startStr: string
  endStr: string
}): Promise<UsageHistoryRow[]> {
  const store = String(params.store || '').trim()
  const startStr = String(params.startStr || '').trim()
  const endStr = String(params.endStr || '').trim()
  if (!store || !startStr || !endStr) return []

  const { dayStartUtcIso, nextDayStartUtcIso } = bangkokUtcRange(startStr, endStr)

  try {
    const rows = (await supabaseRpc<UsageHistoryRpcRow[]>('get_stock_logs_usage_history', {
      p_store: store,
      p_start: dayStartUtcIso,
      p_end_exclusive: nextDayStartUtcIso,
      p_limit: HISTORY_ROW_LIMIT,
      p_offset: 0,
    })) as UsageHistoryRpcRow[] | null
    if (Array.isArray(rows)) return rows.map(mapUsageRpcRow)
  } catch {
    // RPC 미배포 — PostgREST fallback
  }

  return fetchUsageHistoryFallback({ store, startStr, endStr })
}

async function fetchUsageHistoryFallback(params: {
  store: string
  startStr: string
  endStr: string
}): Promise<UsageHistoryRow[]> {
  const { store, startStr, endStr } = params
  const { lo, hi, gtePart, ltPart } = stockLogBangkokDateRangeFilter(startStr, endStr)
  const filter = [
    `location=ilike.${encodeURIComponent(store)}`,
    'log_type=eq.Usage',
    gtePart,
    ltPart,
  ].join('&')

  const [itemRows, logs] = await Promise.all([
    supabaseSelect('items', { order: 'id.asc', select: 'code,price,category' }) as Promise<
      { code?: string; price?: number; category?: string }[]
    >,
    supabaseSelectFilter('stock_logs', filter, {
      order: 'log_date.desc',
      limit: HISTORY_ROW_LIMIT,
      select: 'log_date,item_code,item_name,qty,user_name',
    }) as Promise<
      { log_date?: string; item_code?: string; item_name?: string; qty?: number; user_name?: string }[]
    >,
  ])

  const priceByCode: Record<string, number> = {}
  const categoryByCode: Record<string, string> = {}
  for (const it of itemRows || []) {
    const code = String(it.code || '')
    priceByCode[code] = Number(it.price) || 0
    categoryByCode[code] = String(it.category || '').trim()
  }

  const nameToNick: Record<string, string> = {}
  try {
    const empFilter = `store=eq.${encodeURIComponent(store)}`
    const emps = (await supabaseSelectFilter('employees', empFilter, {
      select: 'name,nick',
      limit: 2000,
    })) as { name?: string; nick?: string }[]
    for (const e of emps || []) {
      const n = String(e.name || '').trim()
      if (n) nameToNick[n] = String(e.nick || e.name || '').trim() || n
    }
  } catch {
    /* nick optional */
  }

  const list: UsageHistoryRow[] = []
  for (const row of logs || []) {
    if (!isOutboundLogDateInBangkokYmdRange(row.log_date, lo, hi)) continue
    const rowDate = new Date(row.log_date || '')
    if (isNaN(rowDate.getTime())) continue
    const qty = Math.abs(Number(row.qty) || 0)
    const code = String(row.item_code || '').trim()
    const userName = String(row.user_name || '').trim() || undefined
    const userNick = userName ? nameToNick[userName] : undefined
    list.push({
      date: formatDateBangkok(rowDate),
      dateTime: formatDateHourMinBangkok(rowDate),
      item: String(row.item_name || '').trim(),
      itemCode: code,
      category: categoryByCode[code] || '',
      qty,
      amount: (priceByCode[code] ?? 0) * qty,
      userName,
      userNick,
    })
  }
  return list
}

function mapAdjustmentRpcRow(row: AdjustmentHistoryRpcRow): AdjustmentHistoryRow {
  return {
    date: String(row.date || '').trim(),
    store: String(row.store || '').trim(),
    item: String(row.item || '-').trim() || '-',
    itemCode: String(row.item_code || '').trim(),
    category: String(row.category || '').trim(),
    spec: String(row.spec || '-').trim() || '-',
    diff: Number(row.diff) || 0,
    vendorTarget: String(row.vendor_target || '').trim(),
  }
}

export async function fetchAdjustmentHistoryRows(params: {
  startStr: string
  endStr: string
  storeFilter: string
}): Promise<AdjustmentHistoryRow[]> {
  const startStr = String(params.startStr || '').trim()
  const endStr = String(params.endStr || '').trim()
  const storeFilter = String(params.storeFilter || '').trim()
  if (!startStr || !endStr) return []

  const { dayStartUtcIso, nextDayStartUtcIso } = bangkokUtcRange(startStr, endStr)
  const storeArg =
    !storeFilter || storeFilter.toLowerCase() === 'all' ? null : storeFilter

  try {
    const rows = (await supabaseRpc<AdjustmentHistoryRpcRow[]>('get_stock_logs_adjustment_history', {
      p_store_filter: storeArg,
      p_start: dayStartUtcIso,
      p_end_exclusive: nextDayStartUtcIso,
      p_limit: HISTORY_ROW_LIMIT,
      p_offset: 0,
    })) as AdjustmentHistoryRpcRow[] | null
    if (Array.isArray(rows)) return rows.map(mapAdjustmentRpcRow)
  } catch {
    // RPC 미배포 — PostgREST fallback
  }

  return fetchAdjustmentHistoryFallback({ startStr, endStr, storeFilter })
}

async function fetchAdjustmentHistoryFallback(params: {
  startStr: string
  endStr: string
  storeFilter: string
}): Promise<AdjustmentHistoryRow[]> {
  const { startStr, endStr, storeFilter } = params
  const { lo, hi, gtePart, ltPart } = stockLogBangkokDateRangeFilter(startStr, endStr)
  const filterParts = ['log_type=eq.Adjustment', gtePart, ltPart]
  if (storeFilter && storeFilter.toLowerCase() !== 'all') {
    filterParts.push(`location=ilike.${encodeURIComponent(storeFilter)}`)
  }

  const [itemRows, logs] = await Promise.all([
    supabaseSelect('items', { order: 'id.asc', limit: 5000, select: 'code,spec,category' }) as Promise<
      { code?: string; spec?: string; category?: string }[]
    >,
    supabaseSelectFilter('stock_logs', filterParts.join('&'), {
      order: 'log_date.desc',
      limit: HISTORY_ROW_LIMIT,
      select: 'log_date,location,item_code,item_name,qty,vendor_target',
    }) as Promise<
      {
        log_date?: string
        location?: string
        item_code?: string
        item_name?: string
        qty?: number
        vendor_target?: string
      }[]
    >,
  ])

  const specMap: Record<string, string> = {}
  const categoryMap: Record<string, string> = {}
  for (const r of itemRows || []) {
    if (r?.code) {
      specMap[r.code] = r.spec || '-'
      categoryMap[r.code] = String(r.category || '').trim()
    }
  }

  const list: AdjustmentHistoryRow[] = []
  for (const row of logs || []) {
    if (!isOutboundLogDateInBangkokYmdRange(row.log_date, lo, hi)) continue
    const rowDate = row.log_date ? new Date(row.log_date) : null
    if (!rowDate || isNaN(rowDate.getTime())) continue

    const store = String(row.location || '')
    if (storeFilter && storeFilter.toLowerCase() !== 'all' && store.toLowerCase() !== storeFilter.toLowerCase()) {
      continue
    }

    const itemCode = String(row.item_code || '').trim()
    list.push({
      date: formatDateBangkok(rowDate),
      store,
      item: row.item_name || '-',
      itemCode,
      category: categoryMap[itemCode] || '',
      spec: specMap[itemCode] || '-',
      diff: Number(row.qty) || 0,
      vendorTarget: String(row.vendor_target || '').trim(),
    })
  }
  return list
}

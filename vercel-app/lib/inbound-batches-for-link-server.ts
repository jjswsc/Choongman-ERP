import { supabaseSelectFilter } from '@/lib/supabase-server'
import { postgrestQuotedInList } from '@/lib/office-store-canonical'

const INBOUND_LINK_REMAIN_EPS = 0.01
const INBOUND_BATCH_VENDOR_LIMIT = 500

export type InboundBatchLinkRow = {
  id?: number
  batch_date?: string
  vendor_name?: string
  vendor_code?: string
  total_amount?: number
  location?: string
}

/**
 * PostgREST or=(vendor_code.in.("X","Y"),vendor_name.in.("X","Y")).
 * PostgREST는 URL 디코딩 후 논리 트리를 파싱하므로 %2C 인코딩만으로는 `Co.,Ltd.`의 쉼표·괄호가
 * 구분자로 해석된다 — 값은 반드시 큰따옴표로 감싼다.
 */
export function buildInboundVendorOrFilter(matchValues: string[]): string {
  const values: string[] = []
  const seen = new Set<string>()
  for (const raw of matchValues) {
    const trimmed = String(raw || '').trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    values.push(encodeURIComponent(postgrestQuotedInList([trimmed])))
  }
  if (!values.length) return ''
  const list = values.join(',')
  return `&or=(vendor_code.in.(${list}),vendor_name.in.(${list}))`
}

export async function resolveInboundVendorMatchValues(
  vendorCode: string,
  vendorName: string
): Promise<string[]> {
  const matchValues: string[] = []
  if (vendorCode) {
    matchValues.push(vendorCode)
    try {
      const vendorRows = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(vendorCode)}`, {
        select: 'code,name,gps_name',
        limit: 1,
      })) as { code?: string; name?: string; gps_name?: string }[]
      if (vendorRows?.[0]) {
        const v = vendorRows[0]
        const vn = String(v.name || '').trim()
        const gn = String(v.gps_name || '').trim()
        if (vn && !matchValues.includes(vn)) matchValues.push(vn)
        if (gn && !matchValues.includes(gn)) matchValues.push(gn)
      }
    } catch {
      /* vendors 없으면 code만 사용 */
    }
  } else if (vendorName) {
    matchValues.push(vendorName)
  }
  return matchValues
}

export async function loadInboundLinkedAmountByBatchId(batchIds: number[]): Promise<Map<number, number>> {
  const unique = [...new Set(batchIds.filter((id) => id > 0))]
  const out = new Map<number, number>()
  if (!unique.length) return out

  const chunkSize = 200
  try {
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize)
      const rows = (await supabaseSelectFilter(
        'bank_transaction_inbound_links',
        `inbound_batch_id=in.(${chunk.join(',')})`,
        { select: 'inbound_batch_id,amount', limit: 5000 }
      )) as { inbound_batch_id?: number; amount?: number }[] | null
      for (const row of rows || []) {
        const batchId = Number(row.inbound_batch_id || 0)
        if (!batchId) continue
        out.set(batchId, (out.get(batchId) || 0) + (Number(row.amount) || 0))
      }
    }
  } catch {
    return out
  }
  return out
}

export function inboundBatchRemainingAmount(
  totalAmount: number,
  linkedAmount: number
): number {
  return Math.max(0, Math.round((totalAmount - linkedAmount) * 100) / 100)
}

/** 미연동(잔액) 배치를 먼저, 동일 그룹 내에서는 최신 입고일 우선 */
export function sortInboundBatchesForLink(
  rows: InboundBatchLinkRow[],
  linkedByBatchId: ReadonlyMap<number, number>
): InboundBatchLinkRow[] {
  return [...rows].sort((a, b) => {
    const idA = Number(a.id || 0)
    const idB = Number(b.id || 0)
    const totalA = Number(a.total_amount) || 0
    const totalB = Number(b.total_amount) || 0
    const remA = inboundBatchRemainingAmount(totalA, linkedByBatchId.get(idA) || 0)
    const remB = inboundBatchRemainingAmount(totalB, linkedByBatchId.get(idB) || 0)
    const unpaidA = remA > INBOUND_LINK_REMAIN_EPS
    const unpaidB = remB > INBOUND_LINK_REMAIN_EPS
    if (unpaidA !== unpaidB) return unpaidA ? -1 : 1
    const dateCmp = String(b.batch_date || '').localeCompare(String(a.batch_date || ''))
    if (dateCmp !== 0) return dateCmp
    return remB - remA
  })
}

export { INBOUND_BATCH_VENDOR_LIMIT, INBOUND_LINK_REMAIN_EPS }

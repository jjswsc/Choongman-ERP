/**
 * receivable_transactions(Order) 배치를 출고 로그 기준(syncReceivableToOutboundView)으로 재동기화
 * 마지막 배치에서 HQ 강제출고(ForceOutbound) 미수금도 동일 출고 규칙으로 일괄 맞춤
 */
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { syncReceivableToOutboundView } from '@/lib/receivable-match-outbound'
import { orderIdFromReceivableOrderRow } from '@/lib/receivable-order-id-parse'
import { reconcileAllForceOutboundReceivables } from '@/lib/force-outbound-receivable'

function normalizeStoreKey(v: string): string {
  const raw = String(v || '').trim().toLowerCase()
  if (!raw) return ''
  const noSpace = raw.replace(/\s+/g, ' ')
  return noSpace.startsWith('cm ') ? noSpace.slice(3).trim() : noSpace
}

function normalizeVendorCode(v: string): string {
  return String(v || '').trim().toLowerCase()
}

async function getReceivableStoreAliasSetByVendorCode(vendorCodeFilter: string): Promise<Set<string>> {
  const code = normalizeVendorCode(vendorCodeFilter)
  if (!code) return new Set<string>()
  const vendors = (await supabaseSelectFilter(
    'vendors',
    `code=eq.${encodeURIComponent(code)}`,
    { select: 'code,name,gps_name', limit: 1 }
  )) as { code?: string; name?: string; gps_name?: string }[] | null
  const v = vendors?.[0]
  if (!v) return new Set<string>()
  const aliases = new Set<string>()
  const name = normalizeStoreKey(String(v.name || ''))
  const gps = normalizeStoreKey(String(v.gps_name || ''))
  if (name) aliases.add(name)
  if (gps) aliases.add(gps)
  return aliases
}

function matchesStoreAliasOrExactName(
  storeName: string | null | undefined,
  rawFilter: string,
  aliasesByVendorCode: Set<string>
): boolean {
  const storeNorm = normalizeStoreKey(String(storeName || ''))
  if (!storeNorm) return false
  if (aliasesByVendorCode.size > 0) return aliasesByVendorCode.has(storeNorm)
  return storeNorm === normalizeStoreKey(rawFilter)
}

export type BulkOutboundStats = {
  processed: number
  updated: number
  removed: number
  skipped: number
  errors: number
  cartFallback: number
  /** 마지막 배치에서만 채워짐 — 강제출고 stock_logs 기준 미수금 맞춤 */
  forceOutboundProcessed?: number
  forceOutboundErrors?: number
}

export type BulkOutboundBatchResult = {
  nextReceivableId: number
  hasMore: boolean
  stats: BulkOutboundStats
  errorSamples: { orderId: number; message: string }[]
}

export async function reconcileOrderReceivablesOutboundBatch(params: {
  lastReceivableId: number
  batchSize: number
  storeFilter?: string
}): Promise<BulkOutboundBatchResult> {
  const { lastReceivableId, storeFilter } = params
  const batchSize = Math.min(Math.max(params.batchSize, 1), 250)
  const normalizedStoreFilter = String(storeFilter || '').trim()
  const aliasSetByVendorCode = normalizedStoreFilter
    ? await getReceivableStoreAliasSetByVendorCode(normalizedStoreFilter)
    : new Set<string>()

  const stats: BulkOutboundStats = {
    processed: 0,
    updated: 0,
    removed: 0,
    skipped: 0,
    errors: 0,
    cartFallback: 0,
  }
  const errorSamples: { orderId: number; message: string }[] = []

  const filter = `ref_type=eq.Order&id=gt.${Number(lastReceivableId) || 0}`

  const recRows = (await supabaseSelectFilter('receivable_transactions', filter, {
    select: 'id,ref_id,invoice_no,memo,store_name',
    order: 'id.asc',
    limit: batchSize,
  })) as { id?: number; ref_id?: number; invoice_no?: string | null; memo?: string | null; store_name?: string | null }[]

  if (!recRows?.length) {
    const fo = await reconcileAllForceOutboundReceivables({ storeFilter })
    stats.forceOutboundProcessed = fo.processed
    stats.forceOutboundErrors = fo.errors
    return { nextReceivableId: lastReceivableId, hasMore: false, stats, errorSamples }
  }

  const scopedRecRows = normalizedStoreFilter
    ? (recRows || []).filter((r) =>
        matchesStoreAliasOrExactName(r.store_name, normalizedStoreFilter, aliasSetByVendorCode)
      )
    : recRows

  const nextReceivableId = Number(recRows[recRows.length - 1]?.id ?? lastReceivableId)
  const hasMore = recRows.length >= batchSize

  const seenOrder = new Set<number>()
  const uniqueIds: number[] = []
  for (const r of scopedRecRows) {
    const oid = orderIdFromReceivableOrderRow(r)
    if (oid == null) continue
    if (seenOrder.has(oid)) continue
    seenOrder.add(oid)
    uniqueIds.push(oid)
  }

  for (const orderId of uniqueIds) {
    const r = await syncReceivableToOutboundView(orderId)
    stats.processed += 1
    if (!r.ok) {
      const msg = r.message || 'fail'
      if (msg.includes('수령 완료')) {
        stats.skipped += 1
      } else {
        stats.errors += 1
        if (errorSamples.length < 8) errorSamples.push({ orderId, message: msg })
      }
      continue
    }
    if (r.usedCartFallback) stats.cartFallback += 1
    if (r.removed) stats.removed += 1
    else stats.updated += 1
  }

  if (!hasMore) {
    const fo = await reconcileAllForceOutboundReceivables({ storeFilter })
    stats.forceOutboundProcessed = fo.processed
    stats.forceOutboundErrors = fo.errors
  }

  return { nextReceivableId, hasMore, stats, errorSamples }
}

/**
 * receivable_transactions(Order) 배치를 출고 로그 기준(syncReceivableToOutboundView)으로 재동기화
 */
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { syncReceivableToOutboundView } from '@/lib/receivable-match-outbound'
import { orderIdFromReceivableOrderRow } from '@/lib/receivable-order-id-parse'

export type BulkOutboundStats = {
  processed: number
  updated: number
  removed: number
  skipped: number
  errors: number
  cartFallback: number
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

  const stats: BulkOutboundStats = {
    processed: 0,
    updated: 0,
    removed: 0,
    skipped: 0,
    errors: 0,
    cartFallback: 0,
  }
  const errorSamples: { orderId: number; message: string }[] = []

  let filter = `ref_type=eq.Order&id=gt.${Number(lastReceivableId) || 0}`
  if (storeFilter?.trim()) {
    filter += `&store_name=ilike.${encodeURIComponent(storeFilter.trim())}`
  }

  const recRows = (await supabaseSelectFilter('receivable_transactions', filter, {
    select: 'id,ref_id,invoice_no,memo',
    order: 'id.asc',
    limit: batchSize,
  })) as { id?: number; ref_id?: number; invoice_no?: string | null; memo?: string | null }[]

  if (!recRows?.length) {
    return { nextReceivableId: lastReceivableId, hasMore: false, stats, errorSamples }
  }

  const nextReceivableId = Number(recRows[recRows.length - 1]?.id ?? lastReceivableId)
  const hasMore = recRows.length >= batchSize

  const seenOrder = new Set<number>()
  const uniqueIds: number[] = []
  for (const r of recRows) {
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

  return { nextReceivableId, hasMore, stats, errorSamples }
}

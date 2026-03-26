/**
 * receivable_transactions(ref_type=Order)를 id 순으로 훑으며 고유 주문별 재동기화 (누락 없음)
 */
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'
import { upsertReceivableFromOrder } from '@/lib/receivable-payable'
import { computeOrderHqReceivableTotalWithMap, type OrderCartLine } from '@/lib/order-receivable-hq'
import { getDirectSettlementMap } from '@/lib/direct-settlement-server'

const TZ = 'Asia/Bangkok'

export type BulkReconcileStats = {
  processed: number
  updated: number
  removed: number
  skipped: number
  orphanRemoved: number
  errors: number
}

export type BulkReconcileBatchResult = {
  nextReceivableId: number
  hasMore: boolean
  stats: BulkReconcileStats
  errorSamples: { orderId: number; message: string }[]
}

function todayBangkok(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

export async function reconcileOrderReceivablesBatch(params: {
  /** 이전 배치의 마지막 receivable_transactions.id (첫 호출 0) */
  lastReceivableId: number
  batchSize: number
  storeFilter?: string
}): Promise<BulkReconcileBatchResult> {
  const { lastReceivableId, storeFilter } = params
  const batchSize = Math.min(Math.max(params.batchSize, 1), 250)

  const stats: BulkReconcileStats = {
    processed: 0,
    updated: 0,
    removed: 0,
    skipped: 0,
    orphanRemoved: 0,
    errors: 0,
  }
  const errorSamples: { orderId: number; message: string }[] = []

  let filter = `ref_type=eq.Order&ref_id=not.is.null&id=gt.${Number(lastReceivableId) || 0}`
  if (storeFilter?.trim()) {
    filter += `&store_name=ilike.${encodeURIComponent(storeFilter.trim())}`
  }

  const recRows = (await supabaseSelectFilter('receivable_transactions', filter, {
    select: 'id,ref_id,trans_date,store_name',
    order: 'id.asc',
    limit: batchSize,
  })) as { id?: number; ref_id?: number; trans_date?: string; store_name?: string }[]

  if (!recRows?.length) {
    return { nextReceivableId: lastReceivableId, hasMore: false, stats, errorSamples }
  }

  const nextReceivableId = Number(recRows[recRows.length - 1]?.id ?? lastReceivableId)
  const hasMore = recRows.length >= batchSize

  const transByOrder = new Map<number, string>()
  const storeByOrder = new Map<number, string>()
  const uniqueIds: number[] = []
  const seenRef = new Set<number>()

  for (const r of recRows) {
    const rid = Number(r.ref_id)
    if (!rid || Number.isNaN(rid)) continue
    if (!transByOrder.has(rid)) {
      const td = String(r.trans_date || '').slice(0, 10)
      transByOrder.set(rid, td || todayBangkok())
      storeByOrder.set(rid, String(r.store_name || '').trim())
    }
    if (!seenRef.has(rid)) {
      seenRef.add(rid)
      uniqueIds.push(rid)
    }
  }

  if (uniqueIds.length === 0) {
    return { nextReceivableId, hasMore, stats, errorSamples }
  }

  const idList = uniqueIds.join(',')
  const orders = (await supabaseSelectFilter('orders', `id=in.(${idList})`, {
    select: 'id,store_name,cart_json,delivery_status',
    limit: uniqueIds.length,
  })) as {
    id?: number
    store_name?: string
    cart_json?: string
    delivery_status?: string
  }[]

  const orderMap = new Map<number, (typeof orders)[0]>()
  for (const o of orders || []) {
    if (o.id != null) orderMap.set(Number(o.id), o)
  }

  const allCodes = new Set<string>()
  for (const oid of uniqueIds) {
    const o = orderMap.get(oid)
    if (!o) continue
    let cart: OrderCartLine[] = []
    try {
      cart = JSON.parse((o.cart_json as string) || '[]')
    } catch {
      cart = []
    }
    for (const it of cart) {
      const c = String(it.code || '').trim()
      if (c) allCodes.add(c)
    }
  }

  const directMap =
    allCodes.size > 0 ? await getDirectSettlementMap([...allCodes]) : ({} as Record<string, boolean>)

  for (const orderId of uniqueIds) {
    const o = orderMap.get(orderId)
    const transDate = transByOrder.get(orderId) || todayBangkok()

    if (!o?.id) {
      try {
        await supabaseDeleteByFilter('receivable_transactions', `ref_type=eq.Order&ref_id=eq.${orderId}`)
        stats.orphanRemoved += 1
        stats.processed += 1
      } catch (e) {
        stats.errors += 1
        if (errorSamples.length < 8) {
          errorSamples.push({
            orderId,
            message: e instanceof Error ? e.message : String(e),
          })
        }
      }
      continue
    }

    const ds = String(o.delivery_status || '')
    if (ds !== '배송완료' && ds !== '일부배송완료') {
      stats.skipped += 1
      stats.processed += 1
      continue
    }

    let cart: OrderCartLine[] = []
    try {
      cart = JSON.parse((o.cart_json as string) || '[]')
    } catch {
      cart = []
    }

    const { totalHQ } = computeOrderHqReceivableTotalWithMap(cart, directMap)
    let storeName = String(o.store_name || '').trim()
    if (totalHQ > 0 && !storeName) {
      storeName = storeByOrder.get(orderId) || ''
    }
    if (totalHQ > 0 && !storeName) {
      stats.errors += 1
      stats.processed += 1
      if (errorSamples.length < 8) {
        errorSamples.push({ orderId, message: 'no_store_name' })
      }
      continue
    }

    try {
      await upsertReceivableFromOrder({
        orderId,
        storeName: storeName || '—',
        total: totalHQ,
        transDate,
      })
      stats.processed += 1
      if (totalHQ <= 0) stats.removed += 1
      else stats.updated += 1
    } catch (e) {
      stats.errors += 1
      stats.processed += 1
      if (errorSamples.length < 8) {
        errorSamples.push({
          orderId,
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  return {
    nextReceivableId,
    hasMore,
    stats,
    errorSamples,
  }
}

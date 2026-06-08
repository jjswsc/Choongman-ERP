/**
 * 오프라인 큐에만 있는 savePosOrder(LOCAL 주문)에 결제·품목 등을 합쳐
 * 동기화 시 한 번의 insert 로 반영되게 한다.
 */

import { getAllPending, removeFromQueue, updateQueueItem, type PendingRequest } from './queue'

export async function findPendingSavePosOrderByLocalOrderNo(
  localOrderNo: string
): Promise<PendingRequest | null> {
  const want = String(localOrderNo ?? '').trim()
  if (!want.startsWith('LOCAL-') && !want.startsWith('pos-')) return null
  const list = await getAllPending()
  for (const item of list) {
    if (item.api !== '/api/savePosOrder') continue
    const metaNo = String(item.metadata?.localOrderNo ?? '').trim()
    if (metaNo === want) return item
  }
  return null
}

export async function removeQueuedSavePosOrderByLocalOrderNo(localOrderNo: string): Promise<boolean> {
  const item = await findPendingSavePosOrderByLocalOrderNo(localOrderNo)
  if (!item) return false
  await removeFromQueue(item.id)
  return true
}

export async function mergeQueuedSavePosOrderByLocalOrderNo(
  localOrderNo: string,
  merge: (body: Record<string, unknown>) => Record<string, unknown>
): Promise<boolean> {
  const want = String(localOrderNo ?? '').trim()
  /** 큐 메타는 `LOCAL-*`(전통) 또는 `pos-*`(클라이언트 멱등 키) */
  if (!want.startsWith('LOCAL-') && !want.startsWith('pos-')) return false
  const list = await getAllPending()
  for (const item of list) {
    if (item.api !== '/api/savePosOrder') continue
    const metaNo = String(item.metadata?.localOrderNo ?? '').trim()
    if (metaNo !== want) continue
    let body: Record<string, unknown>
    try {
      body = JSON.parse(item.body || '{}') as Record<string, unknown>
    } catch {
      return false
    }
    const next = merge(body)
    await updateQueueItem(item.id, { body: JSON.stringify(next) })
    return true
  }
  return false
}

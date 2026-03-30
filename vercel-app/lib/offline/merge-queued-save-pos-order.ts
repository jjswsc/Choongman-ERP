/**
 * 오프라인 큐에만 있는 savePosOrder(LOCAL 주문)에 결제·품목 등을 합쳐
 * 동기화 시 한 번의 insert 로 반영되게 한다.
 */

import { getAllPending, updateQueueItem } from './queue'

export async function mergeQueuedSavePosOrderByLocalOrderNo(
  localOrderNo: string,
  merge: (body: Record<string, unknown>) => Record<string, unknown>
): Promise<boolean> {
  const want = String(localOrderNo ?? '').trim()
  if (!want.startsWith('LOCAL-')) return false
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

import { extractGrabOrderIdFromMemo, extractGrabStateFromMemo } from '@/lib/grab-order-memo'

function isCancelledPosStatus(status: string): boolean {
  const s = String(status || '').trim().toLowerCase()
  return s === 'cancelled' || s === 'canceled' || s === 'refunded'
}

function isGrabCancelledState(state: string | null | undefined): boolean {
  const s = String(state || '').trim().toUpperCase()
  return s === 'CANCELLED' || s === 'FAILED'
}

/** Grab 웹훅(고객 취소)으로 pos_orders가 바뀐 UPDATE인지 */
export function isGrabCustomerCancelPosOrderUpdate(
  row: Record<string, unknown>,
  oldRow?: Record<string, unknown>
): boolean {
  const memo = String(row.memo ?? '')
  if (!extractGrabOrderIdFromMemo(memo)) return false
  if (String(row.order_type ?? '').trim().toLowerCase() !== 'delivery') return false

  const newStatus = String(row.status ?? '').trim().toLowerCase()
  const oldStatus = String(oldRow?.status ?? '').trim().toLowerCase()
  const statusBecameCancelled =
    isCancelledPosStatus(newStatus) && !isCancelledPosStatus(oldStatus)

  const newGrabState = extractGrabStateFromMemo(memo)
  const oldGrabState = extractGrabStateFromMemo(String(oldRow?.memo ?? ''))
  const memoBecameCancelled =
    isGrabCancelledState(newGrabState) && !isGrabCancelledState(oldGrabState)

  return statusBecameCancelled || memoBecameCancelled
}

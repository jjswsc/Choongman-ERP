import { TAX_INVOICE_MARKER } from '@/lib/pos-tax-invoice'

/** pos_orders.memo에 저장하는 Grab 주문 앵커(세금계산서 마커 앞에 둠) */
export function buildGrabOrderMemo(orderID: string, grabState?: string | null): string {
  const id = String(orderID || '').trim()
  if (!id) return ''
  let base = `grab_order:${id}`
  const st = String(grabState || '').trim()
  if (st) base += `|grab_state:${st}`
  return base
}

/** PostgREST `ilike` — SQL LIKE 와일드카드는 `%` (`*` 아님). */
export function grabOrderMemoPostgrestIlikeFilter(orderID: string): string {
  const id = String(orderID || '').trim()
  if (!id) return 'memo=eq.'
  return `memo=ilike.${encodeURIComponent(`%grab_order:${id}%`)}`
}

export function extractGrabOrderIdFromMemo(memo: string): string {
  const m = /grab_order:([A-Za-z0-9._:-]+)/i.exec(String(memo || ''))
  return (m?.[1] || '').trim()
}

export function extractGrabStateFromMemo(memo: string): string | null {
  const m = /\|grab_state:([A-Za-z0-9._-]+)/i.exec(String(memo || ''))
  const s = (m?.[1] || '').trim()
  return s || null
}

/** 기존 memo(세금계산서 꼬리 포함)에서 grab_state만 교체 */
export function mergeGrabStateIntoFullMemo(fullMemo: string, orderID: string, newState: string): string {
  const raw = String(fullMemo || '')
  const markerIdx = raw.indexOf(TAX_INVOICE_MARKER)
  const tail = markerIdx >= 0 ? raw.slice(markerIdx) : ''
  return buildGrabOrderMemo(orderID, newState) + tail
}

/**
 * updatePosOrder 등에서 요청 memo가 `grab_order:` 앵커를 빠뜨려도 DB memo의 Grab 연동 토큰을 유지한다.
 * (결제 UI가 plainMemo만 보내 memo를 비우는 경우 — Grab push order state 조회 실패 방지)
 */
export function preserveGrabDeliveryMemoAnchor(incomingMemo: string, existingMemo: string): string {
  const incomingRaw = String(incomingMemo ?? '')
  const existing = String(existingMemo ?? '')
  const grabId = extractGrabOrderIdFromMemo(existing)
  if (!grabId) return incomingRaw.trim()
  if (extractGrabOrderIdFromMemo(incomingRaw)) return incomingRaw.trim()

  const grabState = extractGrabStateFromMemo(existing)
  const anchor = buildGrabOrderMemo(grabId, grabState)

  if (!incomingRaw.trim()) {
    return mergeGrabStateIntoFullMemo(existing, grabId, grabState || '')
  }

  const markerIdx = incomingRaw.indexOf(TAX_INVOICE_MARKER)
  if (markerIdx >= 0) {
    const before = incomingRaw.slice(0, markerIdx).trim()
    const taxTail = incomingRaw.slice(markerIdx)
    return before ? `${anchor}\n${before} ${taxTail}`.trim() : `${anchor} ${taxTail}`.trim()
  }
  return `${anchor}\n${incomingRaw.trim()}`.trim()
}

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

/**
 * 발주 내역 → 작성 탭으로 Draft PO를 넘길 때 사용.
 * 탭 전환으로 작성 화면이 remount 되므로, 모듈 버퍼 + 구독으로 전달한다.
 */

import type { PurchaseOrderRow } from "@/lib/api-client"

let pending: PurchaseOrderRow | null = null
const listeners = new Set<() => void>()

export function requestPurchaseOrderEdit(po: PurchaseOrderRow): void {
  pending = po
  listeners.forEach((fn) => fn())
}

export function consumePurchaseOrderEditRequest(): PurchaseOrderRow | null {
  const po = pending
  pending = null
  return po
}

export function subscribePurchaseOrderEditRequest(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

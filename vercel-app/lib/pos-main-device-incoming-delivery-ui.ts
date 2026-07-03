import type { IncomingDeliveryFocusParams } from '@/lib/pos-main-device-sync-types'

type IncomingDeliveryUiHandler = (params: IncomingDeliveryFocusParams) => void

let incomingDeliveryUiHandler: IncomingDeliveryUiHandler | null = null

export function setIncomingDeliveryUiHandler(fn: IncomingDeliveryUiHandler | null): void {
  incomingDeliveryUiHandler = fn
}

export function notifyIncomingDeliveryUi(params: IncomingDeliveryFocusParams): void {
  incomingDeliveryUiHandler?.(params)
}

export function hasIncomingDeliveryUiHandler(): boolean {
  return incomingDeliveryUiHandler != null
}

export type GrabCancelUiParams = {
  orderId: number
  tableName?: string
  orderNo?: string
}

type GrabCancelUiHandler = (params: GrabCancelUiParams) => void

let grabCancelUiHandler: GrabCancelUiHandler | null = null

export function setGrabCancelUiHandler(fn: GrabCancelUiHandler | null): void {
  grabCancelUiHandler = fn
}

export function notifyGrabCancelUi(params: GrabCancelUiParams): void {
  grabCancelUiHandler?.(params)
}

export function hasGrabCancelUiHandler(): boolean {
  return grabCancelUiHandler != null
}

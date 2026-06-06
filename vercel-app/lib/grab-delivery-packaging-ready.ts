import { grabMarkOrderReadyApi, updatePosOrderStatus } from '@/lib/api-client'

export type MarkPosDeliveryPackagedResult = {
  posOk: boolean
  grabOk: boolean
  grabError?: string
}

/** POS `ready` + Grab `markOrderReady`(markStatus 1). Grab id 없으면 POS만 처리. */
export async function markPosDeliveryPackagedWithGrab(params: {
  orderId: number
  grabOrderId?: string | null
}): Promise<MarkPosDeliveryPackagedResult> {
  const orderId = Math.floor(Number(params.orderId))
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return { posOk: false, grabOk: false, grabError: 'invalid_order_id' }
  }
  try {
    const res = await updatePosOrderStatus({ id: orderId, status: 'ready' })
    const posOk = Boolean(res.success || res.statusAlreadyApplied)
    if (!posOk) {
      return { posOk: false, grabOk: false, grabError: String(res.message ?? 'update_status_failed') }
    }
  } catch (e) {
    return { posOk: false, grabOk: false, grabError: String(e) }
  }

  const grabOrderId = String(params.grabOrderId ?? '').trim()
  if (!grabOrderId) return { posOk: true, grabOk: true }

  try {
    const markRes = await grabMarkOrderReadyApi({ orderID: grabOrderId, markStatus: 1 })
    if (!markRes.success) {
      return {
        posOk: true,
        grabOk: false,
        grabError: String(markRes.message ?? 'grab_mark_ready_failed'),
      }
    }
    return { posOk: true, grabOk: true }
  } catch (e) {
    return { posOk: true, grabOk: false, grabError: String(e) }
  }
}

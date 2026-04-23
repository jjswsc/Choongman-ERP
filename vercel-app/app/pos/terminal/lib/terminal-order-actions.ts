import {
  updatePosOrderStatus,
  type PosOrderStatusUpdateResult,
} from '@/lib/api-client'
import {
  buildPosQueuedSaveMessage,
  buildPosStatusFailureMessage,
} from '@/lib/pos-status-feedback'

type AlertFn = (message: string) => Promise<void>
type ConfirmFn = (message: string) => Promise<boolean>

export async function notifyQueuedPosSave(params: {
  orderNo?: string
  queued?: boolean
  onAlert: AlertFn
}) {
  if (!params.queued) return
  await params.onAlert(buildPosQueuedSaveMessage(params.orderNo))
}

export async function applyPosOrderStatusWithRetry(params: {
  id: number
  status: 'ready' | 'paid' | 'completed' | 'cancelled' | 'refunded'
  onAlert: AlertFn
  onConfirm: ConfirmFn
  failMessageFallback: string
}) {
  const first = await updatePosOrderStatus({ id: params.id, status: params.status })
  if (first.success) return true

  const canRetry = Boolean(first.retryAfterQueue || first.statusAlreadyApplied)
  const msg = buildPosStatusFailureMessage(first, params.failMessageFallback)
  if (!canRetry) {
    await params.onAlert(msg)
    return false
  }

  if (!await params.onConfirm(`${msg}\n\n후속 처리를 다시 시도할까요?`)) return false
  const retried: PosOrderStatusUpdateResult = await updatePosOrderStatus({
    id: params.id,
    status: params.status,
    retrySideEffects: true,
  })
  if (!retried.success) {
    await params.onAlert(buildPosStatusFailureMessage(retried, params.failMessageFallback))
    return false
  }
  return true
}

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
  i18n?: {
    withoutOrderNo?: string
    withOrderNo?: (no: string) => string
  }
}) {
  if (!params.queued) return
  await params.onAlert(buildPosQueuedSaveMessage(params.orderNo, params.i18n))
}

export async function applyPosOrderStatusWithRetry(params: {
  id: number
  status: 'ready' | 'paid' | 'completed' | 'cancelled' | 'refunded'
  onAlert: AlertFn
  onConfirm: ConfirmFn
  failMessageFallback: string
  i18n?: {
    retryConfirm?: string
    /** Localize `res.message` from updatePosOrderStatus (e.g. localizeApiMessage) */
    localizeMessage?: (message: string | undefined, fallback: string) => string
    sideEffectLabels?: {
      stock?: string
      journal?: string
      vat?: string
    }
    postProcessSuffix?: (steps: string) => string
  }
}) {
  const first = await updatePosOrderStatus({ id: params.id, status: params.status })
  if (first.success) return true

  const canRetry = Boolean(first.retryAfterQueue || first.statusAlreadyApplied)
  const localizeMessage = params.i18n?.localizeMessage
  const buildFailure = (r: PosOrderStatusUpdateResult) =>
    buildPosStatusFailureMessage(
      localizeMessage ? { ...r, message: localizeMessage(r.message, params.failMessageFallback) } : r,
      params.failMessageFallback,
      {
        labels: params.i18n?.sideEffectLabels,
        postProcessSuffix: params.i18n?.postProcessSuffix,
      }
    )
  const msg = buildFailure(first)
  if (!canRetry) {
    await params.onAlert(msg)
    return false
  }

  if (!await params.onConfirm(`${msg}\n\n${params.i18n?.retryConfirm || '후속 처리를 다시 시도할까요?'}`)) return false
  const retried: PosOrderStatusUpdateResult = await updatePosOrderStatus({
    id: params.id,
    status: params.status,
    retrySideEffects: true,
  })
  if (!retried.success) {
    await params.onAlert(buildFailure(retried))
    return false
  }
  return true
}

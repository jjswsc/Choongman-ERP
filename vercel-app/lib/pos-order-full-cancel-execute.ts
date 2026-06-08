import { updatePosOrderStatus, type PosOrderStatusUpdateResult } from '@/lib/api-client'
import type { Order } from '@/lib/pos-types'
import { buildPosStatusFailureMessage } from '@/lib/pos-status-feedback'
import {
  cancelQueuedOnlyPosOrder,
  resolvePosOrderServerIdForAction,
} from '@/lib/pos-order-resolve-server-id'

export type PosFullCancelOutcome =
  | { ok: true; serverId: number | null; localOnly: boolean; result: PosOrderStatusUpdateResult | null }
  | { ok: false; message: string }

type AlertFn = (message: string) => Promise<void>
type ConfirmFn = (message: string) => Promise<boolean>

export async function executePosFullOrderCancel(params: {
  order: Order
  storeCode: string
  onAlert: AlertFn
  onConfirm: ConfirmFn
  failMessageFallback: string
  i18n?: {
    retryConfirm?: string
    sideEffectLabels?: {
      stock?: string
      journal?: string
      vat?: string
    }
    postProcessSuffix?: (steps: string) => string
  }
}): Promise<PosFullCancelOutcome> {
  const { order, storeCode, onAlert, onConfirm, failMessageFallback, i18n } = params

  let resolved = await resolvePosOrderServerIdForAction(order, storeCode)

  if (resolved.queueOnly && resolved.localOrderNo) {
    const dropped = await cancelQueuedOnlyPosOrder(resolved.localOrderNo)
    if (dropped) {
      return { ok: true, serverId: null, localOnly: true, result: null }
    }
  }

  if (!resolved.serverId) {
    resolved = await resolvePosOrderServerIdForAction(order, storeCode, { trySync: true })
    if (resolved.queueOnly && resolved.localOrderNo) {
      const dropped = await cancelQueuedOnlyPosOrder(resolved.localOrderNo)
      if (dropped) {
        return { ok: true, serverId: null, localOnly: true, result: null }
      }
    }
  }

  const serverId = resolved.serverId
  if (!serverId) {
    return { ok: false, message: '주문을 찾을 수 없습니다.' }
  }

  const first = await updatePosOrderStatus({ id: serverId, status: 'cancelled' })
  if (first.success) {
    return { ok: true, serverId, localOnly: false, result: first }
  }

  const canRetry = Boolean(first.retryAfterQueue || first.statusAlreadyApplied)
  const msg = buildPosStatusFailureMessage(first, failMessageFallback, {
    labels: i18n?.sideEffectLabels,
    postProcessSuffix: i18n?.postProcessSuffix,
  })
  if (!canRetry) {
    await onAlert(msg)
    return { ok: false, message: msg }
  }

  if (
    !(await onConfirm(`${msg}\n\n${i18n?.retryConfirm || '후속 처리를 다시 시도할까요?'}`))
  ) {
    return { ok: false, message: msg }
  }

  const retried = await updatePosOrderStatus({
    id: serverId,
    status: 'cancelled',
    retrySideEffects: true,
  })
  if (!retried.success) {
    const retryMsg = buildPosStatusFailureMessage(retried, failMessageFallback, {
      labels: i18n?.sideEffectLabels,
      postProcessSuffix: i18n?.postProcessSuffix,
    })
    await onAlert(retryMsg)
    return { ok: false, message: retryMsg }
  }

  return { ok: true, serverId, localOnly: false, result: retried }
}

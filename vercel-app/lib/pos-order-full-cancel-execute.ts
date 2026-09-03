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
type PromptFn = (message: string) => Promise<string | null | undefined>

const DEFAULT_REASON_PROMPT = '취소 사유를 입력하세요 (2자 이상, 메모에 기록됩니다)'
const DEFAULT_REASON_TOO_SHORT = '사유를 2자 이상 입력해 주세요.'

export async function executePosFullOrderCancel(params: {
  order: Order
  storeCode: string
  onAlert: AlertFn
  onConfirm: ConfirmFn
  onPrompt: PromptFn
  failMessageFallback: string
  i18n?: {
    reasonPrompt?: string
    reasonTooShort?: string
    retryConfirm?: string
    depositRefundAsk?: string
    sideEffectLabels?: {
      stock?: string
      journal?: string
      vat?: string
    }
    postProcessSuffix?: (steps: string) => string
  }
}): Promise<PosFullCancelOutcome> {
  const { order, storeCode, onAlert, onConfirm, onPrompt, failMessageFallback, i18n } = params

  const reasonPrompt = i18n?.reasonPrompt || DEFAULT_REASON_PROMPT
  const reasonTooShort = i18n?.reasonTooShort || DEFAULT_REASON_TOO_SHORT

  const reasonRaw = await onPrompt(reasonPrompt)
  const memoAppend = String(reasonRaw ?? '').trim()
  if (memoAppend.length < 2) {
    await onAlert(reasonTooShort)
    return { ok: false, message: reasonTooShort }
  }

  const depositHeld = Math.max(0, Number(order.depositAmt ?? 0) || 0)
  let depositDisposition: 'refund' | 'forfeit' | undefined
  if (depositHeld > 0.005) {
    const refund = await onConfirm(
      i18n?.depositRefundAsk ||
        '선수금을 환불할까요?\n확인 = 환불, 취소 = 미환불(몰수)'
    )
    depositDisposition = refund ? 'refund' : 'forfeit'
  }

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

  const first = await updatePosOrderStatus({
    id: serverId,
    status: 'cancelled',
    memoAppend,
    ...(depositDisposition ? { depositDisposition } : {}),
  })
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

  if (!(await onConfirm(`${msg}\n\n${i18n?.retryConfirm || '후속 처리를 다시 시도할까요?'}`))) {
    return { ok: false, message: msg }
  }

  const retried = await updatePosOrderStatus({
    id: serverId,
    status: 'cancelled',
    retrySideEffects: true,
    memoAppend,
    ...(depositDisposition ? { depositDisposition } : {}),
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

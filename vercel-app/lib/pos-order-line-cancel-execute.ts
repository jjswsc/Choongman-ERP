import { appAlert, appConfirm } from '@/lib/app-message'
import { updatePosOrder } from '@/lib/api-client'
import type { Order } from '@/lib/pos-types'
import type { PosKitchenReprintPayload } from '@/lib/pos-kitchen-slip-routing'
import { posOrderHasServerId } from '@/lib/pos-order-server-id'
import { resolvePosOrderServerIdForAction } from '@/lib/pos-order-resolve-server-id'
import { localizeApiMessage } from '@/lib/translate-api-message'
import { tr as i18nTr } from '@/lib/i18n'
import {
  buildOrderItemsAfterLineCancel,
  kitchenRemovedLineFromOrderItem,
  orderItemLineQty,
  wouldLeaveNoItemsAfterLineCancel,
} from '@/lib/pos-order-line-cancel'
import {
  buildUpdatePosOrderParamsFromOrder,
  canRemovePosOrderLine,
  canStartPosLinePartialCancel,
  orderItemsToPosOrderItems,
  orderPaymentsSum,
} from '@/lib/pos-order-line-update'

export type ExecutePosLineCancelOptions = {
  order: Order
  itemId: string
  cancelQty: number
  displayLabel: string
  t: (key: string) => string
  tDefault: (key: string) => string
  lang: string
  isDemo?: boolean
  onDemoOrderReplace?: (order: Order) => void
  onAfterPartialLineRemoved?: (orderId: number, detail: PosKitchenReprintPayload) => Promise<void> | void
  onRefresh?: () => void
  /** 일부 취소·서버 id 해석용 */
  storeCode?: string
  /** 수량 1·전체 줄 삭제 시 확인창 (Dialog 경로는 false) */
  confirmBeforeApply?: boolean
}

export async function alertPosLineCancelBlocked(
  order: Order,
  t: (key: string) => string,
  tDefault: (key: string) => string
): Promise<void> {
  if (orderPaymentsSum(order) > 0.005) {
    await appAlert(t('posLineItemCancelPaidBlocked') || tDefault('posLineItemCancelPaidBlocked'))
    return
  }
  await appAlert(t('posLineItemCancelLastHint') || tDefault('posLineItemCancelLastHint'))
}

export async function executePosOrderLineCancel(
  opts: ExecutePosLineCancelOptions
): Promise<'ok' | 'abort' | 'error'> {
  const {
    order,
    itemId,
    cancelQty,
    displayLabel,
    t,
    tDefault,
    lang,
    isDemo,
    onDemoOrderReplace,
    onAfterPartialLineRemoved,
    onRefresh,
    confirmBeforeApply = false,
    storeCode = '',
  } = opts

  const target = order.items.find((it) => it.id === itemId)
  if (!target) return 'abort'

  const lineQty = orderItemLineQty(target)
  const cq = Math.max(1, Math.min(lineQty, Math.trunc(cancelQty) || 1))

  if (!canStartPosLinePartialCancel(order)) {
    await alertPosLineCancelBlocked(order, t, tDefault)
    return 'abort'
  }

  if (wouldLeaveNoItemsAfterLineCancel(order.items, itemId, cq)) {
    await appAlert(t('posLineItemCancelLastHint') || tDefault('posLineItemCancelLastHint'))
    return 'abort'
  }

  if (cq >= lineQty && !canRemovePosOrderLine(order)) {
    await alertPosLineCancelBlocked(order, t, tDefault)
    return 'abort'
  }

  if (confirmBeforeApply) {
    const ask = i18nTr(tDefault, 'posLineItemCancelConfirm', { name: displayLabel })
    if (!(await appConfirm(ask))) return 'abort'
  }

  const built = buildOrderItemsAfterLineCancel(order.items, itemId, cq)
  if (!built) return 'abort'

  if (isDemo && onDemoOrderReplace) {
    const nextTotal = built.items.reduce((s, it) => s + it.price * orderItemLineQty(it), 0)
    onDemoOrderReplace({ ...order, items: built.items, total: nextTotal })
    onRefresh?.()
    return 'ok'
  }

  const resolved = storeCode
    ? await resolvePosOrderServerIdForAction(order, storeCode)
    : { serverId: posOrderHasServerId(order.id) ? Number(order.id) : null, queueOnly: false, localOrderNo: null }
  const id = resolved.serverId
  if (id == null || !posOrderHasServerId(id)) {
    const msg = t('posServedNeedsOrderId')
    await appAlert(msg && msg !== 'posServedNeedsOrderId' ? msg : tDefault('posServedNeedsOrderId'))
    return 'abort'
  }

  const nextPosItems = orderItemsToPosOrderItems(built.items)
  try {
    const res = await updatePosOrder(buildUpdatePosOrderParamsFromOrder(order, nextPosItems))
    if (!res.success) {
      await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
      return 'error'
    }
    const removedLine = kitchenRemovedLineFromOrderItem(target, displayLabel, cq)
    await onAfterPartialLineRemoved?.(id, { removedKitchenLines: [removedLine] })
    onRefresh?.()
    return 'ok'
  } catch (e) {
    await appAlert(i18nTr(tDefault, 'posUnexpectedErrorDetail', { detail: String(e) }))
    return 'error'
  }
}

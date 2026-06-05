import {
  POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE,
  printPosHtmlDocument,
  resolveBetweenKitchenSlipsDelayMs,
  type PrintPosHtmlDocumentOptions,
} from '@/lib/pos-print-html'
import {
  buildKitchenPrintTrackingId,
  clearKitchenPrintFailure,
  markKitchenPrintFailure,
} from '@/lib/pos-kitchen-print-tracking'

/** 터미널·관리자 공통: 주문 id / orderNo → 주방 인쇄 실패 추적 키 */
export function resolveKitchenPrintOrderRef(order: {
  id?: number | string | null
  orderNo?: string | null
}): string {
  const orderNo = String(order.orderNo ?? '').trim()
  if (orderNo) return orderNo
  const orderId = Number(order.id ?? 0)
  return Number.isFinite(orderId) && orderId > 0 ? `id:${Math.trunc(orderId)}` : 'UNKNOWN'
}

/**
 * 하이브리드 주방 다장 인쇄 1회 배치.
 * - 자동 재인쇄 없음 (중복 방지 — dedupe 키와 별개)
 * - 셸 ok:false 시 iframe 폴백 생략 (이중 출력 방지)
 */
export function createKitchenHybridPrintBatch() {
  let shellIssueDetected = false
  let lastTrackingId = ''

  const recordShellResult = (result: { ok?: boolean; cutOk?: boolean }) => {
    if (result.ok === false || result.cutOk === false) shellIssueDetected = true
  }

  const printSlip = async (
    html: string,
    opts: PrintPosHtmlDocumentOptions & {
      title: string
      slipTrackingId?: string
    }
  ): Promise<void> => {
    const { title, slipTrackingId, ...printOpts } = opts
    if (slipTrackingId) lastTrackingId = slipTrackingId
    await printPosHtmlDocument(html, {
      title,
      printDelayMs: 0,
      focusIframeBeforePrint: false,
      skipIframeFallbackOnShellFailure: true,
      ...printOpts,
      printRole: 'kitchen',
      onShellPrintResult: (r) => {
        printOpts.onShellPrintResult?.(r)
        recordShellResult(r || {})
      },
    })
  }

  const finalize = (orderRef: string) => {
    const ref = String(orderRef ?? '').trim() || 'UNKNOWN'
    if (shellIssueDetected) {
      markKitchenPrintFailure({
        orderRef: ref,
        reason: 'shell_print_or_cut_failed',
        ...(lastTrackingId ? { trackingId: lastTrackingId } : {}),
      })
      return
    }
    clearKitchenPrintFailure(ref)
  }

  const markError = (orderRef: string, error: unknown) => {
    const ref = String(orderRef ?? '').trim() || 'UNKNOWN'
    const msg = error instanceof Error ? error.message : String(error ?? '')
    markKitchenPrintFailure({
      orderRef: ref,
      reason: msg || 'print_failed',
      ...(lastTrackingId ? { trackingId: lastTrackingId } : {}),
    })
  }

  return {
    recordShellResult,
    printSlip,
    finalize,
    markError,
    get shellIssueDetected() {
      return shellIssueDetected
    },
    get lastTrackingId() {
      return lastTrackingId
    },
  }
}

export function buildKitchenSlipTrackingIdForOrder(params: {
  orderRef: string
  station?: number
  label?: string
}): string {
  return buildKitchenPrintTrackingId({
    orderRef: params.orderRef,
    station: params.station,
    label: params.label,
  })
}

export type KitchenHybridSlipSpec = {
  html: string
  title: string
  slipTrackingId?: string
  kitchenStation?: 1 | 2 | 3
  escPosCutOverride?: boolean
  onPrintUnavailable?: () => void
}

/** 주방 슬립 N장 순차 인쇄 + 하이브리드 실패 추적(자동 재시도 없음) */
export async function runKitchenHybridSlipBatch(params: {
  orderRef: string
  slips: KitchenHybridSlipSpec[]
}): Promise<void> {
  const orderRef = String(params.orderRef ?? '').trim() || 'UNKNOWN'
  const slips = params.slips
  if (!slips.length) return
  const batch = createKitchenHybridPrintBatch()
  try {
    for (let idx = 0; idx < slips.length; idx += 1) {
      const slip = slips[idx]
      await batch.printSlip(slip.html, {
        title: slip.title,
        slipTrackingId: slip.slipTrackingId,
        kitchenStation: slip.kitchenStation,
        escPosCutOverride: slip.escPosCutOverride,
        onPrintUnavailable:
          slip.onPrintUnavailable ??
          (() => {
            throw new Error('print_unavailable')
          }),
      })
      if (idx + 1 < slips.length) {
        await new Promise((resolve) => setTimeout(resolve, resolveBetweenKitchenSlipsDelayMs()))
      }
    }
    batch.finalize(orderRef)
  } catch (e) {
    batch.markError(orderRef, e)
    if (e instanceof Error && e.message === POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE) {
      throw new Error('print_unavailable')
    }
    throw e
  }
}

export { POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE }

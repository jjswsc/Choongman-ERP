import type { PosOrderStatusUpdateResult } from '@/lib/api-client'

type PosStatusFeedbackLabels = {
  stock?: string
  journal?: string
  vat?: string
}

function formatFailedSteps(steps: string[], labels?: PosStatusFeedbackLabels): string {
  if (!steps.length) return ''
  const mapped = steps.map((step) => {
    if (step === 'stock' || step === 'reversal_stock') return labels?.stock || '재고'
    if (step === 'journal' || step === 'reversal_journal') return labels?.journal || '분개'
    if (step === 'vat_draft') return labels?.vat || '부가세'
    return step
  })
  return Array.from(new Set(mapped)).join(', ')
}

export function buildPosStatusFailureMessage(
  res: PosOrderStatusUpdateResult,
  fallback: string,
  opts?: {
    labels?: PosStatusFeedbackLabels
    postProcessSuffix?: (steps: string) => string
  }
): string {
  const detail = formatFailedSteps(
    Array.isArray(res.failedSideEffects) ? res.failedSideEffects : [],
    opts?.labels
  )
  const base = res.message?.trim() || fallback
  return detail
    ? `${base}\n${opts?.postProcessSuffix ? opts.postProcessSuffix(detail) : `(${detail} 후처리)`}`
    : base
}

export function buildPosQueuedSaveMessage(
  orderNo?: string,
  opts?: {
    withoutOrderNo?: string
    withOrderNo?: (no: string) => string
  }
): string {
  const no = String(orderNo ?? '').trim()
  if (!no) return opts?.withoutOrderNo || '오프라인으로 저장했습니다. 네트워크 복구 시 자동 동기화됩니다.'
  return opts?.withOrderNo ? opts.withOrderNo(no) : `주문 ${no}를 오프라인 큐에 저장했습니다. 네트워크 복구 시 자동 동기화됩니다.`
}

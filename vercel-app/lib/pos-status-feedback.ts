import type { PosOrderStatusUpdateResult } from '@/lib/api-client'

function formatFailedSteps(steps: string[]): string {
  if (!steps.length) return ''
  const mapped = steps.map((step) => {
    if (step === 'stock' || step === 'reversal_stock') return '재고'
    if (step === 'journal' || step === 'reversal_journal') return '분개'
    if (step === 'vat_draft') return '부가세'
    return step
  })
  return Array.from(new Set(mapped)).join(', ')
}

export function buildPosStatusFailureMessage(
  res: PosOrderStatusUpdateResult,
  fallback: string
): string {
  const detail = formatFailedSteps(Array.isArray(res.failedSideEffects) ? res.failedSideEffects : [])
  const base = res.message?.trim() || fallback
  return detail ? `${base}\n(${detail} 후처리)` : base
}

export function buildPosQueuedSaveMessage(orderNo?: string): string {
  const no = String(orderNo ?? '').trim()
  if (!no) return '오프라인으로 저장했습니다. 네트워크 복구 시 자동 동기화됩니다.'
  return `주문 ${no}를 오프라인 큐에 저장했습니다. 네트워크 복구 시 자동 동기화됩니다.`
}

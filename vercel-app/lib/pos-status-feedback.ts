import type { PosOrderStatusUpdateResult } from '@/lib/api-client'
import { tr } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'

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

/**
 * Localizes res.message for the current language and fills side-effect labels/suffix from POS i18n keys.
 * Pass opts to override the defaults.
 */
export function buildLocalizedPosStatusFailureMessage(
  res: PosOrderStatusUpdateResult,
  t: (k: string) => string,
  fallback: string,
  lang: string,
  opts?: {
    labels?: PosStatusFeedbackLabels
    postProcessSuffix?: (steps: string) => string
  }
): string {
  const message = localizeApiMessage(res.message, t, fallback, lang)
  return buildPosStatusFailureMessage({ ...res, message }, fallback, {
    labels: opts?.labels ?? {
      stock: t('posStatusSideEffectStock'),
      journal: t('posStatusSideEffectJournal'),
      vat: t('posStatusSideEffectVat'),
    },
    postProcessSuffix:
      opts?.postProcessSuffix ?? ((steps) => tr(t, 'posStatusPostProcessSuffix', { steps })),
  })
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

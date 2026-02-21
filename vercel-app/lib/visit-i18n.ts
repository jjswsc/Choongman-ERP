/**
 * 매장 방문 구분(visit_type)·목적(purpose) 번역
 * - 구분: 방문시작, 방문종료, 강제 방문시작, 강제 방문종료
 * - 목적: 정기점검, 직원교육, 긴급지원, 매장미팅, 물건배송, 기타
 */
import type { I18nKeys } from './i18n'

const VISIT_TYPE_TO_KEY: Record<string, I18nKeys> = {
  방문시작: 'visitStart',
  방문종료: 'visitEnd',
  '강제 방문시작': 'visitForceStart',
  '강제 방문종료': 'visitForceEnd',
}

const VISIT_PURPOSE_TO_KEY: Record<string, I18nKeys> = {
  정기점검: 'visitPurposeInspect',
  '정기 점검': 'visitPurposeInspect',
  직원교육: 'visitPurposeTraining',
  '직원 교육': 'visitPurposeTraining',
  긴급지원: 'visitPurposeUrgent',
  '긴급 지원': 'visitPurposeUrgent',
  매장미팅: 'visitPurposeMeeting',
  '매장 미팅': 'visitPurposeMeeting',
  물건배송: 'visitPurposeDelivery',
  '물건 배송': 'visitPurposeDelivery',
  기타: 'visitPurposeEtc',
}

export function translateVisitType(
  type: string,
  t: (k: I18nKeys) => string
): string {
  const key = VISIT_TYPE_TO_KEY[type?.trim() || '']
  return key ? t(key) || type : type
}

export function translateVisitPurpose(
  purpose: string,
  t: (k: I18nKeys) => string
): string {
  const s = purpose?.trim() || ''
  if (s.startsWith('기타:') || s.startsWith('기타：')) {
    return `${t('visitPurposeEtc')}: ${s.replace(/^기타[：:]\s*/, '')}`
  }
  const key = VISIT_PURPOSE_TO_KEY[s]
  return key ? t(key) || purpose : purpose
}

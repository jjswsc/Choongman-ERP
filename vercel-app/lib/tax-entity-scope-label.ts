/** 클라이언트·서버 공용: 법인 스코프 표시용 (server-only 의존 없음) */

/** taxpayer_name 끝의 (00001)/(Head Office) 등 지점 표기 제거 */
export function cleanTaxEntityDisplayName(raw: string): string {
  return String(raw || '')
    .replace(/\s*\((?:head\s*office|สำนักงานใหญ่|\d{5})\)\s*$/i, '')
    .replace(/\s*\(\d{1,5}\)\s*$/g, '')
    .trim()
}

/**
 * UI용 법인 스코프 라벨 — value는 entity:... 이지만 화면에는 회사명·TIN·매장수만 표시
 * storeCountLabel은 호출측 i18n으로 넘김 (예: "3개 매장" / "3 stores")
 */
export function formatTaxEntityScopeLabel(input: {
  entityName?: string | null
  entityCode?: string | null
  taxId?: string | null
  storeCount?: number | null
  /** i18n으로 만든 매장수 문구. 없으면 영문 fallback */
  storeCountLabel?: string | null
}): string {
  const name =
    cleanTaxEntityDisplayName(String(input.entityName || '')) ||
    String(input.entityCode || '').trim() ||
    'Entity'
  const taxId = String(input.taxId || '').replace(/\D/g, '').trim()
  const storeCount = Math.max(0, Number(input.storeCount) || 0)
  const storePart =
    String(input.storeCountLabel || '').trim() ||
    (storeCount > 0 ? `${storeCount} stores` : '')
  const parts = [taxId ? `TIN ${taxId}` : '', storePart].filter(Boolean)
  return parts.length ? `${name} (${parts.join(' · ')})` : name
}

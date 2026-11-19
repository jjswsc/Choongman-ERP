/**
 * 공지 확인 키(이름·매장) 정규화 — 모바일/집계/저장이 같은 규칙을 쓰게 한다.
 */

export function normalizeNoticePersonName(name: string): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
}

/** 공백·영문 대소문자만 흡수. 태국어는 trim 후 완전 일치. */
export function noticePersonNamesMatch(a: string, b: string): boolean {
  const na = normalizeNoticePersonName(a)
  const nb = normalizeNoticePersonName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return na.toLowerCase() === nb.toLowerCase()
}

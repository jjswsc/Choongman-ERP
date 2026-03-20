/**
 * POS 영수증/인쇄용: 테이블명 끝 `번` 제거·치킨 부위 옵션명 번역 등.
 */

/** 테이블명 끝 한글 접미사 `번` 제거 (1F-2번 → 1F-2). 언어와 무관하게 표시만 정리. */
export function translateReceiptTableDisplayName(tableName: string, _t?: (key: string) => string): string {
  const s = String(tableName || '').trim()
  if (!s) return s
  if (!/\s*번\s*$/u.test(s)) return s
  return s.replace(/\s*번\s*$/u, '').trimEnd()
}

/** 품목 줄에 포함된 순살/윙/봉 한글을 번역 키로 치환 ("M - 순살" 등) */
export function translatePosMenuLineForReceipt(name: string, t: (key: string) => string): string {
  if (!name?.trim()) return name ?? ''
  let out = String(name)
  const boneless = t('posOptionPartBoneless')
  const wing = t('posOptionPartWing')
  const drum = t('posOptionPartDrumstick')
  if (boneless && boneless !== 'posOptionPartBoneless') out = out.replace(/순살/g, boneless)
  if (wing && wing !== 'posOptionPartWing') out = out.replace(/윙/g, wing)
  if (drum && drum !== 'posOptionPartDrumstick') out = out.replace(/봉/g, drum)
  return out
}

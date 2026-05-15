/**
 * POS 영수증/인쇄용: 테이블명 끝 `번` 제거·치킨 부위 표기 영문 통일 등.
 */

/** 치킨 기본가에 해당하는 대표 옵션 표기(표시·카트 기본 선택 등). DB 레거시 `S 순살`과 병행 인식. */
export const POS_CHICKEN_DEFAULT_OPTION_DISPLAY = 'S Boneless'

/**
 * 치킨 부위 한글(순살·윙·봉)을 영문 Boneless / Wing / Drumette 로 통일.
 * 메뉴·옵션명·장바구니·영수증에서 번역 키와 혼용되지 않도록 단일 표기 유지.
 */
export function canonicalEnglishChickenMenuLine(text: string): string {
  let out = String(text ?? '')
  out = out.replace(/순살/gi, 'Boneless')
  out = out.replace(/윙/g, 'Wing')
  out = out.replace(/봉/g, 'Drumette')
  return out
}

/**
 * 옵션 `part` 단계 값·이름에서 한·영 혼용·사이즈 접두(M - 순살 등)를 묶어
 * 가상「부위 후보」목록·중복 제거용 키로 쓴다.
 */
export function chickenPartDedupeKey(raw: string): string {
  const canon = canonicalEnglishChickenMenuLine(String(raw ?? '').trim())
  const noSize = canon.replace(/^\s*[SML]\s*[-–—\s]+\s*/i, '').trim() || canon
  const t = noSize.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t === 'boneless' || t.includes('boneless')) return 'boneless'
  if (/\bdrumette\b/.test(t) || t.includes('wing stick')) return 'drumette'
  if (t === 'wing' || t === 'wings' || /\bwing\b/.test(t)) return 'wing'
  return t
}

/** `chickenPartDedupeKey` 결과에 맞는 라이브러리 한 줄 표기(알 수 없으면 영문 정규화·사이즈 접두 제거). */
export function prettyChickenPartLibraryLabel(dedupeKey: string, originalRaw: string): string {
  const k = String(dedupeKey ?? '').trim().toLowerCase()
  if (k === 'boneless') return 'Boneless'
  if (k === 'wing' || k === 'wings') return 'Wing'
  if (k === 'drumette') return 'Drumette'
  const canon = canonicalEnglishChickenMenuLine(String(originalRaw ?? '').trim())
  const noSize = canon.replace(/^\s*[SML]\s*[-–—\s]+\s*/i, '').trim() || canon
  return noSize || String(originalRaw ?? '').trim()
}

/** 테이블명 끝 한글 접미사 `번` 제거 (1F-2번 → 1F-2). 언어와 무관하게 표시만 정리. */
export function translateReceiptTableDisplayName(tableName: string, _t?: (key: string) => string): string {
  const s = String(tableName || '').trim()
  if (!s) return s
  if (!/\s*번\s*$/u.test(s)) return s
  return s.replace(/\s*번\s*$/u, '').trimEnd()
}

/**
 * 배치 테이블명 `4` vs 주문 `table_name` `4번` 등 매칭용 (소문자·trim·끝 `번` 제거).
 */
export function normalizePosTableNameForMatch(raw: string | undefined | null): string {
  let s = String(raw ?? '').trim().toLowerCase()
  if (!s) return ''
  s = s.replace(/\s*번\s*$/u, '').trimEnd()
  return s
}

/** 품목 줄 표시: 치킨 부위 한글 → 영문 통일. `t`는 호환용(미사용). */
export function translatePosMenuLineForReceipt(name: string, _t?: (key: string) => string): string {
  if (!name?.trim()) return name ?? ''
  return canonicalEnglishChickenMenuLine(String(name))
}

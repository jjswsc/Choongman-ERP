import type { LangCode } from '@/lib/lang-context'

const POS_PRINT_LANG_CODES = new Set(['ko', 'en', 'th', 'mm', 'la', 'kh', 'vi', 'ms'])

/** 영수증/주방 인쇄 언어 오버라이드: 허용 코드면 그 값, 아니면 빈 문자열 */
export function normalizePosPrintLangOverride(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim()
  return POS_PRINT_LANG_CODES.has(s) ? s : ''
}

/** 빈 오버라이드면 UI 언어 */
export function resolvePosPrintLang(override: string | undefined | null, uiLang: LangCode): LangCode {
  const n = normalizePosPrintLangOverride(override)
  return (n || uiLang) as LangCode
}

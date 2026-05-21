/** 인쇄용 선행 코드 토큰: `[C010]`, `[CH001]` 등 메뉴 코드 형태만 제거 */
export const LEADING_CODE_PREFIX_RE = /^\[[A-Za-z]{1,4}\d{1,6}\]\s*/u
/** POS 메뉴 SKU (예: C024, CT005) — 주방·영수증에서 단독 코드 행 판별 */
export const POS_MENU_SKU_RE = /^[A-Z]{1,3}\d{2,4}$/i
const TRAILING_OPTION_RE = /^(.+?)\s*\(([^()]+)\)\s*$/u

function normalizeSpaces(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function stripLeadingPrintCodeBrackets(rawName: string): string {
  return normalizeSpaces(String(rawName ?? '').replace(LEADING_CODE_PREFIX_RE, ''))
}

export function isLikelyPosMenuSkuCode(raw: string): boolean {
  const t = stripLeadingPrintCodeBrackets(String(raw ?? ''))
  if (!t || t.length > 10) return false
  return POS_MENU_SKU_RE.test(t)
}

export function normalizePosPrintOptionLabel(rawOption: string): string {
  const compact = normalizeSpaces(rawOption).replace(/^\[|\]$/g, '').trim()
  if (!compact) return ''
  return compact
}

/**
 * POS 인쇄용 메뉴명 정리:
 * - 앞쪽 코드 토큰([C008] 등) 제거
 * - 끝 괄호 옵션을 하위 줄로 분리 (`SNOW ONION (M - Boneless)` → 메인/옵션)
 */
export function splitPosPrintItemLine(rawName: string): {
  mainName: string
  optionLine: string
} {
  const compact = normalizeSpaces(rawName)
  if (!compact) return { mainName: '', optionLine: '' }

  const noLeadingCode = compact.replace(LEADING_CODE_PREFIX_RE, '').trim()
  const m = noLeadingCode.match(TRAILING_OPTION_RE)
  if (!m) return { mainName: noLeadingCode, optionLine: '' }

  const mainName = normalizeSpaces(m[1] || '')
  const optionLine = normalizePosPrintOptionLabel(m[2] || '')
  if (!mainName) return { mainName: noLeadingCode, optionLine: '' }
  return { mainName, optionLine }
}

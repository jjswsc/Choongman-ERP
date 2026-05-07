const LEADING_CODE_PREFIX_RE = /^\[[^\]]+\]\s*/u
const TRAILING_OPTION_RE = /^(.+?)\s*\(([^()]+)\)\s*$/u
const SIZE_PREFIX_RE = /^(?:x?s|m|l|xl|xxl)\s*[-:/]\s*/iu

function normalizeSpaces(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function normalizePosPrintOptionLabel(rawOption: string): string {
  const compact = normalizeSpaces(rawOption).replace(/^\[|\]$/g, '').trim()
  if (!compact) return ''
  const withoutSizePrefix = compact.replace(SIZE_PREFIX_RE, '').trim()
  return withoutSizePrefix || compact
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

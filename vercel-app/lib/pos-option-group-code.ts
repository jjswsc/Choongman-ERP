/**
 * 옵션 그룹 내부 식별 코드(표시명/키와 분리) 유틸.
 * 1차 호환 단계: key 기반 파생 코드를 사용하고, 추후 DB group_code 컬럼과 동기화한다.
 */
export function buildPosOptionGroupCodeFromKey(rawKey: string): string {
  const normalized = String(rawKey ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!normalized) return 'OG_UNSPEC'
  const body = normalized.slice(0, 28)
  return `OG_${body}`
}

export function isPosOptionGroupCodeLike(raw: string): boolean {
  return /^OG_[A-Z0-9_]{1,28}$/.test(String(raw ?? '').trim().toUpperCase())
}

/** API/DB `group_code` 우선, 없으면 `group_key`에서 파생 */
export function resolvePosOptionGroupCode(input: {
  code?: string | null
  key?: string | null
}): string {
  const fromDb = String(input.code ?? '').trim().toUpperCase()
  if (fromDb && isPosOptionGroupCodeLike(fromDb)) return fromDb
  return buildPosOptionGroupCodeFromKey(String(input.key ?? ''))
}

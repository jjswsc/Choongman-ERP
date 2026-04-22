/**
 * API JSON 정규화: 401/403/HTML/오류 객체가 올 때 UI에서 .map 런타임 오류를 막는다.
 */

/** 최상위가 JSON 배열일 때만 배열, 그 외는 [] */
export function jsonAsArray<T = unknown>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : []
}

export function jsonAsStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string')
}

/** null/배열이면 {} */
export function jsonAsPlainObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return {}
}

/** { list: T[] } / 오류 응답 { success:false } */
export function jsonObjectWithList<T = unknown>(raw: unknown, key = 'list'): { list: T[] } {
  const o = jsonAsPlainObject(raw)
  return { list: jsonAsArray<T>(o[key]) }
}

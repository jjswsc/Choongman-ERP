/**
 * PostgREST `in.(...)` 값.
 * 따옴표가 없으면 `2026-09-21` 이 빼기 연산으로 파싱되고, `1001` 은 숫자가 되어 TEXT store_code 와 안 맞을 수 있다.
 */
export function postgrestInQuotedList(values: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const v = String(raw || '')
      .trim()
      .replace(/"/g, '')
    if (!v) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(`"${v}"`)
  }
  return out.join(',')
}

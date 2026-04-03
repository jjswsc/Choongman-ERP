/**
 * employees.store ↔ evaluation_results.store_name: CM 접두·대소문 차이를 등급 키 후보로 확장.
 * @see storeMatches in admin-employee-store-access.ts (동일한 CM 토글 아이디어)
 */

/** PostgREST store_name.ilike 에 넣을 때 % _ \ 이 패턴으로 오인되지 않게 */
export function escapeForIlikeExact(value: string): string {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
}

/** 직원 폼 매장 vs 평가 저장 store_name — 공백·소문자·CM 접두까지 동일 매장으로 볼지 */
export function storesMatchForGradeLookup(a: string, b: string): boolean {
  const norm = (s: string) =>
    String(s || "")
      .trim()
      .replace(/\s+/g, " ")
  const va = new Set(expandStoreVariantsForGrade(norm(a)).map((x) => norm(x).toLowerCase()))
  const vb = new Set(expandStoreVariantsForGrade(norm(b)).map((x) => norm(x).toLowerCase()))
  for (const x of va) {
    if (vb.has(x)) return true
  }
  return false
}

export function expandStoreVariantsForGrade(store: string): string[] {
  const t = String(store || "")
    .trim()
    .replace(/\s+/g, " ")
  if (!t) return []
  const out = new Set<string>([t])
  out.add(t.toLowerCase())
  const tl = t.toLowerCase()
  if (tl.startsWith("cm ")) {
    const rest = t.slice(3).trim().replace(/\s+/g, " ")
    if (rest) {
      out.add(rest)
      out.add(rest.toLowerCase())
    }
  } else {
    const withCm = `CM ${t}`
    out.add(withCm)
    out.add(withCm.toLowerCase())
  }
  return Array.from(out)
}

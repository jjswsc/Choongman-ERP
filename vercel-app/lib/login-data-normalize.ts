/** getLoginData 캐시·API가 매장별 이름을 배열이 아닌 값으로 주면 Select `.map` 이 깨진다. */

export function asLoginNameList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? "").trim()).filter(Boolean)
  }
  if (typeof raw === "string") {
    const s = raw.trim()
    return s ? [s] : []
  }
  return []
}

export function normalizeLoginUsersMap(users: unknown): Record<string, string[]> {
  if (!users || typeof users !== "object" || Array.isArray(users)) return {}
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(users as Record<string, unknown>)) {
    const key = String(k || "").trim()
    if (!key) continue
    out[key] = asLoginNameList(v)
  }
  return out
}

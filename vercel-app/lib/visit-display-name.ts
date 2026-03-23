/** 매장 방문 화면: store_visits.name(로그인 시 저장값) → 닉네임 우선 표시 */

export type EmpNickName = { nick?: string; name?: string }

export function buildVisitDisplayNameMap(empList: EmpNickName[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of empList || []) {
    const nick = String(e.nick || "").trim()
    const legal = String(e.name || "").trim()
    const display = nick || legal
    if (!display) continue
    if (nick) m.set(nick, display)
    if (legal) m.set(legal, display)
  }
  return m
}

export function visitDisplayName(raw: string | undefined | null, map: Map<string, string>): string {
  const k = String(raw || "").trim()
  if (!k) return ""
  return map.get(k) ?? k
}

/** UI에서 고른 직원명과 DB name이 다를 때 Supabase OR 필터용 (닉·풀네임 모두) */
export function visitNameVariantsForFilter(selected: string, empList: EmpNickName[]): string[] {
  const sel = String(selected || "").trim()
  if (!sel) return []
  const out = new Set<string>([sel])
  for (const e of empList || []) {
    const nick = String(e.nick || "").trim()
    const legal = String(e.name || "").trim()
    const display = nick || legal
    if (!display) continue
    if (sel === display || sel === nick || sel === legal) {
      if (nick) out.add(nick)
      if (legal) out.add(legal)
    }
  }
  return Array.from(out)
}

/** name=eq 단일 또는 or=(name.eq.a,name.eq.b) */
export function visitNameSupabaseFilter(variants: string[]): string | null {
  const v = variants.map((s) => String(s || "").trim()).filter(Boolean)
  if (v.length === 0) return null
  if (v.length === 1) return `name=eq.${encodeURIComponent(v[0])}`
  return `or=(${v.map((x) => `name.eq.${encodeURIComponent(x)}`).join(",")})`
}

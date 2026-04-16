/**
 * employees.extra_stores 파싱 — 클라이언트·서버 공용 (supabase-server 의존 없음).
 * @see franchisee-multi-store.ts (가맹 다매장 설정·DB 저장)
 */

/** DB/요청에서 온 extra_stores 원본 → 매장명 배열 */
export function parseExtraStoresColumn(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    try {
      const p = JSON.parse(s) as unknown
      if (Array.isArray(p)) return p.map((x) => String(x || '').trim()).filter(Boolean)
    } catch {
      return s.split(/[,;]/).map((x) => x.trim()).filter(Boolean)
    }
  }
  return []
}

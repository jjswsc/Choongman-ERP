import { normStoreKey } from '@/lib/store-list-keys'

/**
 * GRAB_STORE_MAP_JSON — 한 객체에 여러 관계를 둘 수 있음.
 *
 * 1) Grab merchantID → Partner Store ID (주문 `store_code`에 남는 값, 예: "1048")
 *    예: `"GFSBPOS-204-253":"1048"`
 *
 * 2) Partner Store ID → ERP `store_code`(드롭다운 value와 동일)
 *    예: `"1048":"CM Asoke"`
 *
 * (1)만 있으면 POS에서 "CM Asoke"로 필터할 때 숫자 코드와 이어지지 않으므로,
 *     같은 JSON에 (2) 한 줄을 넣거나, ERP `store_code`를 파트너 ID와 같게 두면 된다.
 */
export function parseGrabStoreMap(): Record<string, string> {
  const raw = process.env.GRAB_STORE_MAP_JSON?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const key = String(k || '').trim()
      const val = String(v || '').trim()
      if (key && val) out[key] = val
    }
    return out
  } catch {
    return {}
  }
}

/**
 * 맵의 각 (K→V)를 무방향 간선으로 보고, seeds와 연결된 모든 노드(문자열)를 BFS로 수집.
 * 예: `{"GFSB…":"1048","1048":"CM Asoke"}` + seed `CM Asoke` → `1048`, `GFSB…` 포함.
 */
export function expandGrabStoreMapLinkedCodes(seeds: readonly string[]): string[] {
  const map = parseGrabStoreMap()
  if (!map || Object.keys(map).length === 0) return []
  const out = new Set<string>()
  const queue: string[] = []
  for (const s of seeds) {
    const t = String(s || '').trim()
    if (t) {
      out.add(t)
      queue.push(t)
    }
  }
  let qi = 0
  while (qi < queue.length) {
    const cur = queue[qi++]
    const cn = normStoreKey(cur)
    if (!cn) continue
    for (const [k, v] of Object.entries(map)) {
      const kt = String(k || '').trim()
      const vt = String(v || '').trim()
      if (!kt || !vt) continue
      if (normStoreKey(kt) === cn && !out.has(vt)) {
        out.add(vt)
        queue.push(vt)
      }
      if (normStoreKey(vt) === cn && !out.has(kt)) {
        out.add(kt)
        queue.push(kt)
      }
    }
  }
  return Array.from(out)
}

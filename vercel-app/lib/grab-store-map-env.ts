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
 * Prod Grab Store ID(`3-C6DWPB4VCKK1GT` 등) — menu/campaign sync·주문 공통. **별도 env 권장:**
 * `GRAB_PORTAL_MERCHANT_MAP=3-C6DWPB4VCKK1GT=1040,3-C4NKAA4FCNCUGA=1042,3-C7JGN2B2DFJ1AE=1043`
 * (쉼표로 여러 매장 — Portal ID는 Grab Dashboard 그대로, 공백 없이)
 * True Digital 1040=`3-C6DWPB4VCKK1GT` · Silom 1042=`3-C4NKAA4FCNCUGA` · Ekkamai 1043=`3-C7JGN2B2DFJ1AE`
 * `GRAB_STORE_MAP_JSON`에 `"1042":"CM Silom"`, `"1043":"CM Ekkamai"` 등 ERP store_code 연결.
 * test sandbox `GFSBPOS-811-087` — Prod partner ID에 묶지 말 것.
 * GRAB_* env만 바꿀 때: Vercel Deployments에서 Redeploy 필요(빈 커밋은 ignored-build-step으로 스킵됨).
 */
export function parseGrabPortalMerchantMap(raw?: string): Record<string, string> {
  const s = String(raw ?? process.env.GRAB_PORTAL_MERCHANT_MAP ?? '').trim()
  if (!s) return {}

  if (s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s) as Record<string, unknown>
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

  const out: Record<string, string> = {}
  for (const part of s.split(/[,;\n]+/)) {
    const piece = part.trim()
    if (!piece) continue
    const eq = piece.indexOf('=')
    if (eq <= 0) continue
    const key = piece.slice(0, eq).trim()
    const val = piece.slice(eq + 1).trim()
    if (key && val) out[key] = val
  }
  return out
}

function parseGrabStoreMapJsonObject(raw?: string): Record<string, string> {
  const s = String(raw ?? process.env.GRAB_STORE_MAP_JSON ?? '').trim()
  if (!s) return {}
  try {
    const parsed = JSON.parse(s) as Record<string, unknown>
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
 * Partner menu/campaign API용 merchantID — Grab 대시보드 `3-C…`와 다를 수 있음.
 * 예: `GRAB_PARTNER_API_MENU_MERCHANT_MAP=1040=GFSBPOS-xxx,3-C6DWPB4VCKK1GT=GFSBPOS-xxx`
 */
export function parseGrabPartnerApiMenuMerchantMap(raw?: string): Record<string, string> {
  const s = String(raw ?? process.env.GRAB_PARTNER_API_MENU_MERCHANT_MAP ?? '').trim()
  if (!s) return {}
  if (s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s) as Record<string, unknown>
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
  const out: Record<string, string> = {}
  for (const part of s.split(/[,;\n]+/)) {
    const piece = part.trim()
    if (!piece) continue
    const eq = piece.indexOf('=')
    if (eq <= 0) continue
    const key = piece.slice(0, eq).trim()
    const val = piece.slice(eq + 1).trim()
    if (key && val) out[key] = val
  }
  return out
}

/** `GRAB_PORTAL_MERCHANT_MAP` 값(파트너 스토어 ID) 목록 — 예: 1040, 1042, 1043 */
export function listGrabPartnerStoreCodesFromPortalMap(): string[] {
  const map = parseGrabPortalMerchantMap()
  const out = new Set<string>()
  for (const code of Object.values(map)) {
    const trimmed = String(code ?? '').trim()
    if (trimmed) out.add(trimmed)
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b))
}

/** Prod Grab merchantID → 파트너 스토어 ID(예: `3-C4NKAA4FCNCUGA` → `1042`) */
export function resolveGrabPartnerMerchantIdFromPortalMap(grabMerchantID: string): string {
  const id = String(grabMerchantID || '').trim()
  if (!id) return ''
  return String(parseGrabPortalMerchantMap()[id] ?? '').trim()
}

/** GRAB_STORE_MAP_JSON + GRAB_PORTAL_MERCHANT_MAP 병합 */
export function parseGrabStoreMap(): Record<string, string> {
  const out = parseGrabStoreMapJsonObject()
  for (const [k, v] of Object.entries(parseGrabPortalMerchantMap())) {
    out[k] = v
  }
  return out
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

function lookupGrabStoreMapTarget(map: Record<string, string>, key: string): string {
  const trimmed = String(key || '').trim()
  if (!trimmed) return ''
  const direct = String(map[trimmed] ?? '').trim()
  if (direct) return direct
  const nk = normStoreKey(trimmed)
  if (!nk) return ''
  for (const [k, v] of Object.entries(map)) {
    if (normStoreKey(k) === nk) return String(v || '').trim()
  }
  return ''
}

/**
 * Grab 맵 체인을 따라 ERP `store_code`(예: CM Silom)까지 해석.
 * `GFSBPOS-… → 1042 → CM Silom`처럼 1단계만 매핑된 값도 최종 ERP 코드로 정규화.
 */
export function resolveErpStoreCodeFromGrabMap(seed: string): string {
  const map = parseGrabStoreMap()
  const start = String(seed || '').trim()
  if (!start) return ''

  const chain: string[] = []
  const seen = new Set<string>()
  let cur = start

  for (let guard = 0; guard < 16; guard++) {
    const nk = normStoreKey(cur)
    if (!nk || seen.has(nk)) break
    seen.add(nk)
    chain.push(cur)

    const next = lookupGrabStoreMapTarget(map, cur)
    if (!next || normStoreKey(next) === nk) break
    cur = next
  }

  for (let i = chain.length - 1; i >= 0; i--) {
    const code = chain[i].trim()
    if (code && !/^\d{3,6}$/.test(code)) return code
  }
  return chain[chain.length - 1] || start
}

/** 파트너 스토어 ID(숫자) → ERP store_code 보정 목록 — 기존 Grab POS 주문 repair용 */
export function listGrabPartnerStoreCodeRepairs(): Array<{ from: string; to: string }> {
  const map = parseGrabStoreMap()
  const repairs = new Map<string, string>()
  const seeds = new Set<string>()

  for (const [k, v] of Object.entries(map)) {
    const kt = String(k || '').trim()
    const vt = String(v || '').trim()
    if (kt) seeds.add(kt)
    if (vt) seeds.add(vt)
  }

  for (const code of seeds) {
    if (!/^\d{3,6}$/.test(code)) continue
    const erp = resolveErpStoreCodeFromGrabMap(code)
    if (!erp || erp === code || /^\d{3,6}$/.test(erp)) continue
    repairs.set(code, erp)
  }

  return Array.from(repairs.entries())
    .map(([from, to]) => ({ from, to }))
    .sort((a, b) => a.from.localeCompare(b.from))
}

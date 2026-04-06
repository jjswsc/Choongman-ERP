/**
 * POS store_code(거래처 코드 등) → 화면 표시용 매장명.
 * vendors.gps_name 우선, 없으면 vendors.name.
 */

export type PosStoreVendorLike = { code?: string; name?: string; gps_name?: string }

export function buildPosStoreDisplayNameLookup(
  vendors: PosStoreVendorLike[] | null | undefined
): Map<string, string> {
  const m = new Map<string, string>()
  for (const v of vendors || []) {
    const code = String(v.code ?? "").trim()
    if (!code) continue
    const label =
      String(v.gps_name ?? "").trim() || String(v.name ?? "").trim() || code
    m.set(code, label)
    const upper = code.toUpperCase()
    if (upper !== code) m.set(upper, label)
  }
  return m
}

export function resolvePosStoreDisplayName(
  storeCode: string | null | undefined,
  lookup: Map<string, string>
): string {
  const raw = String(storeCode ?? "").trim()
  if (!raw || raw === "(미지정)") return raw
  const candidates = [
    raw,
    raw.toUpperCase(),
    raw.replace(/^CM\s+/i, "").trim(),
    raw.replace(/^cm\s+/i, "").trim(),
    raw.replace(/\s+/g, ""),
  ].filter(Boolean)
  for (const c of candidates) {
    const hit = lookup.get(c)
    if (hit) return hit
    const digits = c.replace(/\D/g, "")
    if (digits && digits !== c) {
      const h2 = lookup.get(digits)
      if (h2) return h2
    }
  }
  return raw
}

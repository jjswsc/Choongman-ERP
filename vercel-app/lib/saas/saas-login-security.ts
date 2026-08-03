/**
 * Omni SaaS 로그인 보안 — IP allowlist 순수 함수.
 * tenantId 있을 때만 호출측에서 enforce.
 */

export function normalizeIpAllowlist(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || "").trim()).filter(Boolean)
  }
  if (typeof raw === "string") {
    return raw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

/** IPv4 exact or prefix/CIDR (/8~/32). IPv6 exact match only. */
export function ipMatchesAllowlist(clientIp: string, allowlist: string[]): boolean {
  const ip = String(clientIp || "").trim().toLowerCase()
  if (!ip || ip === "unknown") return false
  if (allowlist.length === 0) return false
  for (const entry of allowlist) {
    const rule = entry.trim().toLowerCase()
    if (!rule) continue
    if (rule.includes("/")) {
      const [net, bitsStr] = rule.split("/")
      const bits = Number(bitsStr)
      if (!net || !Number.isFinite(bits) || bits < 0 || bits > 32) continue
      if (ipv4InCidr(ip, net, bits)) return true
      continue
    }
    if (ip === rule) return true
  }
  return false
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const v = Number(p)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = (n << 8) + v
  }
  return n >>> 0
}

function ipv4InCidr(ip: string, network: string, bits: number): boolean {
  const a = ipv4ToInt(ip)
  const b = ipv4ToInt(network)
  if (a == null || b == null) return false
  if (bits === 0) return true
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0
  return (a & mask) === (b & mask)
}

export function clientIpFromHeaders(headers: {
  get(name: string): string | null
}): string {
  const fwd = String(headers.get("x-forwarded-for") || "")
    .split(",")[0]
    ?.trim()
  if (fwd) return fwd
  const real = String(headers.get("x-real-ip") || "").trim()
  if (real) return real
  return "unknown"
}

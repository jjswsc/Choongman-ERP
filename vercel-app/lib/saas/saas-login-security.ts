/**
 * Omni SaaS 로그인 보안 — IP allowlist / TOTP(2FA) 순수 함수.
 * tenantId 있을 때만 호출측에서 enforce.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes)
  let bits = ""
  for (const b of buf) bits += b.toString(2).padStart(8, "0")
  let out = ""
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)]
  }
  return out
}

function base32ToBuffer(secret: string): Buffer {
  const cleaned = String(secret || "")
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "")
  let bits = ""
  for (const c of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(c)
    if (idx < 0) continue
    bits += idx.toString(2).padStart(5, "0")
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }
  return Buffer.from(bytes)
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac("sha1", secret).update(buf).digest()
  const offset = hmac[hmac.length - 1]! & 0xf
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff)
  return String(code % 1_000_000).padStart(6, "0")
}

/** RFC 6238 TOTP (30s step, SHA1, 6 digits) */
export function verifyTotpCode(secret: string, code: string, window = 1, nowMs = Date.now()): boolean {
  const expected = String(code || "").trim()
  if (!/^\d{6}$/.test(expected)) return false
  const key = base32ToBuffer(secret)
  if (key.length < 10) return false
  const step = Math.floor(nowMs / 1000 / 30)
  const want = Buffer.from(expected)
  for (let w = -window; w <= window; w++) {
    const got = Buffer.from(hotp(key, step + w))
    if (got.length === want.length && timingSafeEqual(got, want)) return true
  }
  return false
}

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

/** Pure helpers for QR table session secret hashes (no Next server-only). */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/** Safety cap if hashes ever accumulate; join-secret design normally stores 1–2. */
export const QR_TABLE_MAX_GUEST_DEVICE_HASHES = 16

export function hashQrSessionSecret(raw: string): string {
  return createHash('sha256').update(String(raw || '')).digest('hex')
}

/** Shared secret for every phone that scans the same table QR while the session is open. */
export function deriveQrTableJoinSecret(sessionId: number, tableToken: string): string {
  const id = Math.floor(Number(sessionId) || 0)
  const token = String(tableToken || '')
  return createHmac('sha256', `cm-qr-table-join:${token}`).update(String(id)).digest('base64url')
}

export function parseQrSessionSecretHashes(stored: string): string[] {
  const s = String(stored || '').trim()
  if (!s) return []
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s) as unknown
      if (Array.isArray(parsed)) {
        return uniqueHashes(parsed.map((h) => String(h || '')))
      }
    } catch {
      /* fall through — treat as a single opaque hash */
    }
  }
  return uniqueHashes([s])
}

export function serializeQrSessionSecretHashes(hashes: string[]): string {
  const unique = uniqueHashes(hashes)
  if (unique.length <= 1) return unique[0] || ''
  return JSON.stringify(unique)
}

export function verifyQrSessionSecret(rawSecret: string, stored: string): boolean {
  const hashed = hashQrSessionSecret(rawSecret)
  const a = Buffer.from(hashed, 'hex')
  if (a.length === 0) return false
  let ok = false
  for (const h of parseQrSessionSecretHashes(stored)) {
    const b = Buffer.from(String(h || ''), 'hex')
    if (a.length !== b.length) continue
    try {
      if (timingSafeEqual(a, b)) ok = true
    } catch {
      /* ignore malformed hash */
    }
  }
  return ok
}

function uniqueHashes(hashes: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of hashes) {
    const h = String(raw || '').trim()
    if (!h || seen.has(h)) continue
    seen.add(h)
    out.push(h)
  }
  return out
}

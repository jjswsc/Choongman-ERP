import 'server-only'

import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { QR_TABLE_SESSION_COOKIE } from '@/lib/qr-table-types'
import { hashQrSessionSecret } from '@/lib/qr-table-session-secret-hashes'

export { hashQrSessionSecret, verifyQrSessionSecret } from '@/lib/qr-table-session-secret-hashes'
export { deriveQrTableJoinSecret, parseQrSessionSecretHashes, serializeQrSessionSecretHashes } from '@/lib/qr-table-session-secret-hashes'

const SESSION_MAX_AGE_SEC = 60 * 60 * 8

export function generateQrSessionSecret(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url')
  return { raw, hash: hashQrSessionSecret(raw) }
}

export function generateQrTableTokenValue(): string {
  return randomBytes(18).toString('base64url')
}

export function buildQrSessionCookie(rawSecret: string, sessionId: number): string {
  const value = `${sessionId}.${rawSecret}`
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${QR_TABLE_SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}; HttpOnly; SameSite=Lax${secure}`
}

export function clearQrSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${QR_TABLE_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`
}

export function parseQrSessionAuthValue(
  raw: string | null | undefined
): { sessionId: number; rawSecret: string } | null {
  const v = String(raw || '').trim()
  if (!v) return null
  const dot = v.indexOf('.')
  if (dot <= 0) return null
  const sessionId = Math.floor(Number(v.slice(0, dot)))
  const rawSecret = v.slice(dot + 1)
  if (!sessionId || !rawSecret) return null
  return { sessionId, rawSecret }
}

export function parseQrSessionCookie(
  req: NextRequest
): { sessionId: number; rawSecret: string } | null {
  const fromCookie = req.cookies.get(QR_TABLE_SESSION_COOKIE)?.value
  return parseQrSessionAuthValue(fromCookie)
}

export function qrTableCorsHeaders(): Headers {
  const h = new Headers()
  h.set('Access-Control-Allow-Origin', '*')
  h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-QR-Session')
  return h
}

export function applyQrTableCors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  return res
}

/** Optional bearer: `X-QR-Session: {sessionId}.{secret}` for non-cookie clients */
export function parseQrSessionHeader(
  req: NextRequest
): { sessionId: number; rawSecret: string } | null {
  return parseQrSessionAuthValue(req.headers.get('x-qr-session'))
}

export function resolveQrSessionAuth(req: NextRequest): { sessionId: number; rawSecret: string } | null {
  return parseQrSessionHeader(req) || parseQrSessionCookie(req)
}

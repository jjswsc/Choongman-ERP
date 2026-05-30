import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { createMember, type MemberSummary } from '@/lib/members-server'
import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

export const MEMBER_SESSION_COOKIE = 'cm_member_session'
const OTP_EXPIRE_MINUTES = 5
const SESSION_EXPIRE_DAYS = 90
const OTP_MAX_TRIES = 5

type OtpRow = {
  id?: number
  phone?: string
  otp_hash?: string
  expires_at?: string
  tries?: number
  status?: string
}

type SessionRow = {
  id?: number
  member_id?: number
  session_token_hash?: string
  expires_at?: string
  revoked_at?: string | null
}

type MemberRow = {
  id?: number
  member_no?: string | null
  name?: string | null
  full_name?: string | null
  phone?: string | null
  email?: string | null
  birth_date?: string | null
  gender?: string | null
  nationality?: string | null
  join_channel?: string | null
  source?: string | null
  status?: string | null
  tier_code?: string | null
  point_balance?: number | null
  lifetime_amount?: number | null
  created_at?: string | null
  updated_at?: string | null
}

function toText(v: unknown): string {
  return String(v || '').trim()
}

function normalizePhone(phone: string): string {
  return toText(phone).replace(/[^\d+]/g, '')
}

function isProdLike(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

function otpPepper(): string {
  return (
    toText(process.env.MEMBER_OTP_SECRET) ||
    toText(process.env.JWT_SECRET) ||
    toText(process.env.SUPABASE_ANON_KEY) ||
    'member-otp-fallback'
  )
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(`${otpPepper()}:${raw}`).digest('hex')
}

function genOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function addMinutesBangkok(now: Date, mins: number): string {
  return getBangkokDateTimeString(new Date(now.getTime() + mins * 60 * 1000))
}

function addDaysBangkok(now: Date, days: number): string {
  return getBangkokDateTimeString(new Date(now.getTime() + days * 24 * 60 * 60 * 1000))
}

function buildAnonymousName(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '')
  const suffix = digits.slice(-4) || '0000'
  return `회원${suffix}`
}

async function findMemberByPhone(phone: string): Promise<MemberSummary | null> {
  const rows = (await supabaseSelectFilter(
    'members',
    `phone=eq.${encodeURIComponent(phone)}`,
    { order: 'id.desc', limit: 1 }
  )) as Array<{
    id?: number
    member_no?: string
    name?: string
    full_name?: string
    birth_date?: string
    gender?: string
    nationality?: string
    phone?: string
    email?: string
    join_channel?: string
    source?: string
    status?: string
    tier_code?: string
    point_balance?: number
    lifetime_amount?: number
    created_at?: string
    updated_at?: string
  }>
  const row = rows?.[0]
  if (!row?.id) return null
  return {
    id: Number(row.id),
    memberNo: toText(row.member_no),
    name: toText(row.name),
    fullName: toText(row.full_name),
    birthDate: toText(row.birth_date),
    gender: toText(row.gender),
    nationality: toText(row.nationality),
    phone: toText(row.phone),
    email: toText(row.email),
    joinChannel: toText(row.join_channel),
    source: toText(row.source) || 'app',
    status: toText(row.status) || 'active',
    lineLinked: false,
    tierCode: toText(row.tier_code) || 'BRONZE',
    pointBalance: Number(row.point_balance || 0),
    lifetimeAmount: Number(row.lifetime_amount || 0),
    createdAt: toText(row.created_at),
    updatedAt: toText(row.updated_at),
  }
}

export async function ensureMemberForPortal(params: {
  phone: string
  name?: string
  birthDate?: string
  gender?: string
  nationality?: string
}): Promise<MemberSummary> {
  const phone = normalizePhone(params.phone)
  if (!phone) throw new Error('전화번호가 필요합니다.')
  const existing = await findMemberByPhone(phone)
  if (existing) return existing
  return createMember({
    name: toText(params.name) || buildAnonymousName(phone),
    phone,
    birthDate: toText(params.birthDate) || undefined,
    gender: toText(params.gender) || undefined,
    nationality: toText(params.nationality) || undefined,
    source: 'app',
    joinChannel: 'homepage',
  })
}

export async function issueMemberOtp(phoneRaw: string): Promise<{ expiresAt: string; debugCode?: string }> {
  const phone = normalizePhone(phoneRaw)
  if (!phone) throw new Error('전화번호 형식이 올바르지 않습니다.')
  const code = genOtpCode()
  const now = new Date()
  const expiresAt = addMinutesBangkok(now, OTP_EXPIRE_MINUTES)
  await supabaseInsert('member_login_otps', {
    phone,
    otp_hash: hashToken(code),
    expires_at: expiresAt,
    status: 'issued',
    tries: 0,
    created_at: getBangkokDateTimeString(),
  })
  const debugCode = isProdLike() ? undefined : code
  return { expiresAt, debugCode }
}

async function latestOtp(phone: string): Promise<OtpRow | null> {
  const rows = (await supabaseSelectFilter(
    'member_login_otps',
    `phone=eq.${encodeURIComponent(phone)}&status=eq.issued`,
    { order: 'id.desc', limit: 1 }
  )) as OtpRow[]
  return rows?.[0] || null
}

/** DB `timestamp without time zone` — 방콕 벽시계 문자열과 동일 기준으로 비교 */
function isExpired(ts: string): boolean {
  const raw = toText(ts)
  if (!raw) return true
  return raw < getBangkokDateTimeString()
}

async function markOtp(rowId: number, patch: Record<string, unknown>) {
  await supabaseUpdateByFilter('member_login_otps', `id=eq.${rowId}`, patch)
}

export async function verifyMemberOtp(params: {
  phone: string
  otpCode: string
  deviceLabel?: string
  userAgent?: string
  ip?: string
}): Promise<{ member: MemberSummary; sessionToken: string; expiresAt: string }> {
  const phone = normalizePhone(params.phone)
  const otpCode = toText(params.otpCode)
  if (!phone || !otpCode) throw new Error('전화번호와 인증번호가 필요합니다.')
  const otp = await latestOtp(phone)
  const otpId = Number(otp?.id || 0)
  if (!otpId) throw new Error('인증번호를 다시 요청해 주세요.')
  if (isExpired(toText(otp?.expires_at))) {
    await markOtp(otpId, { status: 'expired' })
    throw new Error('인증번호가 만료되었습니다. 다시 요청해 주세요.')
  }
  const tries = Number(otp?.tries || 0)
  if (tries >= OTP_MAX_TRIES) {
    await markOtp(otpId, { status: 'blocked' })
    throw new Error('인증 시도 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.')
  }
  const expected = toText(otp?.otp_hash)
  if (!expected || expected !== hashToken(otpCode)) {
    await markOtp(otpId, { tries: tries + 1 })
    throw new Error('인증번호가 올바르지 않습니다.')
  }
  await markOtp(otpId, {
    status: 'verified',
    verified_at: getBangkokDateTimeString(),
    tries: tries + 1,
  })
  const member = await ensureMemberForPortal({ phone })
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(rawToken)
  const expiresAt = addDaysBangkok(new Date(), SESSION_EXPIRE_DAYS)
  await supabaseInsert('member_sessions', {
    member_id: member.id,
    session_token_hash: tokenHash,
    device_label: toText(params.deviceLabel) || null,
    user_agent: toText(params.userAgent) || null,
    ip: toText(params.ip) || null,
    expires_at: expiresAt,
    created_at: getBangkokDateTimeString(),
    last_seen_at: getBangkokDateTimeString(),
  })
  return { member, sessionToken: rawToken, expiresAt }
}

export function buildMemberSessionCookie(token: string): string {
  const secure = isProdLike() ? '; Secure' : ''
  return `${MEMBER_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_EXPIRE_DAYS * 24 * 60 * 60}; HttpOnly; SameSite=Lax${secure}`
}

export function buildMemberLogoutCookie(): string {
  const secure = isProdLike() ? '; Secure' : ''
  return `${MEMBER_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`
}

async function getSessionByToken(token: string): Promise<SessionRow | null> {
  const hash = hashToken(token)
  const rows = (await supabaseSelectFilter(
    'member_sessions',
    `session_token_hash=eq.${encodeURIComponent(hash)}`,
    { limit: 1 }
  )) as SessionRow[]
  return rows?.[0] || null
}

export async function getMemberBySessionToken(tokenRaw: string): Promise<MemberSummary | null> {
  const token = toText(tokenRaw)
  if (!token) return null
  const session = await getSessionByToken(token)
  const sessionId = Number(session?.id || 0)
  const memberId = Number(session?.member_id || 0)
  if (!sessionId || !memberId) return null
  if (toText(session?.revoked_at) || isExpired(toText(session?.expires_at))) return null
  await supabaseUpdateByFilter('member_sessions', `id=eq.${sessionId}`, {
    last_seen_at: getBangkokDateTimeString(),
  })
  const rows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, { limit: 1 })) as MemberRow[]
  const row = rows?.[0]
  if (!row?.id) return null
  return {
    id: Number(row.id),
    memberNo: toText(row.member_no),
    name: toText(row.name),
    fullName: toText(row.full_name) || toText(row.name),
    birthDate: toText(row.birth_date),
    gender: toText(row.gender),
    nationality: toText(row.nationality),
    phone: toText(row.phone),
    email: toText(row.email),
    joinChannel: toText(row.join_channel) || 'homepage',
    source: toText(row.source) || 'app',
    status: toText(row.status) || 'active',
    lineLinked: false,
    tierCode: toText(row.tier_code) || 'BRONZE',
    pointBalance: Number(row.point_balance || 0),
    lifetimeAmount: Number(row.lifetime_amount || 0),
    createdAt: toText(row.created_at),
    updatedAt: toText(row.updated_at),
  }
}

export async function revokeMemberSession(tokenRaw: string): Promise<void> {
  const token = toText(tokenRaw)
  if (!token) return
  const hash = hashToken(token)
  await supabaseUpdateByFilter('member_sessions', `session_token_hash=eq.${encodeURIComponent(hash)}`, {
    revoked_at: getBangkokDateTimeString(),
  })
}

export function readMemberTokenFromRequest(req: NextRequest): string {
  return toText(req.cookies.get(MEMBER_SESSION_COOKIE)?.value)
}


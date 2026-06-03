import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  memberBirthDatesMatch,
  memberPhoneLookupVariants,
  normalizeMemberBirthDateInput,
  normalizeMemberPhone,
} from '@/lib/member-phone-lookup'
import { createMember, getMemberSummaryById, type MemberSummary } from '@/lib/members-server'
import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

export const MEMBER_SESSION_COOKIE = 'cm_member_session'
const SESSION_EXPIRE_DAYS = 90
const OTP_MAX_TRIES = 5
const BIRTH_LOGIN_MAX_TRIES = 5
const BIRTH_LOGIN_WINDOW_MINUTES = 15

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

function isMissingColumnError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '')
  return (
    /PGRST204/i.test(msg) ||
    (/column/i.test(msg) && (/does not exist/i.test(msg) || /could not find/i.test(msg)))
  )
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

function addMinutesBangkok(now: Date, mins: number): string {
  return getBangkokDateTimeString(new Date(now.getTime() + mins * 60 * 1000))
}

function addDaysBangkok(now: Date, days: number): string {
  return getBangkokDateTimeString(new Date(now.getTime() + days * 24 * 60 * 60 * 1000))
}

function normalizeBirthDateInput(raw: string): string {
  return normalizeMemberBirthDateInput(raw)
}

function birthDatesMatch(stored: string, input: string): boolean {
  return memberBirthDatesMatch(stored, input)
}

async function findMembersByPhoneVariants(phone: string): Promise<MemberRow[]> {
  const variants = memberPhoneLookupVariants(phone)
  const seen = new Set<number>()
  const out: MemberRow[] = []
  for (const candidate of variants) {
    const found = (await supabaseSelectFilter(
      'members',
      `phone=eq.${encodeURIComponent(candidate)}`,
      { order: 'id.desc', limit: 5 }
    )) as MemberRow[]
    for (const row of found || []) {
      const id = Number(row.id || 0)
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(row)
    }
  }
  return out
}

async function countRecentBirthLoginFailures(phone: string): Promise<number> {
  const since = addMinutesBangkok(new Date(Date.now() - BIRTH_LOGIN_WINDOW_MINUTES * 60 * 1000), 0)
  let total = 0
  for (const candidate of memberPhoneLookupVariants(phone)) {
    const rows = (await supabaseSelectFilter(
      'member_login_otps',
      `phone=eq.${encodeURIComponent(candidate)}&status=eq.birth_fail&created_at=gte.${encodeURIComponent(since)}`,
      { limit: 20 }
    )) as OtpRow[]
    total += rows?.length || 0
  }
  return total
}

async function recordBirthLoginFailure(phone: string): Promise<void> {
  const canonical = memberPhoneLookupVariants(phone)[0] || normalizeMemberPhone(phone)
  await supabaseInsert('member_login_otps', {
    phone: canonical,
    otp_hash: 'birth_fail',
    expires_at: addMinutesBangkok(new Date(), BIRTH_LOGIN_WINDOW_MINUTES),
    status: 'birth_fail',
    tries: 1,
    created_at: getBangkokDateTimeString(),
  })
}

export async function createMemberPortalSession(params: {
  memberId: number
  deviceLabel?: string
  userAgent?: string
  ip?: string
}): Promise<{ sessionToken: string; expiresAt: string }> {
  const memberId = Number(params.memberId || 0)
  if (!memberId) throw new Error('회원 ID가 필요합니다.')
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(rawToken)
  const expiresAt = addDaysBangkok(new Date(), SESSION_EXPIRE_DAYS)
  const now = getBangkokDateTimeString()
  try {
    await supabaseInsert('member_sessions', {
      member_id: memberId,
      session_token_hash: tokenHash,
      device_label: toText(params.deviceLabel) || null,
      user_agent: toText(params.userAgent) || null,
      ip: toText(params.ip) || null,
      expires_at: expiresAt,
      created_at: now,
      last_seen_at: now,
    })
  } catch (e) {
    // 구(舊) 스키마 호환: 일부 컬럼이 없어도 로그인 세션 생성은 계속 진행
    if (!isMissingColumnError(e)) throw e
    await supabaseInsert('member_sessions', {
      member_id: memberId,
      session_token_hash: tokenHash,
      expires_at: expiresAt,
      created_at: now,
    })
  }
  return { sessionToken: rawToken, expiresAt }
}

export type PhoneBirthLoginErrorCode =
  | 'missing_phone'
  | 'missing_birth'
  | 'rate_limited'
  | 'not_found'
  | 'inactive'

export class PhoneBirthLoginError extends Error {
  code: PhoneBirthLoginErrorCode
  constructor(code: PhoneBirthLoginErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export type PhoneBirthSignupErrorCode =
  | 'missing_name'
  | 'missing_phone'
  | 'missing_birth'
  | 'missing_gender'
  | 'rate_limited'
  | 'exists_other_birth'
  | 'inactive'

export class PhoneBirthSignupError extends Error {
  code: PhoneBirthSignupErrorCode
  constructor(code: PhoneBirthSignupErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export async function verifyMemberByPhoneBirthDate(params: {
  phone: string
  birthDate: string
  deviceLabel?: string
  userAgent?: string
  ip?: string
}): Promise<{ member: MemberSummary; sessionToken: string; expiresAt: string }> {
  const phone = normalizeMemberPhone(params.phone)
  const birthDate = normalizeBirthDateInput(params.birthDate)
  if (!phone) throw new PhoneBirthLoginError('missing_phone', '전화번호를 입력해 주세요.')
  if (!birthDate) throw new PhoneBirthLoginError('missing_birth', '생년월일을 입력해 주세요.')

  const failCount = await countRecentBirthLoginFailures(phone)
  if (failCount >= BIRTH_LOGIN_MAX_TRIES) {
    throw new PhoneBirthLoginError('rate_limited', '로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해 주세요.')
  }

  const rows = await findMembersByPhoneVariants(phone)
  let matched =
    (rows || []).find((row) => birthDatesMatch(toText(row.birth_date), birthDate)) || null

  // CRM/LINE 이관 회원: 전화번호만 있고 생년월일이 비어 있으면 첫 로그인 시 저장
  if (!matched && rows.length === 1 && !normalizeBirthDateInput(toText(rows[0].birth_date))) {
    matched = rows[0]
    await supabaseUpdateByFilter('members', `id=eq.${Number(matched.id)}`, {
      birth_date: birthDate,
      updated_at: getBangkokDateTimeString(),
    })
    matched = { ...matched, birth_date: birthDate }
  }

  if (!matched?.id) {
    await recordBirthLoginFailure(phone)
    throw new PhoneBirthLoginError(
      'not_found',
      '등록된 회원 정보와 일치하지 않습니다. 전화번호와 생년월일을 확인해 주세요.'
    )
  }
  if (toText(matched.status) === 'inactive') {
    throw new PhoneBirthLoginError('inactive', '비활성화된 회원입니다. 매장에 문의해 주세요.')
  }

  const member: MemberSummary = {
    id: Number(matched.id),
    memberNo: toText(matched.member_no),
    name: toText(matched.name),
    fullName: toText(matched.full_name) || toText(matched.name),
    birthDate: toText(matched.birth_date),
    gender: toText(matched.gender),
    nationality: toText(matched.nationality),
    phone: toText(matched.phone),
    email: toText(matched.email),
    joinChannel: toText(matched.join_channel),
    source: toText(matched.source) || 'app',
    status: toText(matched.status) || 'active',
    lineLinked: false,
    tierCode: toText(matched.tier_code) || 'BRONZE',
    pointBalance: Number(matched.point_balance || 0),
    lifetimeAmount: Number(matched.lifetime_amount || 0),
    createdAt: toText(matched.created_at),
    updatedAt: toText(matched.updated_at),
  }

  const session = await createMemberPortalSession({
    memberId: member.id,
    deviceLabel: params.deviceLabel,
    userAgent: params.userAgent,
    ip: params.ip,
  })
  return { member, sessionToken: session.sessionToken, expiresAt: session.expiresAt }
}

function normalizeMemberGender(raw: string): string {
  const v = toText(raw).toUpperCase()
  if (v === 'M' || v === 'MALE' || v === 'ชาย') return 'M'
  if (v === 'F' || v === 'FEMALE' || v === 'หญิง') return 'F'
  return ''
}

export async function registerMemberByPhoneBirthDate(params: {
  name: string
  phone: string
  birthDate: string
  gender?: string
  consentMarketing?: boolean
  userAgent?: string
  deviceLabel?: string
  ip?: string
}): Promise<{
  member: MemberSummary
  sessionToken: string
  expiresAt: string
  created: boolean
  welcomeCouponIssued: boolean
}> {
  const name = toText(params.name)
  const phone = normalizeMemberPhone(params.phone)
  const birthDate = normalizeBirthDateInput(params.birthDate)
  const gender = normalizeMemberGender(params.gender || '')
  if (!name) throw new PhoneBirthSignupError('missing_name', '이름을 입력해 주세요.')
  if (!phone) throw new PhoneBirthSignupError('missing_phone', '전화번호를 입력해 주세요.')
  if (!birthDate) throw new PhoneBirthSignupError('missing_birth', '생년월일을 입력해 주세요.')
  if (!gender) throw new PhoneBirthSignupError('missing_gender', '성별을 선택해 주세요.')

  const failCount = await countRecentBirthLoginFailures(phone)
  if (failCount >= BIRTH_LOGIN_MAX_TRIES) {
    throw new PhoneBirthSignupError('rate_limited', '로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해 주세요.')
  }

  const rows = await findMembersByPhoneVariants(phone)
  const matched = rows.find((row) => birthDatesMatch(toText(row.birth_date), birthDate))

  if (matched?.id) {
    if (toText(matched.status) === 'inactive') {
      throw new PhoneBirthSignupError('inactive', '비활성화된 회원입니다. 매장에 문의해 주세요.')
    }
    const member = await getMemberSummaryById(Number(matched.id))
    if (!member) throw new PhoneBirthSignupError('inactive', '회원 정보를 찾을 수 없습니다.')
    const session = await createMemberPortalSession({
      memberId: member.id,
      deviceLabel: params.deviceLabel || 'member-signup',
      userAgent: params.userAgent,
      ip: params.ip,
    })
    return {
      member,
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt,
      created: false,
      welcomeCouponIssued: false,
    }
  }

  if (rows.length > 0) {
    await recordBirthLoginFailure(phone)
    throw new PhoneBirthSignupError(
      'exists_other_birth',
      '등록된 회원 정보와 일치하지 않습니다. 전화번호와 생년월일을 확인해 주세요.'
    )
  }

  const consentMarketing = Boolean(params.consentMarketing)
  const member = await createMember({
    name,
    phone,
    birthDate,
    gender,
    source: 'app',
    joinChannel: 'homepage',
    consentMarketing,
  })
  const session = await createMemberPortalSession({
    memberId: member.id,
    deviceLabel: params.deviceLabel || 'member-signup',
    userAgent: params.userAgent,
    ip: params.ip,
  })
  const { issueSignupWelcomeCouponIfEligible } = await import('@/lib/member-portal-signup-welcome-coupon')
  const welcomeCouponIssued = await issueSignupWelcomeCouponIfEligible({
    memberId: member.id,
    created: true,
    consentMarketing,
  })
  return {
    member,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
    created: true,
    welcomeCouponIssued,
  }
}

export async function createMemberPortalSessionForMember(params: {
  member: MemberSummary
  deviceLabel?: string
  userAgent?: string
  ip?: string
}): Promise<{ member: MemberSummary; sessionToken: string; expiresAt: string }> {
  const session = await createMemberPortalSession({
    memberId: params.member.id,
    deviceLabel: params.deviceLabel,
    userAgent: params.userAgent,
    ip: params.ip,
  })
  return { member: params.member, sessionToken: session.sessionToken, expiresAt: session.expiresAt }
}

function buildAnonymousName(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '')
  const suffix = digits.slice(-4) || '0000'
  return `회원${suffix}`
}

async function findMemberByPhone(phone: string): Promise<MemberSummary | null> {
  const rows = await findMembersByPhoneVariants(phone)
  const row = rows[0]
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
  const phone = normalizeMemberPhone(params.phone)
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

export async function issueMemberOtp(_phoneRaw: string): Promise<never> {
  throw new Error('SMS OTP 로그인은 사용하지 않습니다. LINE 로그인 또는 전화번호+생년월일을 이용해 주세요.')
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
  const phone = normalizeMemberPhone(params.phone)
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
  const session = await createMemberPortalSession({
    memberId: member.id,
    deviceLabel: params.deviceLabel,
    userAgent: params.userAgent,
    ip: params.ip,
  })
  return { member, sessionToken: session.sessionToken, expiresAt: session.expiresAt }
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
  try {
    await supabaseUpdateByFilter('member_sessions', `id=eq.${sessionId}`, {
      last_seen_at: getBangkokDateTimeString(),
    })
  } catch (e) {
    if (!isMissingColumnError(e)) throw e
  }
  return getMemberSummaryById(memberId)
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


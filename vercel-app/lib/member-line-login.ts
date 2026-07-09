import crypto, { createHmac, timingSafeEqual } from 'crypto'
import { registerLineMember, updateMemberLineOaFriend } from '@/lib/members-server'

const LINE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000

function toText(v: unknown): string {
  return String(v || '').trim()
}

/** LINE Login Channel ID는 숫자만 (Messaging API Channel ID와 동일 형식). U… 는 사용자 ID라 거부 */
export function isValidLineLoginChannelId(channelId: string): boolean {
  const id = toText(channelId)
  if (!id) return false
  if (/^U[a-f0-9]{32}$/i.test(id)) return false
  return /^\d{6,12}$/.test(id)
}

export function getLineLoginConfigIssue(): string | null {
  const channelId = toText(process.env.LINE_LOGIN_CHANNEL_ID)
  const channelSecret =
    toText(process.env.LINE_LOGIN_CHANNEL_SECRET) || toText(process.env.LINE_CHANNEL_SECRET)
  if (!channelId && !channelSecret) return 'missing'
  if (!channelId) return 'missing_channel_id'
  if (!channelSecret) return 'missing_channel_secret'
  if (!isValidLineLoginChannelId(channelId)) return 'invalid_channel_id'
  return null
}

export type LineBotPrompt = 'normal' | 'aggressive'

export type LineLoginConfig = {
  channelId: string
  channelSecret: string
  botPrompt: LineBotPrompt | null
}

export function resolveLineLoginBotPrompt(): LineBotPrompt | null {
  const raw = toText(process.env.LINE_LOGIN_BOT_PROMPT).toLowerCase()
  if (!raw || raw === 'off' || raw === '0' || raw === 'false' || raw === 'none') return null
  if (raw === 'aggressive') return 'aggressive'
  return 'normal'
}

export function getLineLoginConfig(): LineLoginConfig | null {
  if (getLineLoginConfigIssue()) return null
  const channelId = toText(process.env.LINE_LOGIN_CHANNEL_ID)
  const channelSecret =
    toText(process.env.LINE_LOGIN_CHANNEL_SECRET) || toText(process.env.LINE_CHANNEL_SECRET)
  return { channelId, channelSecret, botPrompt: resolveLineLoginBotPrompt() }
}

export function isLineLoginConfigured(): boolean {
  return getLineLoginConfig() !== null
}

export function resolveMemberPortalOrigin(fallbackOrigin?: string): string {
  const fromEnv =
    toText(process.env.DEPLOY_PUBLIC_ORIGIN) ||
    toText(process.env.NEXT_PUBLIC_DEPLOY_PUBLIC_ORIGIN)
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  const fb = toText(fallbackOrigin).replace(/\/+$/, '')
  if (fb) return fb
  return 'http://localhost:3000'
}

export function buildLineLoginCallbackUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/member-portal/auth/line/callback`
}

function getLineOAuthStateSecret(): string {
  const explicit = toText(process.env.LINE_LOGIN_STATE_SECRET)
  if (explicit.length >= 16) return explicit
  const loginSecret =
    toText(process.env.LINE_LOGIN_CHANNEL_SECRET) || toText(process.env.LINE_CHANNEL_SECRET)
  if (loginSecret.length >= 16) return loginSecret
  const jwt = toText(process.env.JWT_SECRET)
  if (jwt.length >= 16) return jwt
  return 'cm-erp-line-oauth-dev-only'
}

function signLineOAuthStateBody(body: string): string {
  return createHmac('sha256', getLineOAuthStateSecret()).update(body, 'utf8').digest('base64url')
}

/** LINE 앱 복귀 시 쿠키가 빠지는 모바일 환경용 — state 자체에 서명·만료를 담음 */
export function createLineOAuthState(joinStoreCode?: string): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const issuedAt = Date.now()
  const joinStore = encodeURIComponent(toText(joinStoreCode))
  const body = `${nonce}.${issuedAt}.${joinStore}`
  const sig = signLineOAuthStateBody(body)
  return `${body}.${sig}`
}

export function verifyLineOAuthState(state: string): {
  ok: boolean
  joinStoreCode?: string
  reason?: 'invalid_format' | 'bad_signature' | 'expired'
} {
  const raw = toText(state)
  const parts = raw.split('.')
  if (parts.length !== 4) return { ok: false, reason: 'invalid_format' }
  const [nonce, issuedAtStr, joinStoreEnc, sig] = parts
  if (!nonce || !issuedAtStr || joinStoreEnc === undefined || !sig) {
    return { ok: false, reason: 'invalid_format' }
  }
  const issuedAt = Number(issuedAtStr)
  if (!Number.isFinite(issuedAt)) return { ok: false, reason: 'invalid_format' }
  const ageMs = Date.now() - issuedAt
  if (ageMs > LINE_OAUTH_STATE_TTL_MS || ageMs < -60_000) {
    return { ok: false, reason: 'expired' }
  }
  const body = `${nonce}.${issuedAtStr}.${joinStoreEnc}`
  const expected = signLineOAuthStateBody(body)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'bad_signature' }
    }
  } catch {
    return { ok: false, reason: 'bad_signature' }
  }
  let joinStoreCode = ''
  try {
    joinStoreCode = decodeURIComponent(joinStoreEnc)
  } catch {
    joinStoreCode = ''
  }
  return { ok: true, joinStoreCode: joinStoreCode || undefined }
}

export function buildLineOAuthStateCookie(state: string, secure: boolean): string {
  const flags = secure ? '; Secure' : ''
  return `cm_line_oauth_state=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${flags}`
}

export function buildLineOAuthStateClearCookie(secure: boolean): string {
  const flags = secure ? '; Secure' : ''
  return `cm_line_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${flags}`
}

export function buildLineJoinStoreCookie(joinStoreCode: string, secure: boolean): string {
  const flags = secure ? '; Secure' : ''
  const value = encodeURIComponent(String(joinStoreCode || '').trim())
  return `cm_line_join_store=${value}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${flags}`
}

export function buildLineJoinStoreClearCookie(secure: boolean): string {
  const flags = secure ? '; Secure' : ''
  return `cm_line_join_store=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${flags}`
}

export function readLineJoinStoreCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return ''
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === 'cm_line_join_store') return decodeURIComponent(rest.join('='))
  }
  return ''
}

export function readLineOAuthStateCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return ''
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === 'cm_line_oauth_state') return decodeURIComponent(rest.join('='))
  }
  return ''
}

export function buildLineAuthorizeUrl(params: {
  origin: string
  state: string
}): string {
  const cfg = getLineLoginConfig()
  if (!cfg) throw new Error('LINE 로그인 설정이 없습니다.')
  const redirectUri = buildLineLoginCallbackUrl(params.origin)
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.channelId,
    redirect_uri: redirectUri,
    state: params.state,
    scope: 'profile openid',
  })
  if (cfg.botPrompt) q.set('bot_prompt', cfg.botPrompt)
  return `https://access.line.me/oauth2/v2.1/authorize?${q.toString()}`
}

type LineTokenResponse = {
  access_token?: string
  id_token?: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
}

type LineProfile = {
  userId?: string
  displayName?: string
  pictureUrl?: string
}

export async function fetchLineFriendshipStatus(accessToken: string): Promise<boolean | null> {
  const token = toText(accessToken)
  if (!token) return null
  const res = await fetch('https://api.line.me/friendship/v1/status', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) return null
  try {
    const json = JSON.parse(text) as { friendFlag?: boolean }
    return Boolean(json.friendFlag)
  } catch {
    return null
  }
}

export async function exchangeLineAuthCode(params: {
  code: string
  origin: string
}): Promise<{ accessToken: string; profile: LineProfile; friendFlag: boolean | null }> {
  const cfg = getLineLoginConfig()
  if (!cfg) throw new Error('LINE 로그인 설정이 없습니다.')
  const redirectUri = buildLineLoginCallbackUrl(params.origin)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: redirectUri,
    client_id: cfg.channelId,
    client_secret: cfg.channelSecret,
  })
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const tokenText = await tokenRes.text()
  let tokenJson: LineTokenResponse = {}
  try {
    tokenJson = tokenText ? (JSON.parse(tokenText) as LineTokenResponse) : {}
  } catch {
    tokenJson = {}
  }
  if (!tokenRes.ok || !toText(tokenJson.access_token)) {
    throw new Error(`LINE 토큰 교환 실패: ${tokenText || tokenRes.status}`)
  }

  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })
  const profileText = await profileRes.text()
  let profile: LineProfile = {}
  try {
    profile = profileText ? (JSON.parse(profileText) as LineProfile) : {}
  } catch {
    profile = {}
  }
  if (!profileRes.ok || !toText(profile.userId)) {
    throw new Error(`LINE 프로필 조회 실패: ${profileText || profileRes.status}`)
  }

  const friendFlag = await fetchLineFriendshipStatus(toText(tokenJson.access_token))

  return {
    accessToken: toText(tokenJson.access_token),
    profile,
    friendFlag,
  }
}

export async function loginMemberWithLineProfile(
  profile: LineProfile,
  options?: { friendFlag?: boolean | null; friendshipStatusChanged?: boolean; joinStoreCode?: string }
) {
  const lineUserId = toText(profile.userId)
  if (!lineUserId) throw new Error('LINE 사용자 ID가 없습니다.')
  const member = await registerLineMember({
    lineUserId,
    displayName: toText(profile.displayName),
    pictureUrl: toText(profile.pictureUrl),
    name: toText(profile.displayName),
    joinStoreCode: toText(options?.joinStoreCode),
  })
  if (options?.friendFlag != null) {
    await updateMemberLineOaFriend({
      memberId: member.id,
      friendFlag: Boolean(options.friendFlag),
      friendshipStatusChanged: Boolean(options.friendshipStatusChanged),
    })
  }
  return member
}

import crypto from 'crypto'
import { registerLineMember, updateMemberLineOaFriend } from '@/lib/members-server'

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

export function createLineOAuthState(): string {
  return crypto.randomBytes(24).toString('hex')
}

export function buildLineOAuthStateCookie(state: string, secure: boolean): string {
  const flags = secure ? '; Secure' : ''
  return `cm_line_oauth_state=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${flags}`
}

export function buildLineOAuthStateClearCookie(secure: boolean): string {
  const flags = secure ? '; Secure' : ''
  return `cm_line_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${flags}`
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
  options?: { friendFlag?: boolean | null; friendshipStatusChanged?: boolean }
) {
  const lineUserId = toText(profile.userId)
  if (!lineUserId) throw new Error('LINE 사용자 ID가 없습니다.')
  const member = await registerLineMember({
    lineUserId,
    displayName: toText(profile.displayName),
    pictureUrl: toText(profile.pictureUrl),
    name: toText(profile.displayName),
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

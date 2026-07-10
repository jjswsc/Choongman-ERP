type LineFollowerIdsResponse = {
  userIds?: string[]
  next?: string
}

type LineProfileResponse = {
  userId?: string
  displayName?: string
  pictureUrl?: string
  statusMessage?: string
}

function getLineAccessToken(): string {
  return String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()
}

function getLineApiBase(): string {
  return 'https://api.line.me'
}

async function lineFetch(path: string): Promise<Response> {
  const token = getLineAccessToken()
  if (!token) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN이 설정되지 않았습니다.')
  }
  return fetch(getLineApiBase() + path, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  })
}

export async function getLineUserProfile(userId: string): Promise<{ displayName: string; pictureUrl: string }> {
  const normalized = String(userId || '').trim()
  if (!normalized) return { displayName: '', pictureUrl: '' }

  const res = await lineFetch(`/v2/bot/profile/${encodeURIComponent(normalized)}`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`LINE profile 조회 실패(${res.status}): ${body}`)
  }
  const json = (await res.json()) as LineProfileResponse
  return {
    displayName: String(json.displayName || '').trim(),
    pictureUrl: String(json.pictureUrl || '').trim(),
  }
}

export async function pushLineTextMessage(params: {
  userId: string
  text: string
}): Promise<{ ok: boolean; message?: string }> {
  return pushLineMessages({
    userId: params.userId,
    messages: [{ type: 'text', text: params.text }],
  })
}

export type LinePushMessage =
  | { type: 'text'; text: string }
  | { type: 'flex'; altText: string; contents: Record<string, unknown> }

export async function pushLineMessages(params: {
  userId: string
  messages: LinePushMessage[]
}): Promise<{ ok: boolean; message?: string }> {
  const token = getLineAccessToken()
  if (!token) return { ok: false, message: 'no_token' }

  const userId = String(params.userId || '').trim()
  const messages = (params.messages || [])
    .map((msg) => {
      if (msg.type === 'text') {
        const text = String(msg.text || '').trim()
        if (!text) return null
        return { type: 'text' as const, text: text.slice(0, 5000) }
      }
      const altText = String(msg.altText || '').trim()
      if (!altText || !msg.contents) return null
      return {
        type: 'flex' as const,
        altText: altText.slice(0, 400),
        contents: msg.contents,
      }
    })
    .filter(Boolean)
  if (!userId || messages.length === 0) return { ok: false, message: 'invalid_params' }

  const res = await fetch(`${getLineApiBase()}/v2/bot/message/push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: userId, messages }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, message: `line_push_${res.status}:${body.slice(0, 200)}` }
  }
  return { ok: true }
}

export async function getLineFollowerIds(params?: { limit?: number; cursor?: string }): Promise<{ userIds: string[]; next: string }> {
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 1000))
  const q = new URLSearchParams()
  q.set('limit', String(limit))
  if (params?.cursor) q.set('start', String(params.cursor))

  const suffix = q.toString()
  const res = await lineFetch('/v2/bot/followers/ids' + (suffix ? `?${suffix}` : ''))
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`LINE follower 목록 조회 실패(${res.status}): ${body}`)
  }
  const json = (await res.json()) as LineFollowerIdsResponse
  return {
    userIds: Array.isArray(json.userIds) ? json.userIds.map((x) => String(x || '').trim()).filter(Boolean) : [],
    next: String(json.next || '').trim(),
  }
}

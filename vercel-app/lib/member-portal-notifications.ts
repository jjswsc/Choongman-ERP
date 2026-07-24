/** 멤버 앱 인앱 알림(벨) — 읽음 시각·활동 병합 */

export type MemberPortalNotifKind = 'point' | 'stamp'

export type MemberPortalNotifItem = {
  id: string
  kind: MemberPortalNotifKind
  createdAt: string
  points?: number
  pointKind?: string
  stampKind?: string
  stampBalanceAfter?: number
  storeCode?: string
  note?: string
}

const SEEN_KEY_PREFIX = 'mp-notif-seen-at-'

export function memberPortalNotifSeenStorageKey(memberId: number): string {
  return `${SEEN_KEY_PREFIX}${Math.trunc(memberId)}`
}

export function readMemberPortalNotifSeenAt(memberId: number): string | null {
  if (typeof window === 'undefined' || !memberId) return null
  try {
    const v = String(localStorage.getItem(memberPortalNotifSeenStorageKey(memberId)) || '').trim()
    return v || null
  } catch {
    return null
  }
}

export function writeMemberPortalNotifSeenAt(memberId: number, isoOrBangkok: string): void {
  if (typeof window === 'undefined' || !memberId) return
  try {
    localStorage.setItem(memberPortalNotifSeenStorageKey(memberId), String(isoOrBangkok || '').trim() || new Date().toISOString())
  } catch {
    /* ignore */
  }
}

export function parseMemberPortalNotifTime(raw: string): number {
  const v = String(raw || '').trim()
  if (!v) return 0
  // ISO / 오프셋 있음
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) {
    const d = new Date(v)
    const t = d.getTime()
    return Number.isFinite(t) ? t : 0
  }
  // naive — 방콕(Asia/Bangkok, UTC+7)로 해석 (원장 created_at 과 동일)
  const normalized = v.includes('T') ? v : v.replace(' ', 'T')
  const d = new Date(`${normalized}+07:00`)
  const t = d.getTime()
  return Number.isFinite(t) ? t : 0
}

/** 방콕 벽시계 문자열 (원장 created_at 과 비교용) */
export function bangkokNowDateTimeString(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

/** 읽지 않은 활동이 있으면 true. 미열람이면 최근 7일 활동만 뱃지. */
export function hasUnreadMemberPortalNotifications(
  items: MemberPortalNotifItem[],
  seenAt: string | null,
  nowMs = Date.now()
): boolean {
  if (!items.length) return false
  const seenMs = seenAt ? parseMemberPortalNotifTime(seenAt) : 0
  const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000
  for (const item of items) {
    const at = parseMemberPortalNotifTime(item.createdAt)
    if (!at) continue
    if (seenMs > 0) {
      if (at > seenMs) return true
    } else if (at >= weekAgo) {
      return true
    }
  }
  return false
}

export function mergeMemberPortalNotificationItems(params: {
  points: Array<{ id: number; kind: string; points: number; note?: string; createdAt: string }>
  stamps: Array<{
    id: number
    kind: string
    storeCode?: string
    balanceAfter?: number
    note?: string
    createdAt: string
  }>
  limit?: number
}): MemberPortalNotifItem[] {
  const limit = Math.max(1, Math.min(Number(params.limit || 40), 80))
  const out: MemberPortalNotifItem[] = []
  for (const row of params.points || []) {
    const kind = String(row.kind || '').toLowerCase()
    if (!kind || kind === 'expire') continue
    out.push({
      id: `point:${row.id}`,
      kind: 'point',
      createdAt: String(row.createdAt || ''),
      points: Number(row.points || 0),
      pointKind: kind,
      note: String(row.note || ''),
    })
  }
  for (const row of params.stamps || []) {
    out.push({
      id: `stamp:${row.id}`,
      kind: 'stamp',
      createdAt: String(row.createdAt || ''),
      stampKind: String(row.kind || 'earn').toLowerCase(),
      stampBalanceAfter: Math.max(0, Math.trunc(Number(row.balanceAfter || 0))),
      storeCode: String(row.storeCode || ''),
      note: String(row.note || ''),
    })
  }
  out.sort((a, b) => parseMemberPortalNotifTime(b.createdAt) - parseMemberPortalNotifTime(a.createdAt))
  return out.slice(0, limit)
}

/** QR 손님 앱 — 이미 주방으로 보낸 라인 집계 (표시용). */

import {
  getBangkokDateTimeString,
  normalizeBangkokDateTimeCompareKey,
  parseBangkokWallClockToMs,
} from '@/lib/bangkok-time'

export type QrGuestSentLine = {
  name: string
  qty: number
  price: number
  buffetIncluded: boolean
}

export type QrGuestSentLineInput = {
  id?: unknown
  name?: string
  qty?: number
  quantity?: number
  price?: number
  buffetIncluded?: boolean
  cancelled?: boolean
  addedAt?: unknown
  isBuffetEntry?: boolean
}

export type QrGuestSentTimeGroup = {
  key: string
  addedAt: string | null
  timeLabel: string
  lines: QrGuestSentLine[]
}

/** 같은 전송(주방 슬립 1장)으로 묶을 허용 오차 — 레거시 QR id의 Date.now() 드리프트 대비 */
const QR_GUEST_ORDER_CLUSTER_MS = 2500
const QR_LINE_ID_MS_RE = /^qr-\d+-\d+-(\d{12,13})-[a-z0-9]+$/i

function lineQty(raw: QrGuestSentLineInput): number {
  return Math.max(0, Math.floor(Number(raw.qty ?? raw.quantity ?? 0) || 0))
}

function toSentLine(raw: QrGuestSentLineInput): QrGuestSentLine | null {
  if (raw?.cancelled === true) return null
  const qty = lineQty(raw)
  if (!qty) return null
  return {
    name: String(raw.name || '').trim() || '—',
    qty,
    price: Math.max(0, Number(raw.price) || 0),
    buffetIncluded: raw.buffetIncluded === true,
  }
}

function sentLineKey(line: QrGuestSentLine): string {
  return `${line.buffetIncluded ? 'in' : 'ex'}|${line.name}|${line.price}`
}

function mergeSentLine(into: QrGuestSentLine[], line: QrGuestSentLine) {
  const key = sentLineKey(line)
  const prev = into.find((row) => sentLineKey(row) === key)
  if (prev) prev.qty += line.qty
  else into.push({ ...line })
}

export function aggregateQrGuestSentLines(
  items: QrGuestSentLineInput[] | null | undefined
): QrGuestSentLine[] {
  const map = new Map<string, QrGuestSentLine>()
  for (const raw of items || []) {
    const line = toSentLine(raw)
    if (!line) continue
    const key = sentLineKey(line)
    const prev = map.get(key)
    if (prev) prev.qty += line.qty
    else map.set(key, { ...line })
  }
  return [...map.values()]
}

function isBuffetEntryLine(raw: QrGuestSentLineInput): boolean {
  if (raw.isBuffetEntry === true) return true
  return String(raw.id || '').trim().toLowerCase().startsWith('buffet-entry-')
}

/** 줄의 주문 시각(ms). addedAt → QR id epoch → 뷔페 입장 폴백. */
export function resolveQrGuestLineAddedAtMs(
  raw: QrGuestSentLineInput,
  fallbackCreatedAt?: string | null
): number | null {
  const fromField = parseBangkokWallClockToMs(String(raw.addedAt || '').trim())
  if (fromField != null) return fromField
  const id = String(raw.id || '').trim()
  const m = id.match(QR_LINE_ID_MS_RE)
  if (m) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 1e12) return n
  }
  if (isBuffetEntryLine(raw)) return parseBangkokWallClockToMs(fallbackCreatedAt)
  return null
}

export function formatQrGuestOrderClock(addedAt: string | null | undefined): string {
  const key = normalizeBangkokDateTimeCompareKey(addedAt)
  const m = key.match(/ (\d{2}:\d{2}:\d{2})$/)
  return m?.[1] || ''
}

/**
 * 주방으로 보낸 시각별로 묶는다. 같은 전송(수 초 이내)은 한 블록.
 * 시각을 모르는 줄은 맨 앞 ‘이전’ 그룹.
 */
export function groupQrGuestSentLinesByTime(
  items: QrGuestSentLineInput[] | null | undefined,
  fallbackCreatedAt?: string | null
): QrGuestSentTimeGroup[] {
  const rows = (items || [])
    .map((raw) => {
      const line = toSentLine(raw)
      if (!line) return null
      return { line, ms: resolveQrGuestLineAddedAtMs(raw, fallbackCreatedAt) }
    })
    .filter((row): row is { line: QrGuestSentLine; ms: number | null } => row != null)

  rows.sort((a, b) => {
    if (a.ms == null && b.ms == null) return 0
    if (a.ms == null) return -1
    if (b.ms == null) return 1
    return a.ms - b.ms
  })

  const buckets: Array<{ startMs: number | null; lines: QrGuestSentLine[] }> = []
  for (const row of rows) {
    const last = buckets[buckets.length - 1]
    const sameUnknown = last != null && last.startMs == null && row.ms == null
    const sameCluster =
      last != null &&
      last.startMs != null &&
      row.ms != null &&
      row.ms - last.startMs <= QR_GUEST_ORDER_CLUSTER_MS
    if (last && (sameUnknown || sameCluster)) {
      mergeSentLine(last.lines, row.line)
      continue
    }
    buckets.push({ startMs: row.ms, lines: [{ ...row.line }] })
  }

  return buckets.map((bucket, index) => {
    const addedAt = bucket.startMs != null ? getBangkokDateTimeString(new Date(bucket.startMs)) : null
    return {
      key: addedAt || `none-${index}`,
      addedAt,
      timeLabel: formatQrGuestOrderClock(addedAt),
      lines: bucket.lines,
    }
  })
}

/**
 * 패키지별 Included / Extra 분리.
 * extraIds가 비어 있으면 Extra = 포함이 아닌 홀 메뉴 전체(기존 동작).
 * extraIds가 있으면 Extra 탭에는 그 메뉴만 표시.
 */
export function splitQrGuestMenusByTier<T extends { menuId: number }>(params: {
  menus: T[]
  includedIds: Iterable<number>
  extraIds?: Iterable<number> | null
}): { included: T[]; extras: T[] } {
  const included = new Set([...params.includedIds].map((n) => Math.floor(Number(n) || 0)).filter(Boolean))
  const extraAllow = new Set(
    [...(params.extraIds || [])].map((n) => Math.floor(Number(n) || 0)).filter(Boolean)
  )
  const limitExtras = extraAllow.size > 0
  const includedOut: T[] = []
  const extrasOut: T[] = []
  for (const m of params.menus) {
    const id = Math.floor(Number(m.menuId) || 0)
    if (!id) continue
    if (included.has(id)) {
      includedOut.push(m)
      continue
    }
    if (limitExtras && !extraAllow.has(id)) continue
    extrasOut.push(m)
  }
  return { included: includedOut, extras: extrasOut }
}

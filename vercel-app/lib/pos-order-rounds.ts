/**
 * 같은 테이블 주문의 주문 회차(รอบที่ N).
 * 줄의 `addedAt`(QR 제출·POS 추가 시각)으로 묶는다. POS 저장으로 지워진 예전 QR 줄은 id 안의 시각을 쓴다.
 * 시각이 없는 줄은 바로 앞 줄의 회차를 따른다(items_json 은 추가 순서대로 이어 붙는다).
 */

import { isQrBuffetPackageKitchenSkipLine } from '@/lib/pos-qr-buffet-entry'

/** 이 간격 안에 들어온 줄은 같은 회차(한 번의 제출) */
export const POS_ORDER_ROUND_GAP_MS = 5_000

export type PosOrderRoundLine = {
  id?: unknown
  addedAt?: unknown
  added_at?: unknown
  isBuffetEntry?: unknown
}

export type PosOrderRound = {
  round: number
  atMs: number | null
}

const QR_LINE_ID_TS = /^qr-\d+-[^-]+-(\d{13})-/i

/** "YYYY-MM-DD HH:mm(:ss)" 는 방콕 벽시계, 그 외는 ISO 로 해석 */
export function parsePosLineAddedAtMs(raw: unknown): number | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const wall = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (wall) {
    const ms = Date.parse(`${wall[1]}-${wall[2]}-${wall[3]}T${wall[4]}:${wall[5]}:${wall[6] || '00'}+07:00`)
    return Number.isNaN(ms) ? null : ms
  }
  const ms = Date.parse(s)
  return Number.isNaN(ms) ? null : ms
}

export function resolvePosLineAddedAtMs(line: PosOrderRoundLine | null | undefined): number | null {
  if (!line) return null
  const fromField = parsePosLineAddedAtMs(line.addedAt ?? line.added_at)
  if (fromField != null) return fromField
  const m = String(line.id ?? '').trim().match(QR_LINE_ID_TS)
  if (!m) return null
  const ms = Number(m[1])
  return Number.isFinite(ms) && ms > 0 ? ms : null
}

/** 줄 순서와 같은 길이의 회차 배열. 회차는 1부터, 시각 오름차순. */
export function computePosOrderLineRounds(
  lines: PosOrderRoundLine[],
  opts?: { orderCreatedAt?: unknown }
): PosOrderRound[] {
  const createdMs = parsePosLineAddedAtMs(
    opts?.orderCreatedAt instanceof Date ? opts.orderCreatedAt.toISOString() : opts?.orderCreatedAt
  )
  /** undefined = 뷔페 입장료 줄(회차를 만들지 않음) */
  const times: Array<number | null | undefined> = []
  let prev: number | null = createdMs
  for (const line of lines || []) {
    if (isQrBuffetPackageKitchenSkipLine(line as { id?: unknown; isBuffetEntry?: unknown })) {
      times.push(undefined)
      continue
    }
    const own = resolvePosLineAddedAtMs(line)
    const ms = own ?? prev
    times.push(ms)
    if (ms != null) prev = ms
  }

  const sorted = [...new Set(times.filter((ms): ms is number => ms != null))].sort((a, b) => a - b)
  const bucketStart: number[] = []
  for (const ms of sorted) {
    const last = bucketStart[bucketStart.length - 1]
    if (last == null || ms - last > POS_ORDER_ROUND_GAP_MS) bucketStart.push(ms)
  }
  const roundOf = (ms: number): number => {
    let idx = 0
    for (let i = 0; i < bucketStart.length; i += 1) {
      if (bucketStart[i] <= ms) idx = i
      else break
    }
    return idx + 1
  }
  const offset = times.some((ms) => ms === null) ? 1 : 0
  return times.map((ms) => {
    if (ms === undefined) return { round: 1, atMs: offset ? null : (bucketStart[0] ?? null) }
    if (ms === null) return { round: 1, atMs: null }
    const r = roundOf(ms)
    return { round: r + offset, atMs: bucketStart[r - 1] ?? null }
  })
}

export function countPosOrderRounds(rounds: PosOrderRound[]): number {
  return rounds.reduce((max, r) => Math.max(max, r.round), 0)
}

/** 주어진 줄 id 들이 속한 회차(가장 늦은 회차). 없으면 null */
export function resolvePosOrderRoundForLineIds(
  lines: PosOrderRoundLine[],
  lineIds: Iterable<string>,
  opts?: { orderCreatedAt?: unknown }
): PosOrderRound | null {
  const ids = new Set([...lineIds].map((id) => String(id ?? '').trim()).filter(Boolean))
  if (ids.size === 0) return null
  const rounds = computePosOrderLineRounds(lines, opts)
  let best: PosOrderRound | null = null
  lines.forEach((line, idx) => {
    if (!ids.has(String(line?.id ?? '').trim())) return
    const r = rounds[idx]
    if (r && (!best || r.round > best.round)) best = r
  })
  return best
}

export function formatPosOrderRoundTime(atMs: number | null | undefined): string {
  if (atMs == null || !Number.isFinite(atMs)) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(atMs))
}

/** "รอบที่ 2 · 18:10" — template 은 `{n}` 을 포함한 번역 문자열 */
export function formatPosOrderRoundLabel(
  round: PosOrderRound | null | undefined,
  template: string
): string {
  if (!round || !(round.round > 0)) return ''
  const tpl = String(template || '').includes('{n}') ? template : 'Round {n}'
  const head = tpl.replace('{n}', String(round.round))
  const time = formatPosOrderRoundTime(round.atMs)
  return time ? `${head} · ${time}` : head
}

/** 추가 주문 홀 전표 헤더용: 새 줄들이 속한 회차 라벨. 회차가 1개뿐이면 빈 문자열 */
export function resolveAddonRoundLabel(params: {
  items: PosOrderRoundLine[]
  addonLineIds: Iterable<string>
  template: string
  orderCreatedAt?: unknown
}): string {
  const rounds = computePosOrderLineRounds(params.items, { orderCreatedAt: params.orderCreatedAt })
  if (countPosOrderRounds(rounds) < 2) return ''
  const round = resolvePosOrderRoundForLineIds(params.items, params.addonLineIds, {
    orderCreatedAt: params.orderCreatedAt,
  })
  return formatPosOrderRoundLabel(round, params.template)
}

export function posLineAddedAtWallNow(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`
}

function normLineId(id: unknown): string {
  const raw = String(id ?? '').trim()
  const cartExisting = raw.match(/^cart-existing-\d+-(.+)$/)
  if (cartExisting?.[1]) return cartExisting[1].trim()
  return raw
}

/**
 * 저장 직전: 기존 줄의 addedAt·source 를 id 로 이어 받고, 새 id 줄에는 지금 시각을 찍는다.
 * POS 가 items_json 을 통째로 덮어써도 회차·QR 표시가 사라지지 않게 한다.
 */
export function carryOverPosLineAddedAt<T extends Record<string, unknown>>(
  prevLines: Array<Record<string, unknown>>,
  nextLines: T[],
  nowWall: string = posLineAddedAtWallNow()
): T[] {
  const prevById = new Map<string, Record<string, unknown>>()
  for (const p of prevLines || []) {
    const k = normLineId(p?.id)
    if (k) prevById.set(k, p)
  }
  return (nextLines || []).map((line) => {
    const k = normLineId(line?.id)
    const own = String(line?.addedAt ?? '').trim()
    const prev = k ? prevById.get(k) : undefined
    if (prev) {
      const prevAdded = String(prev.addedAt ?? '').trim()
      const prevSource = String(prev.source ?? '').trim()
      const patch: Record<string, unknown> = {}
      if (!own && prevAdded) patch.addedAt = prevAdded
      if (!String(line?.source ?? '').trim() && prevSource) patch.source = prevSource
      return Object.keys(patch).length ? ({ ...line, ...patch } as T) : line
    }
    if (own) return line
    return { ...line, addedAt: nowWall } as T
  })
}

/** QR 손님 앱 — 이미 주방으로 보낸 라인 집계 (표시용). */

import {
  getBangkokDateTimeString,
  normalizeBangkokDateTimeCompareKey,
  parseBangkokWallClockToMs,
} from '@/lib/bangkok-time'
import {
  isChickenDefaultOptionName,
  menuHasChickenSizeProfile,
} from '@/lib/pos-chicken-option-inference'
import { POS_CHICKEN_DEFAULT_OPTION_DISPLAY } from '@/lib/pos-print-translate'

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

/** QR 손님 앱·제출 API가 공유하는 홀 옵션 */
export type QrGuestMenuOption = {
  id: number
  menuId: number
  name: string
  optionCode: string
  priceModifier: number
  optionType: 'substitution' | 'additive'
  sortOrder: number
  optionStepValues?: Record<string, string> | null
  sellHall?: boolean
}

export function hallSubstitutionQrGuestOptions(
  options: QrGuestMenuOption[] | null | undefined
): QrGuestMenuOption[] {
  return (options || []).filter((o) => {
    if (o.sellHall === false) return false
    const typ = o.optionType || 'substitution'
    return typ === 'substitution'
  })
}

export function qrGuestMenuNeedsOptionPicker(menu: {
  options?: QrGuestMenuOption[] | null
  isBanban?: boolean
  name?: string
  code?: string
}): boolean {
  if (menu.isBanban === true) return true
  const name = String(menu.name || '').toLowerCase()
  const code = String(menu.code || '').trim().toLowerCase()
  if (name.includes('banban') || name.includes('반반') || code === 'c024' || code === 'c24') return true
  return hallSubstitutionQrGuestOptions(menu.options).length > 0
}

export function qrGuestCartLineKey(menuId: number, optionIds: number[], banbanPair?: { menuId1: number; menuId2: number }): string {
  const mid = Math.floor(Number(menuId) || 0)
  if (banbanPair) {
    const a = Math.min(banbanPair.menuId1, banbanPair.menuId2)
    const b = Math.max(banbanPair.menuId1, banbanPair.menuId2)
    return `${mid}:banban:${a}+${b}`
  }
  const ids = [...optionIds]
    .map((n) => Math.floor(Number(n) || 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
  return ids.length ? `${mid}:${ids.join('+')}` : String(mid)
}

/** 피커가 합성 id(bbq-123-456)를 줄 때 실제 옵션 id만 추출 */
export function extractQrGuestOptionIds(
  opt: { id?: string | number | null } | null | undefined,
  pendingSizeOpt?: { id?: string | number | null } | null
): number[] {
  const out: number[] = []
  const pushToken = (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) out.push(Math.floor(n))
  }
  const pushRaw = (raw: string | number | null | undefined) => {
    const s = String(raw ?? '').trim()
    if (!s) return
    if (/^bbq-/i.test(s)) {
      for (const part of s.slice(4).split('-')) pushToken(part)
      return
    }
    pushToken(s)
  }
  pushRaw(opt?.id)
  pushRaw(pendingSizeOpt?.id)
  return [...new Set(out)]
}

export type QrGuestResolvedLineOption =
  | {
      ok: true
      name: string
      price: number
      optionId: string | undefined
      optionCode: string | undefined
      optionName: string
      optionIds: number[]
    }
  | { ok: false; error: string }

/** POS와 같이 S/M/L 치킨은 목록가 = S Boneless. DB에 S 행이 있으면 그걸 쓴다. */
export function findQrGuestImplicitChickenDefault(
  options: QrGuestMenuOption[] | null | undefined
): QrGuestMenuOption | null {
  const hall = hallSubstitutionQrGuestOptions(options)
  if (!menuHasChickenSizeProfile(hall)) return null
  return hall.find((o) => isChickenDefaultOptionName(o.name)) || null
}

function finishQrGuestLineOption(params: {
  menuName: string
  menuPrice: number
  buffetIncluded: boolean
  picked: QrGuestMenuOption[]
}): Extract<QrGuestResolvedLineOption, { ok: true }> {
  const optionName = params.picked.map((o) => String(o.name || '').trim()).filter(Boolean).join(' - ')
  const modifier = params.picked.reduce((sum, o) => sum + (Number(o.priceModifier) || 0), 0)
  const price = params.buffetIncluded ? 0 : Math.max(0, Number(params.menuPrice) || 0) + modifier
  const first = params.picked[0]
  return {
    ok: true,
    name: optionName ? `${params.menuName} (${optionName})` : params.menuName,
    price,
    optionId: first ? String(first.id) : undefined,
    optionCode: first?.optionCode || undefined,
    optionName,
    optionIds: params.picked.map((o) => o.id),
  }
}

/**
 * 홀 옵션을 주문 줄에 반영. 뷔페 포함 메뉴는 금액 0, 옵션명만 붙인다.
 * 치환 옵션이 있는 메뉴는 optionIds 필수. 치킨 S/M/L 은 미선택 시 S Boneless(목록 시작가).
 */
export function resolveQrGuestLineOption(params: {
  menuId: number
  menuName: string
  menuPrice: number
  buffetIncluded: boolean
  menuOptions: QrGuestMenuOption[]
  optionIds?: number[] | null
  /** false면 옵션 미선택도 통과(구 클라이언트·옵션 조회 실패 대비) */
  requireOption?: boolean
}): QrGuestResolvedLineOption {
  const menuName = String(params.menuName || '').trim() || '—'
  const required = hallSubstitutionQrGuestOptions(params.menuOptions)
  const requested = [...(params.optionIds || [])]
    .map((n) => Math.floor(Number(n) || 0))
    .filter((n) => n > 0)
  const byId = new Map(params.menuOptions.map((o) => [o.id, o]))
  const picked: QrGuestMenuOption[] = []
  for (const id of requested) {
    const opt = byId.get(id)
    if (!opt || opt.menuId !== params.menuId) return { ok: false, error: `option_not_found:${id}` }
    if (opt.sellHall === false) return { ok: false, error: `option_not_hall:${id}` }
    picked.push(opt)
  }
  const pickedSubs = picked.filter((o) => (o.optionType || 'substitution') === 'substitution')
  if (params.requireOption !== false && required.length > 0 && pickedSubs.length === 0) {
    const implicit = findQrGuestImplicitChickenDefault(params.menuOptions)
    if (implicit) {
      return finishQrGuestLineOption({
        menuName,
        menuPrice: params.menuPrice,
        buffetIncluded: params.buffetIncluded,
        picked: [implicit, ...picked],
      })
    }
    if (menuHasChickenSizeProfile(required)) {
      const optionName = POS_CHICKEN_DEFAULT_OPTION_DISPLAY
      const additiveMod = picked.reduce((sum, o) => sum + (Number(o.priceModifier) || 0), 0)
      return {
        ok: true,
        name: `${menuName} (${optionName})`,
        price: params.buffetIncluded ? 0 : Math.max(0, Number(params.menuPrice) || 0) + additiveMod,
        optionId: undefined,
        optionCode: undefined,
        optionName,
        optionIds: picked.map((o) => o.id),
      }
    }
    return { ok: false, error: 'option_required' }
  }
  return finishQrGuestLineOption({
    menuName,
    menuPrice: params.menuPrice,
    buffetIncluded: params.buffetIncluded,
    picked,
  })
}

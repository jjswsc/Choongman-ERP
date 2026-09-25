import { isQrBuffetPackageKitchenSkipLine } from '@/lib/pos-qr-buffet-entry'

type CookClockItem = {
  id?: string
  cancelledAt?: string | null
  isBuffetEntry?: boolean
  addedAt?: string | null
}

/** 바닥 타일 조리 시계. 음식 줄이 없으면 undefined — QR만 연 빈 주문은 노랑/빨강으로 세지 않는다. */
export function posTableCookClockIso(order: {
  createdAt?: Date | string | null
  items?: CookClockItem[] | null
}): string | undefined {
  const food = (order.items || []).filter((it) => {
    if (String(it.cancelledAt ?? '').trim()) return false
    return !isQrBuffetPackageKitchenSkipLine(it)
  })
  if (food.length === 0) return undefined

  let earliestMs: number | null = null
  for (const it of food) {
    const ms = foodLineClockMs(String(it.addedAt ?? ''))
    if (ms == null) continue
    if (earliestMs == null || ms < earliestMs) earliestMs = ms
  }
  if (earliestMs != null) return new Date(earliestMs).toISOString()

  const created = order.createdAt
  if (created instanceof Date && !Number.isNaN(created.getTime())) return created.toISOString()
  const raw = String(created ?? '').trim()
  if (!raw) return undefined
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) return raw
  return new Date(parsed).toISOString()
}

function foodLineClockMs(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const wall = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (wall) {
    const iso = `${wall[1]}-${wall[2]}-${wall[3]}T${wall[4]}:${wall[5]}:${wall[6] || '00'}+07:00`
    const ms = Date.parse(iso)
    return Number.isNaN(ms) ? null : ms
  }
  const ms = Date.parse(s)
  return Number.isNaN(ms) ? null : ms
}

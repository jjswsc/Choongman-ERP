import { isQrBuffetPackageKitchenSkipLine } from '@/lib/pos-qr-buffet-entry'

/** QR 주방 태그(Buffet/Extra). 손님 전표 메모에서만 제거한다. */
const QR_BUFFET_KITCHEN_TAG_RE = /^(buffet|extra)$/i

export function shouldHideBuffetIncludedOnGuestBill(
  settings?: { hideBuffetIncludedOnGuestBill?: boolean | null } | null
): boolean {
  return settings?.hideBuffetIncludedOnGuestBill === true
}

export function pickBuffetIncludedFromOrderLine(
  row: Record<string, unknown> | null | undefined
): { buffetIncluded?: true } {
  if (!row) return {}
  if (row.buffetIncluded === true || row.buffet_included === true) return { buffetIncluded: true }
  return {}
}

export function isQrBuffetIncludedGuestBillLine(
  it: {
    buffetIncluded?: unknown
    isBuffetEntry?: unknown
    id?: unknown
    price?: unknown
    note?: unknown
  } | null | undefined
): boolean {
  if (!it || typeof it !== 'object') return false
  if (isQrBuffetPackageKitchenSkipLine(it)) return false
  if (it.buffetIncluded === true) return true
  const price = Math.abs(Number(it.price) || 0)
  if (price >= 0.005) return false
  const chunks = String(it.note ?? '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
  return chunks.some((chunk) => /^buffet$/i.test(chunk))
}

export function stripQrBuffetKitchenTagsFromNote(note: string | null | undefined): string {
  const chunks = String(note ?? '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
  return chunks.filter((chunk) => !QR_BUFFET_KITCHEN_TAG_RE.test(chunk)).join(' · ')
}

export function applyGuestBillBuffetPrint<T extends {
  buffetIncluded?: unknown
  isBuffetEntry?: unknown
  id?: unknown
  price?: unknown
  note?: string
}>(
  items: T[] | null | undefined,
  settings?: { hideBuffetIncludedOnGuestBill?: boolean | null } | null
): T[] {
  const list = Array.isArray(items) ? items : []
  if (!shouldHideBuffetIncludedOnGuestBill(settings)) return list
  return list
    .filter((it) => !isQrBuffetIncludedGuestBillLine(it))
    .map((it) => {
      const nextNote = stripQrBuffetKitchenTagsFromNote(it.note)
      const prevNote = String(it.note ?? '')
      if (nextNote === prevNote) return it
      return { ...it, note: nextNote }
    })
}

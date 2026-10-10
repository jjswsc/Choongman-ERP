import { isQrTableGuestOrderLine } from '@/lib/qr-table-types'

/** note 안에서 손님 메모가 아닌 조각: QR 뷔페 태그, 옵션·반반 기계 토큰 */
const KITCHEN_NOTE_SYSTEM_CHUNK_RE = /^(?:(?:buffet|extra)$|(?:mods?|optc|banbanFlavors)\s*:)/i

type GuestMemoLine = {
  source?: unknown
  id?: unknown
  note?: unknown
  kitchenGuestMemo?: unknown
}

/**
 * QR 손님 줄의 note = 손님이 쓴 메모(+ 인쇄 단계에서 붙은 태그·optc).
 * 주방 슬립 옵션 처리(옵션 그룹 인쇄 설정·이름 옵션 주입·메뉴명 중복 판정)가 메모를 옵션으로 오인하지 않도록 분리한다.
 */
export function splitKitchenGuestMemo(it: GuestMemoLine): { note: string; guestMemo: string } {
  const note = String(it.note ?? '').trim()
  const carried = String(it.kitchenGuestMemo ?? '').trim()
  // 이미 분리된 줄: 이후 단계가 note 에 넣은 옵션(이름 괄호 주입 등)을 메모로 다시 떼지 않는다.
  if (it.kitchenGuestMemo !== undefined || !isQrTableGuestOrderLine(it as { source?: unknown; id?: unknown })) {
    return { note, guestMemo: carried }
  }
  const kept: string[] = []
  const memo: string[] = []
  for (const chunk of note.split('·').map((s) => s.trim()).filter(Boolean)) {
    if (KITCHEN_NOTE_SYSTEM_CHUNK_RE.test(chunk)) kept.push(chunk)
    else memo.push(chunk)
  }
  return { note: kept.join(' · '), guestMemo: carried || memo.join(' · ') }
}

export function withKitchenGuestMemoSplit<T extends GuestMemoLine>(it: T): T {
  if (it.kitchenGuestMemo !== undefined || !isQrTableGuestOrderLine(it as { source?: unknown; id?: unknown })) {
    return it
  }
  const { note, guestMemo } = splitKitchenGuestMemo(it)
  return { ...it, note: note || undefined, kitchenGuestMemo: guestMemo }
}

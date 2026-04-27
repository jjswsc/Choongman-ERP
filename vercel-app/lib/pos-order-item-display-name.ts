import type { PosMenu } from '@/lib/api-client'

type ItemLike = { id: string; name: string; menuId?: string }

/** 배달/외부 주문에서 `name`이 메뉴 코드로만 온 경우, POS 메뉴 카탈로그로 표시명을 복원 */
export function resolvePosOrderItemMenuDisplayName(
  item: ItemLike,
  menus: PosMenu[] | undefined
): string {
  const list = menus ?? []
  const raw = String(item.name || '').trim()
  const mid = String(item.menuId || '').trim()
  if (mid) {
    const byId = list.find((m) => m.id === mid)
    if (byId?.name?.trim()) return byId.name.trim()
  }
  if (raw) {
    const byCode = list.find((m) => String(m.code || '').trim() && String(m.code).trim() === raw)
    if (byCode?.name?.trim()) return byCode.name.trim()
    const low = raw.toLowerCase()
    const byCodeI = list.find(
      (m) => String(m.code || '').trim() && String(m.code).trim().toLowerCase() === low
    )
    if (byCodeI?.name?.trim()) return byCodeI.name.trim()
  }
  const rawId = String(item.id || '').trim()
  if (rawId) {
    const idToken = rawId.includes(':') ? rawId.split(':').pop() || rawId : rawId
    const byCodeFromId = list.find(
      (m) => String(m.code || '').trim() && String(m.code).trim() === idToken
    )
    if (byCodeFromId?.name?.trim()) return byCodeFromId.name.trim()
    const lowId = idToken.toLowerCase()
    const byCodeFromIdI = list.find(
      (m) => String(m.code || '').trim() && String(m.code).trim().toLowerCase() === lowId
    )
    if (byCodeFromIdI?.name?.trim()) return byCodeFromIdI.name.trim()
  }
  return raw
}

/**
 * 주방 슬립·프로모 구성품 표시명 — menuId/code/스냅샷 순으로 복원
 */

export type KitchenMenuNameLookup = {
  menuNameByMenuId: Record<string, string>
  menuIdByCode: Record<string, string>
}

export function buildKitchenMenuNameLookup(
  menus: { id?: string | number; name?: string; code?: string }[]
): KitchenMenuNameLookup {
  const menuNameByMenuId: Record<string, string> = {}
  const menuIdByCode: Record<string, string> = {}
  for (const m of menus) {
    const id = String(m.id ?? '').trim()
    if (!id) continue
    const name = String(m.name ?? '').trim()
    if (name) menuNameByMenuId[id] = name
    const code = String(m.code ?? '').trim()
    if (code) {
      const ck = code.toLowerCase()
      if (!menuIdByCode[ck]) menuIdByCode[ck] = id
    }
  }
  return { menuNameByMenuId, menuIdByCode }
}

export function resolveKitchenMenuNameFromLookup(
  menuId: string,
  lookup: KitchenMenuNameLookup,
  menuNameSnapshot?: string
): string {
  const snap = String(menuNameSnapshot ?? '').trim()
  if (snap) return snap

  const mid = String(menuId ?? '').trim()
  if (!mid) return ''

  const direct = String(lookup.menuNameByMenuId[mid] ?? '').trim()
  if (direct) return direct

  const viaCode = lookup.menuIdByCode[mid.toLowerCase()]
  if (viaCode) {
    const fromCode = String(lookup.menuNameByMenuId[viaCode] ?? '').trim()
    if (fromCode) return fromCode
  }

  return ''
}

/** 카탈로그에 없을 때 주방에 ID만 찍지 않도록 — 스냅샷·이름 복원 실패 시 `#id` */
export function kitchenMenuNameOrPlaceholder(menuId: string, resolved: string): string {
  const name = String(resolved ?? '').trim()
  if (name) return name
  const mid = String(menuId ?? '').trim()
  return mid ? `#${mid}` : '—'
}

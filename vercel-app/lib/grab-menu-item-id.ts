/** Grab 메뉴 item id — POS `pos_menus` 행과 동일 규칙 (메뉴 동기화·캠페인 scope 공유) */
export type GrabMenuItemIdSource = {
  id?: number | string | null
  code?: string | null
}

function normalizeGrabMenuItemIdPart(raw: string, fallback: string): string {
  const base = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
  const cleaned = base.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return cleaned || fallback
}

export function buildGrabMenuItemId(menu: GrabMenuItemIdSource, itemIndex = 0): string {
  const menuId = Number(menu.id ?? 0)
  const code = String(menu.code ?? '').trim()
  const base = normalizeGrabMenuItemIdPart(code, '')
  if (menuId > 0 && base) return `item-${menuId}-${base}`
  if (menuId > 0) return `item-${menuId}`
  return normalizeGrabMenuItemIdPart(`item-${code}-${itemIndex + 1}`, `item-${itemIndex + 1}`)
}

import { upsertPosMenuFromBody } from '@/lib/pos-menu-upsert-server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

type ImportResult = {
  menusUpserted: number
  optionsUpserted: number
  skipped: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toMajor(value: unknown, exponent: number): number {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 0
  if (Math.abs(n % 1) > 1e-9 || exponent <= 0) return Math.round(n * 100) / 100
  return Math.round((n / 10 ** exponent) * 100) / 100
}

function cleanCode(v: string): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildMenuCode(merchantID: string, itemId: string): string {
  const merchant = cleanCode(merchantID).slice(-16) || 'grab'
  const item = cleanCode(itemId) || 'item'
  return `grab_${merchant}_${item}`.slice(0, 60)
}

async function resolveMenuIdByCode(code: string): Promise<number | null> {
  const rows = (await supabaseSelectFilter(
    'pos_menus',
    `code=eq.${encodeURIComponent(code)}`,
    { limit: 1, select: 'id' }
  )) as { id?: number }[] | null
  const id = Number(rows?.[0]?.id ?? 0)
  return id > 0 ? id : null
}

async function upsertMenuOption(params: {
  menuId: number
  optionName: string
  priceModifier: number
  sortOrder: number
}): Promise<boolean> {
  const existing = (await supabaseSelectFilter(
    'pos_menu_options',
    `menu_id=eq.${params.menuId}&name=eq.${encodeURIComponent(params.optionName)}`,
    { limit: 1, select: 'id,price_modifier,price_modifier_delivery,sort_order,option_type,sell_delivery' }
  )) as {
    id?: number
    price_modifier?: number
    price_modifier_delivery?: number | null
    sort_order?: number
    option_type?: string
    sell_delivery?: boolean
  }[] | null

  const row = {
    menu_id: params.menuId,
    name: params.optionName,
    price_modifier: params.priceModifier,
    price_modifier_delivery: params.priceModifier,
    sort_order: params.sortOrder,
    option_type: 'substitution',
    sell_delivery: true,
  }

  const existingId = Number(existing?.[0]?.id ?? 0)
  if (existingId > 0) {
    await supabaseUpdateByFilter('pos_menu_options', `id=eq.${existingId}`, row)
    return false
  }
  await supabaseInsert('pos_menu_options', row)
  return true
}

export async function importGrabMenuToPos(payload: Record<string, unknown>): Promise<ImportResult> {
  const merchantID = String(payload.merchantID ?? '').trim()
  const currency = asRecord(payload.currency)
  const exponent = Math.max(0, Math.min(4, Math.trunc(Number(currency.exponent ?? 2) || 2)))
  const categories = asArray(payload.categories)

  const result: ImportResult = {
    menusUpserted: 0,
    optionsUpserted: 0,
    skipped: 0,
  }

  for (const rawCategory of categories) {
    const category = asRecord(rawCategory)
    const categoryName = String(category.name ?? 'Grab').trim() || 'Grab'
    const items = asArray(category.items)

    for (const rawItem of items) {
      const item = asRecord(rawItem)
      const itemId = String(item.id ?? '').trim()
      const itemName = String(item.name ?? '').trim()
      if (!itemId || !itemName) {
        result.skipped += 1
        continue
      }

      const menuCode = buildMenuCode(merchantID, itemId)
      const availableStatus = String(item.availableStatus ?? '').trim().toUpperCase()
      const itemPrice = toMajor(item.price, exponent)
      const photos = asArray(item.photos)
      const imageUrl = photos.length > 0 ? String(photos[0] ?? '').trim() : ''
      const sequence = Math.max(0, Math.trunc(Number(item.sequence ?? 0) || 0))

      const upsert = await upsertPosMenuFromBody(
        {
          code: menuCode,
          name: itemName,
          category: categoryName,
          categoryMain: categoryName,
          price: itemPrice,
          priceDelivery: itemPrice,
          imageUrl,
          vatIncluded: true,
          isActive: availableStatus !== 'UNAVAILABLE',
          sortOrder: sequence,
        },
        { upsertByCode: true }
      )
      if (!upsert.success) {
        result.skipped += 1
        continue
      }
      result.menusUpserted += 1

      const menuId = await resolveMenuIdByCode(menuCode)
      if (!menuId) continue

      const modifierGroups = asArray(item.modifierGroups)
      for (const rawGroup of modifierGroups) {
        const group = asRecord(rawGroup)
        const groupName = String(group.name ?? '').trim()
        const modifiers = asArray(group.modifiers)
        for (const rawMod of modifiers) {
          const mod = asRecord(rawMod)
          const modName = String(mod.name ?? '').trim()
          if (!modName) continue
          const finalName = groupName ? `${groupName}: ${modName}` : modName
          const created = await upsertMenuOption({
            menuId,
            optionName: finalName.slice(0, 100),
            priceModifier: toMajor(mod.price, exponent),
            sortOrder: Math.max(0, Math.trunc(Number(mod.sequence ?? 0) || 0)),
          })
          if (created) result.optionsUpserted += 1
        }
      }
    }
  }

  return result
}

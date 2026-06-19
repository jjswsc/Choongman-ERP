import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { recordPriceChanges } from '@/lib/price-history'
import {
  resolveMenuStoreCodesForGrabSync,
  triggerGrabMenuNotificationPerStoreCodes,
} from '@/lib/grab-menu-sync-trigger'
import { createMenuOptionCodeAllocator } from '@/lib/pos-option-code-server'
import { validateStrictBonelessBbqOption } from '@/lib/pos-bbq-option-guard'

async function getMenuMeta(menuId: number): Promise<{ code: string; categoryMain: string; category: string }> {
  try {
    const menus = (await supabaseSelectFilter('pos_menus', `id=eq.${menuId}`, { limit: 1 })) as {
      code?: string
      category_main?: string
      category?: string
    }[] | null
    if (menus && menus.length > 0) {
      const m = menus[0]
      return {
        code: (m.code || '').trim(),
        categoryMain: (m.category_main || '').trim(),
        category: (m.category || '').trim(),
      }
    }
  } catch { /* ignore */ }
  return { code: '', categoryMain: '', category: '' }
}

/** POS 메뉴 옵션 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const id = body?.id
    const menuId = Number(body?.menuId)
    const name = String(body?.name ?? '').trim()
    const priceModifier = Number(body?.priceModifier) ?? 0
    const priceModifierDelivery = body?.priceModifierDelivery != null ? Number(body.priceModifierDelivery) : null
    const priceModifierPackaging = body?.priceModifierPackaging != null ? Number(body.priceModifierPackaging) : null
    const sortOrder = Number(body?.sortOrder) ?? 0
    const optionType = (body?.optionType || 'substitution') as string
    const optionCodeRaw = String(body?.optionCode ?? '').trim()
    const itemCode = body?.itemCode ? String(body.itemCode).trim() : null
    const rawAddMenu = body?.additiveSourceMenuId
    const parsedAddMenu =
      rawAddMenu != null && rawAddMenu !== '' ? Number(rawAddMenu) : NaN
    const additiveSourceMenuId =
      Number.isFinite(parsedAddMenu) && parsedAddMenu > 0 ? Math.floor(parsedAddMenu) : null
    const quantity = Math.max(0.001, Number(body?.quantity) ?? 1)
    const optionStepValues = body?.optionStepValues && typeof body.optionStepValues === 'object' && !Array.isArray(body.optionStepValues)
      ? (body.optionStepValues as Record<string, string>)
      : null
    const sellHall = body?.sellHall != null ? !!body.sellHall : true
    const sellDelivery = body?.sellDelivery != null ? !!body.sellDelivery : true
    const sellPackaging = body?.sellPackaging != null ? !!body.sellPackaging : true
    const sellMember =
      body?.sellMember != null ? !!body.sellMember : sellPackaging
    const hasDescriptionDefault = 'descriptionDefault' in (body || {})
    const hasDescriptionDelivery = 'descriptionDelivery' in (body || {})
    const hasDescriptionTable = 'descriptionTable' in (body || {})

    if (!menuId || !name) {
      return NextResponse.json({ success: false, message: 'menuId and name required' }, { headers })
    }
    const menuMeta = await getMenuMeta(menuId)
    const bbqGuard = validateStrictBonelessBbqOption({
      menuCode: menuMeta.code,
      optionType,
      optionName: name,
      optionStepValues,
    })
    if (!bbqGuard.ok) {
      return NextResponse.json({ success: false, message: bbqGuard.message }, { headers })
    }

    const isAdditive = optionType === 'additive'
    const rowFull: Record<string, unknown> = {
      name,
      price_modifier: priceModifier,
      price_modifier_delivery: priceModifierDelivery,
      price_modifier_packaging: priceModifierPackaging,
      sort_order: sortOrder,
      option_type: isAdditive ? 'additive' : 'substitution',
      item_code:
        isAdditive && additiveSourceMenuId ? null : isAdditive && itemCode ? itemCode : null,
      additive_source_menu_id: isAdditive && additiveSourceMenuId ? additiveSourceMenuId : null,
      quantity: isAdditive ? quantity : 1,
      sell_hall: sellHall,
      sell_delivery: sellDelivery,
      sell_packaging: sellPackaging,
      sell_member: sellMember,
    }
    if (!id || hasDescriptionDefault) {
      rowFull.description_default = String(body?.descriptionDefault ?? '').trim()
    }
    if (!id || hasDescriptionDelivery) {
      rowFull.description_delivery =
        body?.descriptionDelivery == null ? null : String(body.descriptionDelivery).trim()
    }
    if (!id || hasDescriptionTable) {
      rowFull.description_table =
        body?.descriptionTable == null ? null : String(body.descriptionTable).trim()
    }
    if (optionStepValues) rowFull.option_step_values = optionStepValues

    const rowMinimal: Record<string, unknown> = {
      name,
      price_modifier: priceModifier,
      sort_order: sortOrder,
    }

    const doSave = async (row: Record<string, unknown>): Promise<string | null> => {
      if (id) {
        const existing = (await supabaseSelectFilter(
          'pos_menu_options',
          `id=eq.${id}`,
          { limit: 1 }
        )) as { name?: string; price_modifier?: number; price_modifier_delivery?: number | null; price_modifier_packaging?: number | null }[] | null
        if (existing && existing.length > 0) {
          const prev = existing[0]
          const changes: { fieldName: string; oldValue: number | null; newValue: number | null }[] = []
          if (Number(prev.price_modifier) !== priceModifier) {
            changes.push({ fieldName: 'price_modifier', oldValue: prev.price_modifier ?? null, newValue: priceModifier })
          }
          if ((prev.price_modifier_delivery ?? null) !== priceModifierDelivery) {
            changes.push({ fieldName: 'price_modifier_delivery', oldValue: prev.price_modifier_delivery ?? null, newValue: priceModifierDelivery })
          }
          if ((prev.price_modifier_packaging ?? null) !== priceModifierPackaging) {
            changes.push({ fieldName: 'price_modifier_packaging', oldValue: prev.price_modifier_packaging ?? null, newValue: priceModifierPackaging })
          }
          if (changes.length > 0) {
            const { categoryMain, category } = menuMeta
            recordPriceChanges({
              entityType: 'pos_menu_option',
              entityId: String(id),
              entityDisplayName: prev.name ?? name,
              changes,
              category: category || undefined,
              categoryMain: categoryMain || undefined,
              parentEntityId: String(menuId),
            }).catch(() => {})
          }
        }
        await supabaseUpdateByFilter('pos_menu_options', `id=eq.${id}`, row)
        return String(id)
      } else {
        const inserted = (await supabaseInsert('pos_menu_options', { menu_id: menuId, ...row })) as { id?: number }[] | { id?: number }
        const newRow = Array.isArray(inserted) ? inserted[0] : inserted
        const newId = newRow?.id != null ? String(newRow.id) : null
        if (newId) {
          const { categoryMain, category } = menuMeta
          const initChanges: { fieldName: string; oldValue: number | null; newValue: number | null }[] = []
          initChanges.push({ fieldName: 'price_modifier', oldValue: null, newValue: priceModifier })
          if (priceModifierDelivery != null) initChanges.push({ fieldName: 'price_modifier_delivery', oldValue: null, newValue: priceModifierDelivery })
          if (priceModifierPackaging != null) initChanges.push({ fieldName: 'price_modifier_packaging', oldValue: null, newValue: priceModifierPackaging })
          if (initChanges.length > 0) {
            recordPriceChanges({
              entityType: 'pos_menu_option',
              entityId: newId,
              entityDisplayName: name,
              changes: initChanges,
              category: category || undefined,
              categoryMain: categoryMain || undefined,
              parentEntityId: String(menuId),
            }).catch(() => {})
          }
        }
        return newId
      }
    }

    let savedOptionId: string | null = null
    try {
      savedOptionId = await doSave(rowFull)
    } catch (_err1) {
      const rowWithoutNew = { ...rowFull }
      delete rowWithoutNew.option_step_values
      delete rowWithoutNew.price_modifier_packaging
      delete rowWithoutNew.sell_hall
      delete rowWithoutNew.sell_delivery
      delete rowWithoutNew.sell_packaging
      delete rowWithoutNew.sell_member
      delete rowWithoutNew.option_type
      delete rowWithoutNew.item_code
      delete rowWithoutNew.additive_source_menu_id
      delete rowWithoutNew.quantity
      delete rowWithoutNew.option_code
      delete rowWithoutNew.description_default
      delete rowWithoutNew.description_delivery
      delete rowWithoutNew.description_table
      if (priceModifierDelivery != null) (rowWithoutNew as Record<string, unknown>).price_modifier_delivery = priceModifierDelivery
      try {
        savedOptionId = await doSave(rowWithoutNew)
      } catch (_err2) {
        savedOptionId = await doSave(rowMinimal)
      }
    }

    let optionCodeResult: { optionCode: string; remapped: boolean } | null = null
    if (savedOptionId) {
      try {
        const allocator = await createMenuOptionCodeAllocator(menuId)
        optionCodeResult = await allocator.assign({
          optionId: savedOptionId,
          preferredCode: optionCodeRaw || undefined,
          fallbackSortOrder: sortOrder,
        })
      } catch (codeErr) {
        console.warn('savePosMenuOption: option_code assign skipped', codeErr)
      }
    }

    void (async () => {
      const storeCodesForGrab = await resolveMenuStoreCodesForGrabSync({
        menuId: String(menuId || '').trim() || null,
        bodyStoreCode: body?.storeCode,
      })
      await triggerGrabMenuNotificationPerStoreCodes({
        reason: 'menu_modifier_updated',
        storeCodes: storeCodesForGrab,
        partnerMerchantID: body?.storeCode ? String(body.storeCode).trim() : null,
      })
    })()
    return NextResponse.json(
      {
        success: true,
        optionCode: optionCodeResult?.optionCode || undefined,
        remappedOptionCode: optionCodeResult?.remapped || false,
      },
      { headers }
    )
  } catch (e) {
    console.error('savePosMenuOption:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}

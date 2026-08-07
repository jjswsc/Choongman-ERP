import { NextRequest, NextResponse } from "next/server"
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from "@/lib/supabase-server"
import { recordPriceChanges } from "@/lib/price-history"
import { triggerGrabMenuNotification } from "@/lib/grab-menu-sync-trigger"
import { createMenuOptionCodeAllocator } from "@/lib/pos-option-code-server"
import { validateStrictBonelessBbqOption } from '@/lib/pos-bbq-option-guard'
import { getVerifiedAuth } from "@/lib/verify-auth"

type SavePosMenuOptionInput = {
  id?: string
  menuId: number
  optionCode?: string
  name: string
  priceModifier?: number
  priceModifierDelivery?: number | null
  priceModifierPackaging?: number | null
  sortOrder?: number
  optionType?: "substitution" | "additive"
  itemCode?: string | null
  additiveSourceMenuId?: number | null
  quantity?: number
  optionStepValues?: Record<string, string> | null
  sellHall?: boolean
  sellDelivery?: boolean
  sellPackaging?: boolean
}

async function getMenuMeta(menuId: number): Promise<{ code: string; categoryMain: string; category: string }> {
  try {
    const menus = (await supabaseSelectFilter("pos_menus", `id=eq.${menuId}`, {
      limit: 1,
      select: 'code,category_main,category',
    })) as { code?: string; category_main?: string; category?: string }[] | null
    if (menus && menus.length > 0) {
      const m = menus[0]
      return {
        code: (m.code || '').trim(),
        categoryMain: (m.category_main || "").trim(),
        category: (m.category || "").trim(),
      }
    }
  } catch {
    // ignore
  }
  return { code: '', categoryMain: "", category: "" }
}

async function saveSingleOption(
  input: SavePosMenuOptionInput,
  allocatorByMenuId: Map<number, Awaited<ReturnType<typeof createMenuOptionCodeAllocator>>>,
  changedBy?: string
): Promise<{ optionCode?: string; remapped?: boolean }> {
  const id = input.id
  const menuId = Number(input.menuId)
  const name = String(input.name ?? "").trim()
  const priceModifier = Number(input.priceModifier ?? 0) || 0
  const priceModifierDelivery =
    input.priceModifierDelivery != null ? Number(input.priceModifierDelivery) : null
  const priceModifierPackaging =
    input.priceModifierPackaging != null ? Number(input.priceModifierPackaging) : null
  const sortOrder = Number(input.sortOrder ?? 0) || 0
  const optionType = input.optionType || "substitution"
  const optionCode = String(input.optionCode ?? "").trim()
  const isAdditive = optionType === "additive"
  const itemCode = input.itemCode ? String(input.itemCode).trim() : null
  const additiveSourceMenuId =
    input.additiveSourceMenuId != null && Number(input.additiveSourceMenuId) > 0
      ? Math.floor(Number(input.additiveSourceMenuId))
      : null
  const quantity = Math.max(0.001, Number(input.quantity ?? 1))
  const optionStepValues =
    input.optionStepValues && typeof input.optionStepValues === "object" && !Array.isArray(input.optionStepValues)
      ? input.optionStepValues
      : null
  const sellHall = input.sellHall != null ? !!input.sellHall : true
  const sellDelivery = input.sellDelivery != null ? !!input.sellDelivery : true
  const sellPackaging = input.sellPackaging != null ? !!input.sellPackaging : true

  if (!menuId || !name) {
    throw new Error("menuId and name required")
  }
  const menuMeta = await getMenuMeta(menuId)
  const bbqGuard = validateStrictBonelessBbqOption({
    menuCode: menuMeta.code,
    optionType,
    optionName: name,
    optionStepValues: optionStepValues as Record<string, string> | null,
  })
  if (!bbqGuard.ok) throw new Error(bbqGuard.message)

  const row: Record<string, unknown> = {
    name,
    price_modifier: priceModifier,
    price_modifier_delivery: priceModifierDelivery,
    price_modifier_packaging: priceModifierPackaging,
    sort_order: sortOrder,
    option_type: isAdditive ? "additive" : "substitution",
    item_code: isAdditive && additiveSourceMenuId ? null : isAdditive && itemCode ? itemCode : null,
    additive_source_menu_id: isAdditive && additiveSourceMenuId ? additiveSourceMenuId : null,
    quantity: isAdditive ? quantity : 1,
    sell_hall: sellHall,
    sell_delivery: sellDelivery,
    sell_packaging: sellPackaging,
  }
  if (optionStepValues) row.option_step_values = optionStepValues

  if (id) {
    const existing = (await supabaseSelectFilter("pos_menu_options", `id=eq.${id}`, {
      limit: 1,
    })) as { name?: string; price_modifier?: number; price_modifier_delivery?: number | null; price_modifier_packaging?: number | null }[] | null
    if (existing && existing.length > 0) {
      const prev = existing[0]
      const changes: { fieldName: string; oldValue: number | null; newValue: number | null }[] = []
      if (Number(prev.price_modifier) !== priceModifier) {
        changes.push({
          fieldName: "price_modifier",
          oldValue: prev.price_modifier ?? null,
          newValue: priceModifier,
        })
      }
      if ((prev.price_modifier_delivery ?? null) !== priceModifierDelivery) {
        changes.push({
          fieldName: "price_modifier_delivery",
          oldValue: prev.price_modifier_delivery ?? null,
          newValue: priceModifierDelivery,
        })
      }
      if ((prev.price_modifier_packaging ?? null) !== priceModifierPackaging) {
        changes.push({
          fieldName: "price_modifier_packaging",
          oldValue: prev.price_modifier_packaging ?? null,
          newValue: priceModifierPackaging,
        })
      }
      if (changes.length > 0) {
        const { categoryMain, category } = menuMeta
        recordPriceChanges({
          entityType: "pos_menu_option",
          entityId: String(id),
          entityDisplayName: prev.name ?? name,
          changes,
          changedBy,
          category: category || undefined,
          categoryMain: categoryMain || undefined,
          parentEntityId: String(menuId),
        }).catch(() => {})
      }
    }
    await supabaseUpdateByFilter("pos_menu_options", `id=eq.${id}`, row)
    let allocator = allocatorByMenuId.get(menuId)
    if (!allocator) {
      allocator = await createMenuOptionCodeAllocator(menuId)
      allocatorByMenuId.set(menuId, allocator)
    }
    const codeRes = await allocator.assign({
      optionId: String(id),
      preferredCode: optionCode || undefined,
      fallbackSortOrder: sortOrder,
    })
    return { optionCode: codeRes.optionCode || undefined, remapped: codeRes.remapped }
  }

  const inserted = (await supabaseInsert("pos_menu_options", {
    menu_id: menuId,
    ...row,
  })) as { id?: number }[] | { id?: number }
  const newRow = Array.isArray(inserted) ? inserted[0] : inserted
  const newId = newRow?.id != null ? String(newRow.id) : null
  if (!newId) return {}
  let allocator = allocatorByMenuId.get(menuId)
  if (!allocator) {
    allocator = await createMenuOptionCodeAllocator(menuId)
    allocatorByMenuId.set(menuId, allocator)
  }
  const codeRes = await allocator.assign({
    optionId: newId,
    preferredCode: optionCode || undefined,
    fallbackSortOrder: sortOrder,
  })
  const { categoryMain, category } = menuMeta
  const initChanges: { fieldName: string; oldValue: number | null; newValue: number | null }[] = []
  initChanges.push({ fieldName: "price_modifier", oldValue: null, newValue: priceModifier })
  if (priceModifierDelivery != null) {
    initChanges.push({ fieldName: "price_modifier_delivery", oldValue: null, newValue: priceModifierDelivery })
  }
  if (priceModifierPackaging != null) {
    initChanges.push({ fieldName: "price_modifier_packaging", oldValue: null, newValue: priceModifierPackaging })
  }
  if (initChanges.length === 0) return { optionCode: codeRes.optionCode || undefined, remapped: codeRes.remapped }
  recordPriceChanges({
    entityType: "pos_menu_option",
    entityId: newId,
    entityDisplayName: name,
    changes: initChanges,
    changedBy,
    category: category || undefined,
    categoryMain: categoryMain || undefined,
    parentEntityId: String(menuId),
  }).catch(() => {})
  return { optionCode: codeRes.optionCode || undefined, remapped: codeRes.remapped }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  try {
    const auth = await getVerifiedAuth(req, { skipSaasGate: true })
    const changedBy = String(auth?.name || "").trim() || String(auth?.employeeCode || "").trim() || undefined
    const body = await req.json()
    const optionsRaw = Array.isArray(body?.options) ? body.options : []
    if (optionsRaw.length === 0) {
      return NextResponse.json({ success: false, message: "options required" }, { headers })
    }
    const allocatorByMenuId = new Map<number, Awaited<ReturnType<typeof createMenuOptionCodeAllocator>>>()
    const results: { id?: string; success: boolean; message?: string; optionCode?: string; remapped?: boolean }[] = []
    let remappedCount = 0
    for (const row of optionsRaw as SavePosMenuOptionInput[]) {
      try {
        const saveResult = await saveSingleOption(row, allocatorByMenuId, changedBy)
        if (saveResult.remapped) remappedCount += 1
        results.push({ id: row.id, success: true, optionCode: saveResult.optionCode, remapped: saveResult.remapped })
      } catch (err) {
        results.push({
          id: row.id,
          success: false,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const allSuccess = results.every((r) => r.success)
    if (allSuccess) {
      void triggerGrabMenuNotification({
        reason: "menu_modifier_updated",
        partnerMerchantID: body?.storeCode ? String(body.storeCode).trim() : null,
      })
    }

    return NextResponse.json(
      {
        success: allSuccess,
        results,
        remappedCount,
        message: allSuccess
          ? remappedCount > 0
            ? `저장 완료 (option_code ${remappedCount}건 자동 재매핑)`
            : undefined
          : "일부 옵션 저장에 실패했습니다.",
      },
      { headers }
    )
  } catch (e) {
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}

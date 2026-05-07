import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { recordPriceChanges } from '@/lib/price-history'

export type PosMenuUpsertApiBody = {
  code?: string
  name?: string
  category?: string
  categoryMain?: string
  price?: number
  priceDelivery?: number | null
  imageUrl?: string
  vatIncluded?: boolean
  isActive?: boolean
  sortOrder?: number
  optionSelectionGroups?: string[]
  optionSelectionConfig?: {
    key: string
    label?: string
    required?: boolean
    minSelect?: number
    maxSelect?: number
  }[]
  kitchenPrinter?: number | null
  cookingTimeMin?: number | null
  isBanban?: boolean
  descriptionDefault?: string
  descriptionDelivery?: string | null
  descriptionTable?: string | null
  id?: string
  storeCode?: string
}

type ExistingMenuRow = {
  id?: number
  price?: number
  price_delivery?: number | null
  name?: string
  category_main?: string
  category?: string
  image?: string
  promo_id?: number | null
  vat_included?: boolean | null
  is_active?: boolean | null
  sort_order?: number | null
  option_selection_groups?: unknown
  option_selection_config?: unknown
  kitchen_printer?: number | null
  cooking_time_min?: number | null
  is_banban?: boolean | null
  description_default?: string | null
  description_delivery?: string | null
  description_table?: string | null
}

/**
 * POS 메뉴 단건 저장. upsertByCode=true이면 동일 코드가 있으면 해당 행을 수정(일괄 업로드용).
 */
export async function upsertPosMenuFromBody(
  body: PosMenuUpsertApiBody,
  opts?: { upsertByCode?: boolean }
): Promise<{
  success: boolean
  message: string
  newId?: string
  syncHint?: {
    imageChanged: boolean
    changedFields: string[]
    partnerMerchantID?: string | null
  }
}> {
  const code = String(body.code ?? '').trim()
  const name = String(body.name ?? '').trim()
  let editingId = body.id ? String(body.id).trim() : null

  if (!code || !name) {
    return { success: false, message: '코드와 메뉴명이 필요합니다.' }
  }

  if (!editingId && opts?.upsertByCode) {
    const byCode = (await supabaseSelectFilter(
      'pos_menus',
      `code=eq.${encodeURIComponent(code)}`,
      { limit: 1, select: 'id' }
    )) as { id?: number }[] | null
    if (byCode?.[0]?.id != null) {
      editingId = String(byCode[0].id)
    }
  }

  const optionSelectionGroupsExplicit =
    'optionSelectionGroups' in body && Array.isArray(body.optionSelectionGroups)
  const optionSelectionGroupsCleaned = optionSelectionGroupsExplicit
    ? body.optionSelectionGroups!.map((x) => String(x).trim()).filter(Boolean)
    : null
  const optionSelectionGroupsLegacy =
    !optionSelectionGroupsExplicit &&
    Array.isArray(body.optionSelectionGroups) &&
    body.optionSelectionGroups.length > 0
      ? body.optionSelectionGroups.map((x) => String(x).trim()).filter(Boolean)
      : null
  const optionSelectionConfigExplicit =
    'optionSelectionConfig' in body && Array.isArray(body.optionSelectionConfig)
  const optionSelectionConfigCleaned = optionSelectionConfigExplicit
    ? body.optionSelectionConfig!
        .map((cfg) => {
          const key = String(cfg?.key ?? '').trim()
          if (!key) return null
          const label = String(cfg?.label ?? '').trim()
          const minRaw = Number(cfg?.minSelect)
          const maxRaw = Number(cfg?.maxSelect)
          const required = cfg?.required === true
          const minSelect = Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : (required ? 1 : 0)
          const maxSelect = Number.isFinite(maxRaw) ? Math.max(0, Math.floor(maxRaw)) : 1
          const normalizedMax = Math.max(1, maxSelect)
          const normalizedMin = Math.min(minSelect, normalizedMax)
          return {
            key,
            label: label || key,
            required,
            minSelect: normalizedMin,
            maxSelect: normalizedMax,
          }
        })
        .filter((x): x is { key: string; label: string; required: boolean; minSelect: number; maxSelect: number } => !!x)
    : null
  const kitchenPrinter =
    body.kitchenPrinter === 0 ||
    body.kitchenPrinter === 1 ||
    body.kitchenPrinter === 2 ||
    body.kitchenPrinter === 3
      ? body.kitchenPrinter
      : null
  const cookingTimeMin =
    body.cookingTimeMin != null && Number.isFinite(body.cookingTimeMin) && body.cookingTimeMin >= 0
      ? body.cookingTimeMin
      : null
  const isBanban = body.isBanban === true
  const hasDescriptionDefault = 'descriptionDefault' in body
  const hasDescriptionDelivery = 'descriptionDelivery' in body
  const hasDescriptionTable = 'descriptionTable' in body
  const hasSortOrder = body.sortOrder != null && Number.isFinite(Number(body.sortOrder))
  const baseRow: Record<string, unknown> = {
    code,
    name,
    category: String(body.category ?? '').trim(),
    category_main: String(body.categoryMain ?? '').trim(),
    price: Number(body.price) ?? 0,
    price_delivery: body.priceDelivery != null ? Number(body.priceDelivery) : null,
    image: String(body.imageUrl ?? '').trim(),
    vat_included: body.vatIncluded !== false,
    is_active: body.isActive !== false,
  }
  if (hasSortOrder) baseRow.sort_order = Number(body.sortOrder)
  if (optionSelectionGroupsExplicit) {
    baseRow.option_selection_groups =
      optionSelectionGroupsCleaned && optionSelectionGroupsCleaned.length > 0
        ? optionSelectionGroupsCleaned
        : []
  } else if (optionSelectionGroupsLegacy && optionSelectionGroupsLegacy.length > 0) {
    baseRow.option_selection_groups = optionSelectionGroupsLegacy
  }
  if (optionSelectionConfigExplicit) {
    baseRow.option_selection_config =
      optionSelectionConfigCleaned && optionSelectionConfigCleaned.length > 0
        ? optionSelectionConfigCleaned
        : []
  }
  if (kitchenPrinter != null) baseRow.kitchen_printer = kitchenPrinter
  if (cookingTimeMin != null) baseRow.cooking_time_min = cookingTimeMin
  baseRow.is_banban = isBanban
  if (!editingId || hasDescriptionDefault) {
    baseRow.description_default = String(body.descriptionDefault ?? '').trim()
  }
  if (!editingId || hasDescriptionDelivery) {
    const v = body.descriptionDelivery
    baseRow.description_delivery = v == null ? null : String(v).trim()
  }
  if (!editingId || hasDescriptionTable) {
    const v = body.descriptionTable
    baseRow.description_table = v == null ? null : String(v).trim()
  }

  const doSave = async (
    row: Record<string, unknown>
  ): Promise<{
    success: boolean
    message: string
    newId?: string
    syncHint?: {
      imageChanged: boolean
      changedFields: string[]
      partnerMerchantID?: string | null
    }
  }> => {
    if (editingId) {
      let existing: ExistingMenuRow[] | null = null
      try {
        existing = (await supabaseSelectFilter(
          'pos_menus',
          `id=eq.${editingId}`,
          {
            limit: 1,
            select:
              'id,price,price_delivery,name,category_main,category,image,promo_id,vat_included,is_active,sort_order,option_selection_groups,option_selection_config,kitchen_printer,cooking_time_min,is_banban,description_default,description_delivery,description_table',
          }
        )) as ExistingMenuRow[] | null
      } catch {
        existing = (await supabaseSelectFilter(
          'pos_menus',
          `id=eq.${editingId}`,
          { limit: 1 }
        )) as ExistingMenuRow[] | null
      }
      if (existing && existing.length > 0) {
        const prev = existing[0]
        // sortOrder를 payload에서 보내지 않은 수정은 기존 값을 유지해야
        // 프로모 연동 메뉴의 "이미지 단독 수정"이 불필요한 필드 차이로 막히지 않는다.
        if (!hasSortOrder) {
          baseRow.sort_order = prev.sort_order ?? 0
        }
        const pid = prev.promo_id
        if (pid != null && Number(pid) > 0) {
          const rowWithoutImage = { ...row }
          delete rowWithoutImage.image
          const asNumberOrNull = (v: unknown): number | null => {
            if (v == null || v === '') return null
            const n = Number(v)
            return Number.isFinite(n) ? n : null
          }
          const asString = (v: unknown): string => String(v ?? '').trim()
          const asBool = (v: unknown): boolean => v === true
          const asStringArray = (v: unknown): string[] => {
            if (!Array.isArray(v)) return []
            return v.map((x) => String(x).trim()).filter(Boolean)
          }
          const sameFieldsExceptImage =
            asString(rowWithoutImage.name) === asString(prev.name) &&
            asString(rowWithoutImage.category_main) === asString(prev.category_main) &&
            asString(rowWithoutImage.category) === asString(prev.category) &&
            asNumberOrNull(rowWithoutImage.price) === asNumberOrNull(prev.price) &&
            asNumberOrNull(rowWithoutImage.price_delivery) === asNumberOrNull(prev.price_delivery) &&
            asBool(rowWithoutImage.vat_included) === asBool(prev.vat_included) &&
            asBool(rowWithoutImage.is_active) === asBool(prev.is_active) &&
            asNumberOrNull(rowWithoutImage.sort_order) === asNumberOrNull(prev.sort_order) &&
            asNumberOrNull(rowWithoutImage.kitchen_printer) === asNumberOrNull(prev.kitchen_printer) &&
            asNumberOrNull(rowWithoutImage.cooking_time_min) === asNumberOrNull(prev.cooking_time_min) &&
            asBool(rowWithoutImage.is_banban) === asBool(prev.is_banban) &&
            asString(rowWithoutImage.description_default) === asString(prev.description_default) &&
            asString(rowWithoutImage.description_delivery) === asString(prev.description_delivery) &&
            asString(rowWithoutImage.description_table) === asString(prev.description_table) &&
            JSON.stringify(asStringArray(rowWithoutImage.option_selection_groups)) ===
              JSON.stringify(asStringArray(prev.option_selection_groups)) &&
            JSON.stringify(rowWithoutImage.option_selection_config ?? null) ===
              JSON.stringify(prev.option_selection_config ?? null)
          if (!sameFieldsExceptImage) {
            return {
              success: false,
              message: '프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.',
            }
          }
        }
        if (pid != null && Number(pid) > 0) {
          const incomingImage = String(body.imageUrl ?? '').trim()
          if (!incomingImage && prev.image != null && String(prev.image).trim()) {
            row.image = String(prev.image).trim()
          }
        }
        const changedFields: string[] = []
        const nextName = String(row.name ?? prev.name ?? '').trim()
        const nextCategoryMain = String(row.category_main ?? prev.category_main ?? '').trim()
        const nextCategory = String(row.category ?? prev.category ?? '').trim()
        const nextImage = String(row.image ?? prev.image ?? '').trim()
        const nextPrice = Number(row.price ?? prev.price ?? 0)
        const nextPriceDelivery = row.price_delivery != null ? Number(row.price_delivery) : null
        const prevName = String(prev.name ?? '').trim()
        const prevCategoryMain = String(prev.category_main ?? '').trim()
        const prevCategory = String(prev.category ?? '').trim()
        const prevImage = String(prev.image ?? '').trim()
        const prevPrice = Number(prev.price ?? 0)
        const prevPriceDelivery = prev.price_delivery != null ? Number(prev.price_delivery) : null
        if (nextName !== prevName) changedFields.push('name')
        if (nextCategoryMain !== prevCategoryMain) changedFields.push('category_main')
        if (nextCategory !== prevCategory) changedFields.push('category')
        if (nextImage !== prevImage) changedFields.push('image')
        if (nextPrice !== prevPrice) changedFields.push('price')
        if (nextPriceDelivery !== prevPriceDelivery) changedFields.push('price_delivery')
        const catMain = (prev.category_main || '').trim()
        const cat = (prev.category || '').trim()
        const changes: { fieldName: string; oldValue: number | null; newValue: number | null }[] = []
        const newPrice = Number(row.price ?? prev.price ?? 0)
        const newPriceDelivery = row.price_delivery != null ? Number(row.price_delivery) : null
        if (Number(prev.price) !== newPrice) {
          changes.push({ fieldName: 'price', oldValue: prev.price ?? null, newValue: newPrice })
        }
        if ((prev.price_delivery ?? null) !== newPriceDelivery) {
          changes.push({
            fieldName: 'price_delivery',
            oldValue: prev.price_delivery ?? null,
            newValue: newPriceDelivery,
          })
        }
        if (changes.length > 0) {
          recordPriceChanges({
            entityType: 'pos_menu',
            entityId: editingId,
            entityDisplayName: prev.name ?? code,
            changes,
            category: cat || undefined,
            categoryMain: catMain || undefined,
          }).catch(() => {})
        }
        try {
          await supabaseUpdateByFilter('pos_menus', `id=eq.${editingId}`, row)
        } catch (colErr: unknown) {
          if (
            String(colErr).includes('category_main') ||
            String(colErr).includes('42703') ||
            String(colErr).includes('is_banban')
          ) {
            const rowWithout = { ...row } as Record<string, unknown>
            if (String(colErr).includes('category_main')) delete rowWithout.category_main
            if (String(colErr).includes('is_banban')) delete rowWithout.is_banban
            await supabaseUpdateByFilter('pos_menus', `id=eq.${editingId}`, rowWithout)
          } else throw colErr
        }
        return {
          success: true,
          message: '수정되었습니다.',
          syncHint: {
            imageChanged: changedFields.includes('image'),
            changedFields,
            partnerMerchantID: body.storeCode ? String(body.storeCode).trim() : null,
          },
        }
      }
    }

    const codeExists = (await supabaseSelectFilter(
      'pos_menus',
      `code=eq.${encodeURIComponent(code)}`,
      { limit: 1 }
    )) as { id?: number }[] | null
    if (codeExists && codeExists.length > 0 && !editingId) {
      return { success: false, message: '이미 존재하는 메뉴 코드입니다.' }
    }

    try {
      const inserted = (await supabaseInsert('pos_menus', row)) as { id?: number }[] | { id?: number }
      const newRow = Array.isArray(inserted) ? inserted[0] : inserted
      const newId = newRow?.id != null ? String(newRow.id) : undefined
      if (newId && (baseRow.price != null || body.price != null)) {
        const catMain = ((baseRow.category_main as string) || '').trim()
        const cat = ((baseRow.category as string) || '').trim()
        const initChanges: { fieldName: string; oldValue: number | null; newValue: number | null }[] = []
        const price = Number(baseRow.price ?? body.price ?? 0)
        const priceDelivery =
          baseRow.price_delivery != null
            ? Number(baseRow.price_delivery)
            : body.priceDelivery != null
              ? Number(body.priceDelivery)
              : null
        initChanges.push({ fieldName: 'price', oldValue: null, newValue: price })
        if (priceDelivery != null) {
          initChanges.push({ fieldName: 'price_delivery', oldValue: null, newValue: priceDelivery })
        }
        recordPriceChanges({
          entityType: 'pos_menu',
          entityId: newId,
          entityDisplayName: name,
          changes: initChanges,
          category: cat || undefined,
          categoryMain: catMain || undefined,
        }).catch(() => {})
      }
      return {
        success: true,
        message: '저장되었습니다.',
        newId,
        syncHint: {
          imageChanged: !!String(row.image ?? '').trim(),
          changedFields: ['insert'],
          partnerMerchantID: body.storeCode ? String(body.storeCode).trim() : null,
        },
      }
    } catch (insErr: unknown) {
      if (String(insErr).includes('category_main') || String(insErr).includes('42703')) {
        const rowWithout = { ...row }
        delete rowWithout.category_main
        const inserted = (await supabaseInsert('pos_menus', rowWithout)) as
          | { id?: number }[]
          | { id?: number }
        const newRow = Array.isArray(inserted) ? inserted[0] : inserted
        const newId = newRow?.id != null ? String(newRow.id) : undefined
        if (newId && (baseRow.price != null || body.price != null)) {
          const cat = ((baseRow.category as string) || '').trim()
          const price = Number(baseRow.price ?? body.price ?? 0)
          recordPriceChanges({
            entityType: 'pos_menu',
            entityId: newId,
            entityDisplayName: name,
            changes: [{ fieldName: 'price', oldValue: null, newValue: price }],
            category: cat || undefined,
          }).catch(() => {})
        }
        return {
          success: true,
          message: '저장되었습니다.',
          newId,
          syncHint: {
            imageChanged: !!String(rowWithout.image ?? '').trim(),
            changedFields: ['insert'],
            partnerMerchantID: body.storeCode ? String(body.storeCode).trim() : null,
          },
        }
      }
      throw insErr
    }
  }

  try {
    const result = await doSave(baseRow)
    if (result.success && code && (baseRow.price != null || body.price != null)) {
      const newPrice = Number(baseRow.price ?? body.price ?? 0)
      try {
        await supabaseUpdateByFilter('items', `code=eq.${encodeURIComponent(code)}`, { price: newPrice })
      } catch {
        /* items에 해당 code 없으면 무시 */
      }
    }
    return result
  } catch (saveErr: unknown) {
    const err = String(saveErr)
    if (
      optionSelectionGroupsExplicit &&
      (err.includes('option_selection_groups') || err.includes('option selection'))
    ) {
      return {
        success: false,
        message:
          'option_selection_groups 저장에 실패했습니다. Supabase pos_menus 테이블에 option_selection_groups 컬럼이 있는지 확인하세요.',
      }
    }
    if (
      (optionSelectionGroupsExplicit ||
        optionSelectionConfigExplicit ||
        optionSelectionGroupsLegacy ||
        kitchenPrinter != null ||
        cookingTimeMin != null ||
        isBanban ||
        hasDescriptionDefault ||
        hasDescriptionDelivery ||
        hasDescriptionTable) &&
      (err.includes('option_selection_groups') ||
        err.includes('option_selection_config') ||
        err.includes('kitchen_printer') ||
        err.includes('cooking_time_min') ||
        err.includes('is_banban') ||
        err.includes('description_default') ||
        err.includes('description_delivery') ||
        err.includes('description_table') ||
        err.includes('42703'))
    ) {
      const rowWithout = { ...baseRow }
      delete rowWithout.option_selection_groups
      delete rowWithout.option_selection_config
      delete rowWithout.kitchen_printer
      delete rowWithout.cooking_time_min
      delete rowWithout.is_banban
      delete rowWithout.description_default
      delete rowWithout.description_delivery
      delete rowWithout.description_table
      const result = await doSave(rowWithout)
      if (result.success && code && (baseRow.price != null || body.price != null)) {
        const newPrice = Number(baseRow.price ?? body.price ?? 0)
        try {
          await supabaseUpdateByFilter('items', `code=eq.${encodeURIComponent(code)}`, { price: newPrice })
        } catch {
          /* ignore */
        }
      }
      return result
    }
    throw saveErr
  }
}

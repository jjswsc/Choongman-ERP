import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
  supabaseDeleteByFilter,
  supabaseUpsert,
} from '@/lib/supabase-server'
import {
  normalizeChickenOptionSelectionGroups,
  syncOptionSelectionConfigToGroupKeys,
} from '@/lib/pos-option-selection-groups'
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
    audience?: 'all' | 'hall' | 'delivery'
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
  storeCodes?: string[]
  /**
   * true 이면 image 컬럼만 업데이트한다. 프로모션과 연동된 메뉴라도
   * 사진 업로드는 운영자가 메뉴 화면에서 직접 변경할 수 있어야 하므로,
   * 이 플래그가 켜진 요청은 다른 필드 비교/검증 단계를 건너뛴다.
   */
  imageOnly?: boolean
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
  const isChickenMenu = code.toLowerCase().startsWith('c')

  // imageOnly 요청은 image 컬럼만 갱신하므로 code/name 입력을 강제하지 않는다.
  const isImageOnlyEdit = body.imageOnly === true && !!editingId
  if (!isImageOnlyEdit && (!code || !name)) {
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
  const hasStoreCodesPayload = Array.isArray(body.storeCodes)
  const normalizedStoreCodes = hasStoreCodesPayload
    ? Array.from(
        new Set(
          body.storeCodes!
            .map((x) => String(x ?? '').trim())
            .filter(Boolean)
        )
      )
    : []
  if (hasStoreCodesPayload && normalizedStoreCodes.length === 0) {
    return { success: false, message: '노출 매장을 1개 이상 선택해 주세요.' }
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
          const audienceRaw = String(cfg?.audience ?? 'all').trim().toLowerCase()
          const audience: 'all' | 'hall' | 'delivery' =
            audienceRaw === 'hall' || audienceRaw === 'delivery' ? audienceRaw : 'all'
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
            audience,
            required,
            minSelect: normalizedMin,
            maxSelect: normalizedMax,
          }
        })
        .filter(
          (x): x is {
            key: string
            label: string
            audience: 'all' | 'hall' | 'delivery'
            required: boolean
            minSelect: number
            maxSelect: number
          } => !!x
        )
    : null
  const chickenSyncGroupOrder =
    isChickenMenu && optionSelectionGroupsCleaned && optionSelectionGroupsCleaned.length > 0
      ? normalizeChickenOptionSelectionGroups(optionSelectionGroupsCleaned)
      : isChickenMenu && optionSelectionGroupsLegacy && optionSelectionGroupsLegacy.length > 0
        ? normalizeChickenOptionSelectionGroups(optionSelectionGroupsLegacy)
        : isChickenMenu && optionSelectionConfigCleaned && optionSelectionConfigCleaned.length > 0
          ? normalizeChickenOptionSelectionGroups(
              optionSelectionConfigCleaned.map((x) => String(x?.key ?? '').trim()).filter(Boolean)
            )
          : null

  const optionSelectionGroupsFinal =
    optionSelectionGroupsExplicit && optionSelectionGroupsCleaned != null
      ? isChickenMenu
        ? normalizeChickenOptionSelectionGroups(optionSelectionGroupsCleaned)
        : optionSelectionGroupsCleaned
      : null
  const optionSelectionGroupsLegacyFinal =
    optionSelectionGroupsLegacy && optionSelectionGroupsLegacy.length > 0
      ? isChickenMenu
        ? normalizeChickenOptionSelectionGroups(optionSelectionGroupsLegacy)
        : optionSelectionGroupsLegacy
      : null
  const optionSelectionConfigFinal =
    isChickenMenu && optionSelectionConfigExplicit && optionSelectionConfigCleaned != null
      ? syncOptionSelectionConfigToGroupKeys(
          chickenSyncGroupOrder && chickenSyncGroupOrder.length > 0 ? chickenSyncGroupOrder : ['part'],
          optionSelectionConfigCleaned
        )
      : optionSelectionConfigCleaned
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
      optionSelectionGroupsFinal && optionSelectionGroupsFinal.length > 0
        ? optionSelectionGroupsFinal
        : []
  } else if (optionSelectionGroupsLegacyFinal && optionSelectionGroupsLegacyFinal.length > 0) {
    baseRow.option_selection_groups = optionSelectionGroupsLegacyFinal
  }
  if (optionSelectionConfigExplicit) {
    baseRow.option_selection_config =
      optionSelectionConfigFinal && optionSelectionConfigFinal.length > 0
        ? optionSelectionConfigFinal
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

        // imageOnly 플래그가 켜진 요청은 image 컬럼만 갱신한다.
        // - 프로모션과 연동된 메뉴라도 사진 업로드는 마케팅 화면을 거치지 않고
        //   운영자가 메뉴 화면에서 직접 갱신할 수 있어야 한다.
        if (body.imageOnly === true) {
          const incomingImage = String(body.imageUrl ?? '').trim()
          const prevImage = String(prev.image ?? '').trim()
          const imageRow: Record<string, unknown> = { image: incomingImage }
          await supabaseUpdateByFilter('pos_menus', `id=eq.${editingId}`, imageRow)
          return {
            success: true,
            message: '수정되었습니다.',
            syncHint: {
              imageChanged: incomingImage !== prevImage,
              changedFields: incomingImage !== prevImage ? ['image'] : [],
              partnerMerchantID: body.storeCode ? String(body.storeCode).trim() : null,
            },
          }
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
          /**
           * 옵션 그룹 설정(option_selection_config)은 저장 시점/입력 경로에 따라
           * 객체 키 순서·누락 필드(required/minSelect/maxSelect 등)가 달라
           * 단순 JSON.stringify 비교로는 의미 없는 차이가 검출된다.
           * 양쪽을 동일하게 정규화한 뒤 비교한다.
           */
          const normalizeOptionConfig = (v: unknown): string => {
            if (!Array.isArray(v)) return '[]'
            const list = v
              .map((cfg) => {
                if (cfg == null || typeof cfg !== 'object') return null
                const c = cfg as Record<string, unknown>
                const key = String(c.key ?? '').trim()
                if (!key) return null
                const label = String(c.label ?? '').trim() || key
                const required = c.required === true
                const minRaw = Number(c.minSelect)
                const maxRaw = Number(c.maxSelect)
                const minSelect = Number.isFinite(minRaw)
                  ? Math.max(0, Math.floor(minRaw))
                  : (required ? 1 : 0)
                const maxFromInput = Number.isFinite(maxRaw)
                  ? Math.max(0, Math.floor(maxRaw))
                  : 1
                const maxSelect = Math.max(1, maxFromInput, minSelect)
                return { key, label, required, minSelect, maxSelect }
              })
              .filter((x): x is { key: string; label: string; required: boolean; minSelect: number; maxSelect: number } => !!x)
            return JSON.stringify(list)
          }
          /**
           * 클라이언트가 명시적으로 보내지 않은 필드(undefined)는 변경 없음으로 간주한다.
           * (ex: 옵션 그룹/설정·설명 등 일부 화면이 부분 페이로드만 보낼 때)
           */
          const fieldUnchanged = (
            key: keyof typeof rowWithoutImage,
            normalize: (v: unknown) => string
          ): boolean => {
            if (!(key in rowWithoutImage)) return true
            return (
              normalize(rowWithoutImage[key as string]) ===
              normalize((prev as Record<string, unknown>)[key as string])
            )
          }
          const normStr = (v: unknown) => asString(v)
          const normNum = (v: unknown) => String(asNumberOrNull(v))
          const normBool = (v: unknown) => String(asBool(v))
          const normStrArr = (v: unknown) => JSON.stringify(asStringArray(v))
          const sameFieldsExceptImage =
            fieldUnchanged('name', normStr) &&
            fieldUnchanged('category_main', normStr) &&
            fieldUnchanged('category', normStr) &&
            fieldUnchanged('price', normNum) &&
            fieldUnchanged('price_delivery', normNum) &&
            fieldUnchanged('vat_included', normBool) &&
            fieldUnchanged('is_active', normBool) &&
            fieldUnchanged('sort_order', normNum) &&
            fieldUnchanged('kitchen_printer', normNum) &&
            fieldUnchanged('cooking_time_min', normNum) &&
            fieldUnchanged('is_banban', normBool) &&
            fieldUnchanged('description_default', normStr) &&
            fieldUnchanged('description_delivery', normStr) &&
            fieldUnchanged('description_table', normStr) &&
            fieldUnchanged('option_selection_groups', normStrArr) &&
            fieldUnchanged('option_selection_config', normalizeOptionConfig)
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
    if (result.success && hasStoreCodesPayload && !isImageOnlyEdit) {
      const savedMenuId = String(result.newId || editingId || '').trim()
      if (!savedMenuId) {
        return {
          success: false,
          message: '메뉴 저장은 완료되었지만 매장 노출 범위를 저장하지 못했습니다. 다시 저장해 주세요.',
        }
      }
      try {
        await supabaseDeleteByFilter('pos_menu_store_scopes', `menu_id=eq.${encodeURIComponent(savedMenuId)}`)
        if (normalizedStoreCodes.length > 0) {
          await supabaseUpsert(
            'pos_menu_store_scopes',
            normalizedStoreCodes.map((storeCode) => ({
              menu_id: Number(savedMenuId),
              store_code: storeCode,
              enabled: true,
            })),
            'store_code,menu_id'
          )
        }
      } catch (scopeErr: unknown) {
        console.error('upsertPosMenuFromBody scope sync:', scopeErr)
        return {
          success: false,
          message: '메뉴 저장은 완료되었지만 매장 노출 범위 저장에 실패했습니다. DB 스키마를 확인해 주세요.',
        }
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

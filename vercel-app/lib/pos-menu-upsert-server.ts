import {
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseDeleteByFilter,
  supabaseUpsert,
} from '@/lib/supabase-server'
import {
  supabaseInsertWithPgrst204Fallback,
  supabaseUpdateByFilterWithPgrst204Fallback,
} from '@/lib/supabase-pgrst204-retry'
import {
  normalizeChickenOptionSelectionGroups,
  syncOptionSelectionConfigToGroupKeys,
} from '@/lib/pos-option-selection-groups'
import { recordPriceChanges } from '@/lib/price-history'
import { resolveMenuImageColumnForUpsert } from '@/lib/pos-menu-image-upsert'
import { validatePosMenuImageUrlForMenu } from '@/lib/pos-menu-image-storage-path'
import {
  isStrictBonelessBbqChickenCode,
  normalizeBbqChickenOptionSelectionGroups,
  validateBbqOptionSelectionGroups,
} from '@/lib/pos-bbq-option-guard'
import {
  normalizePromotionCategoryMain,
  normalizePromotionSubcategory,
} from '@/lib/pos-promo-constants'
import {
  appendPosCatalogTenantFilter,
  assertPosCatalogTenantWritable,
  isMissingTenantIdColumnError,
  markPosMenusTenantIdColumnMissing,
  stampPosCatalogTenantId,
  type PosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'
import { sanitizeMenuScopeStoreCodes } from '@/lib/pos-operating-store-code'

export { resolveMenuImageColumnForUpsert } from '@/lib/pos-menu-image-upsert'

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
  buffetIncludable?: boolean
  banbanFlavorMenuIds?: string[]
  descriptionDefault?: string
  descriptionDelivery?: string | null
  descriptionTable?: string | null
  sellHall?: boolean
  sellDelivery?: boolean
  sellPackaging?: boolean
  sellMember?: boolean
  /** 원가 계산기 배달앱 수수료(%) — 0 허용, null이면 DB NULL(앱 기본 25%) */
  deliveryAppFeePercent?: number | null
  id?: string
  storeCode?: string
  storeCodes?: string[]
  /**
   * true 이면 image 컬럼만 업데이트한다. 프로모션과 연동된 메뉴라도
   * 사진 업로드는 운영자가 메뉴 화면에서 직접 변경할 수 있어야 하므로,
   * 이 플래그가 켜진 요청은 다른 필드 비교/검증 단계를 건너뛴다.
   */
  imageOnly?: boolean
  /**
   * true 이면 설명(description_*) 컬럼만 갱신한다. 프로모션 연동 메뉴의
   * Grab/LineMan 설명 등은 메뉴 화면 설명 탭에서 저장할 수 있어야 한다.
   */
  descriptionOnly?: boolean
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
  buffet_includable?: boolean | null
  description_default?: string | null
  description_delivery?: string | null
  description_table?: string | null
  delivery_app_fee_percent?: number | null
  sell_hall?: boolean | null
  sell_delivery?: boolean | null
  sell_packaging?: boolean | null
}

/** 수정 시 요청 본문에 포함된 필드만 DB에 반영 (미포함 필드는 기존값 유지) */
export function buildPosMenuUpsertRow(
  body: PosMenuUpsertApiBody,
  opts: {
    isEdit: boolean
    optionSelectionGroupsExplicit: boolean
    optionSelectionGroupsLegacyFinal: string[] | null
    optionSelectionGroupsFinal: string[] | null
    optionSelectionConfigExplicit: boolean
    optionSelectionConfigFinal:
      | {
          key: string
          label: string
          audience: 'all' | 'hall' | 'delivery'
          required: boolean
          minSelect: number
          maxSelect: number
        }[]
      | null
    hasSortOrder: boolean
    hasDeliveryAppFeePercent: boolean
    deliveryAppFeePercent: number | null | undefined
    kitchenPrinterInBody: boolean
    kitchenPrinter: number | null
    cookingTimeInBody: boolean
    cookingTimeMin: number | null
    hasDescriptionDefault: boolean
    hasDescriptionDelivery: boolean
    hasDescriptionTable: boolean
  }
): Record<string, unknown> {
  const row: Record<string, unknown> = {}

  if (!opts.isEdit) {
    row.code = String(body.code ?? '').trim()
    row.name = String(body.name ?? '').trim()
    row.category = String(body.category ?? '').trim()
    row.category_main = String(body.categoryMain ?? '').trim()
    row.price = Number(body.price) ?? 0
    row.price_delivery = body.priceDelivery != null ? Number(body.priceDelivery) : null
    const imageCol = resolveMenuImageColumnForUpsert(body, { isEdit: false })
    if (imageCol.includeInRow) row.image = imageCol.image
    row.vat_included = body.vatIncluded !== false
    row.is_active = body.isActive !== false
    if (opts.hasSortOrder) row.sort_order = Number(body.sortOrder)
    if (opts.optionSelectionGroupsExplicit) {
      row.option_selection_groups =
        opts.optionSelectionGroupsFinal && opts.optionSelectionGroupsFinal.length > 0
          ? opts.optionSelectionGroupsFinal
          : []
    } else if (opts.optionSelectionGroupsLegacyFinal && opts.optionSelectionGroupsLegacyFinal.length > 0) {
      row.option_selection_groups = opts.optionSelectionGroupsLegacyFinal
    }
    if (opts.optionSelectionConfigExplicit) {
      row.option_selection_config =
        opts.optionSelectionConfigFinal && opts.optionSelectionConfigFinal.length > 0
          ? opts.optionSelectionConfigFinal
          : []
    }
    if (opts.kitchenPrinterInBody && opts.kitchenPrinter != null) {
      row.kitchen_printer = opts.kitchenPrinter
    }
    if (opts.cookingTimeInBody) {
      row.cooking_time_min = opts.cookingTimeMin
    }
    if (opts.hasDeliveryAppFeePercent) {
      row.delivery_app_fee_percent =
        opts.deliveryAppFeePercent != null && Number.isFinite(opts.deliveryAppFeePercent)
          ? opts.deliveryAppFeePercent
          : null
    }
    row.is_banban = 'isBanban' in body ? body.isBanban === true : false
    row.buffet_includable = 'buffetIncludable' in body ? body.buffetIncludable === true : false
    row.sell_hall = body.sellHall !== false
    row.sell_delivery = body.sellDelivery !== false
    row.sell_packaging = body.sellPackaging !== false
    row.sell_member =
      'sellMember' in body ? body.sellMember !== false : body.sellPackaging !== false
    row.description_default = String(body.descriptionDefault ?? '').trim()
    const vDel = body.descriptionDelivery
    row.description_delivery = vDel == null ? null : String(vDel).trim()
    const vTbl = body.descriptionTable
    row.description_table = vTbl == null ? null : String(vTbl).trim()
    return row
  }

  if ('code' in body) row.code = String(body.code ?? '').trim()
  if ('name' in body) row.name = String(body.name ?? '').trim()
  if ('category' in body) row.category = String(body.category ?? '').trim()
  if ('categoryMain' in body) row.category_main = String(body.categoryMain ?? '').trim()
  if ('price' in body) row.price = Number(body.price) ?? 0
  if ('priceDelivery' in body) {
    row.price_delivery = body.priceDelivery != null ? Number(body.priceDelivery) : null
  }
  const imageCol = resolveMenuImageColumnForUpsert(body, { isEdit: true })
  if (imageCol.includeInRow) row.image = imageCol.image
  if ('vatIncluded' in body) row.vat_included = body.vatIncluded !== false
  if ('isActive' in body) row.is_active = body.isActive !== false
  if (opts.hasSortOrder) row.sort_order = Number(body.sortOrder)
  if (opts.optionSelectionGroupsExplicit) {
    row.option_selection_groups =
      opts.optionSelectionGroupsFinal && opts.optionSelectionGroupsFinal.length > 0
        ? opts.optionSelectionGroupsFinal
        : []
  } else if (opts.optionSelectionGroupsLegacyFinal && opts.optionSelectionGroupsLegacyFinal.length > 0) {
    row.option_selection_groups = opts.optionSelectionGroupsLegacyFinal
  }
  if (opts.optionSelectionConfigExplicit) {
    row.option_selection_config =
      opts.optionSelectionConfigFinal && opts.optionSelectionConfigFinal.length > 0
        ? opts.optionSelectionConfigFinal
        : []
  }
  if (opts.kitchenPrinterInBody) {
    row.kitchen_printer = opts.kitchenPrinter
  }
  if (opts.cookingTimeInBody) {
    row.cooking_time_min = opts.cookingTimeMin
  }
  if (opts.hasDeliveryAppFeePercent) {
    row.delivery_app_fee_percent =
      opts.deliveryAppFeePercent != null && Number.isFinite(opts.deliveryAppFeePercent)
        ? opts.deliveryAppFeePercent
        : null
  }
  if ('isBanban' in body) row.is_banban = body.isBanban === true
  if ('buffetIncludable' in body) row.buffet_includable = body.buffetIncludable === true
  if ('sellHall' in body) row.sell_hall = body.sellHall !== false
  if ('sellDelivery' in body) row.sell_delivery = body.sellDelivery !== false
  if ('sellPackaging' in body) row.sell_packaging = body.sellPackaging !== false
  if ('sellMember' in body) row.sell_member = body.sellMember !== false
  if (opts.hasDescriptionDefault) {
    row.description_default = String(body.descriptionDefault ?? '').trim()
  }
  if (opts.hasDescriptionDelivery) {
    const v = body.descriptionDelivery
    row.description_delivery = v == null ? null : String(v).trim()
  }
  if (opts.hasDescriptionTable) {
    const v = body.descriptionTable
    row.description_table = v == null ? null : String(v).trim()
  }
  return row
}

/**
 * POS 메뉴 단건 저장. upsertByCode=true이면 동일 코드가 있으면 해당 행을 수정(일괄 업로드용).
 */
export async function upsertPosMenuFromBody(
  body: PosMenuUpsertApiBody,
  opts?: { upsertByCode?: boolean; catalogScope?: PosCatalogTenantScope }
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
  const catalogScope: PosCatalogTenantScope = opts?.catalogScope ?? { enforce: false, tenantId: '' }
  const tenantWriteBlock = assertPosCatalogTenantWritable(catalogScope)
  if (tenantWriteBlock) {
    return { success: false, message: tenantWriteBlock }
  }
  const menuIdFilter = (id: string) => appendPosCatalogTenantFilter(`id=eq.${encodeURIComponent(id)}`, catalogScope)
  const normalizeMenuCode = (raw: unknown): string => String(raw ?? '').trim().toLowerCase()
  const code = String(body.code ?? '').trim()
  const name = String(body.name ?? '').trim()
  let editingId = body.id ? String(body.id).trim() : null
  const isEdit = !!editingId
  const isChickenMenu = ('code' in body ? code : '').toLowerCase().startsWith('c')
  let effectiveCode = code
  if (!effectiveCode && editingId) {
    try {
      const rows = (await supabaseSelectFilter(
        'pos_menus',
        menuIdFilter(editingId),
        { limit: 1, select: 'code' }
      )) as { code?: string }[] | null
      effectiveCode = String(rows?.[0]?.code ?? '').trim()
    } catch (err) {
      if (isMissingTenantIdColumnError(err)) {
        markPosMenusTenantIdColumnMissing()
        return {
          success: false,
          message: '메뉴 tenant_id 스키마가 없습니다. Omni DB에 sql/pos_catalog_tenant_id.sql 을 실행해 주세요.',
        }
      }
      /* ignore */
    }
  }

  // imageOnly / descriptionOnly 요청은 일부 컬럼만 갱신하므로 code/name 입력을 강제하지 않는다.
  const isImageOnlyEdit = body.imageOnly === true && !!editingId
  const isDescriptionOnlyEdit = body.descriptionOnly === true && !!editingId
  const isPartialMenuEdit = isImageOnlyEdit || isDescriptionOnlyEdit
  if (!isPartialMenuEdit && !isEdit && (!code || !name)) {
    return { success: false, message: '코드와 메뉴명이 필요합니다.' }
  }
  // 메뉴 코드는 생성 후 식별자처럼 사용된다.
  // 수정 요청(id 포함)에서 code 변경을 허용하면 동일 코드/다른 id 불일치가 재발하므로 서버에서 차단한다.
  if (isEdit && !isPartialMenuEdit && 'code' in body) {
    const row = (await supabaseSelectFilter(
      'pos_menus',
      menuIdFilter(String(editingId || '')),
      { limit: 1, select: 'code' }
    )) as { code?: string | null }[] | null
    const currentCode = String(row?.[0]?.code ?? '').trim()
    const incomingCode = String(body.code ?? '').trim()
    if (!currentCode) {
      return { success: false, message: '기존 메뉴 코드를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.' }
    }
    if (normalizeMenuCode(currentCode) !== normalizeMenuCode(incomingCode)) {
      return {
        success: false,
        message: `메뉴 코드는 생성 후 변경할 수 없습니다. 현재 코드(${currentCode})를 유지해 주세요.`,
      }
    }
  }

  if (!editingId && opts?.upsertByCode) {
    const byCodeFilter = appendPosCatalogTenantFilter(
      `code=eq.${encodeURIComponent(code)}`,
      catalogScope
    )
    const byCode = (await supabaseSelectFilter(
      'pos_menus',
      byCodeFilter,
      { limit: 1, select: 'id' }
    )) as { id?: number }[] | null
    if (byCode?.[0]?.id != null) {
      editingId = String(byCode[0].id)
    }
  }
  if ('imageUrl' in body) {
    const incomingImg = String(body.imageUrl ?? '').trim()
    const menuIdForImg = editingId || body.id
    if (incomingImg && menuIdForImg) {
      const imgCheck = validatePosMenuImageUrlForMenu(incomingImg, menuIdForImg)
      if (!imgCheck.ok) {
        return { success: false, message: imgCheck.message }
      }
    }
  }
  const hasStoreCodesPayload = Array.isArray(body.storeCodes)
  const normalizedStoreCodes = hasStoreCodesPayload
    ? sanitizeMenuScopeStoreCodes(body.storeCodes)
    : []
  /** Omni: 신규 메뉴·스코프 저장 요청은 노출 매장 1개 이상 필수 (POS 0건 예방) */
  if (catalogScope.enforce && !isPartialMenuEdit) {
    if (!isEdit && (!hasStoreCodesPayload || normalizedStoreCodes.length === 0)) {
      return {
        success: false,
        message:
          '노출 매장(Store)을 1개 이상 선택해 저장해 주세요. 매장을 지정하지 않으면 POS에 메뉴가 표시되지 않습니다.',
      }
    }
    if (hasStoreCodesPayload && normalizedStoreCodes.length === 0) {
      return {
        success: false,
        message:
          '노출 매장을 모두 해제할 수 없습니다. POS에 메뉴가 사라집니다. 최소 1개 매장을 남겨 주세요.',
      }
    }
  }
  const hasBanbanFlavorMenuIdsPayload = Array.isArray(body.banbanFlavorMenuIds)
  const normalizedBanbanFlavorMenuIds = hasBanbanFlavorMenuIdsPayload
    ? Array.from(
        new Set(
          body.banbanFlavorMenuIds!
            .map((x) => String(x ?? '').trim())
            .filter(Boolean)
        )
      )
    : []
  let canSyncBanbanFlavorLinks = hasBanbanFlavorMenuIdsPayload
  if (hasBanbanFlavorMenuIdsPayload) {
    try {
      await supabaseSelectFilter('pos_banban_flavor_links', 'id=gt.0', {
        limit: 1,
        select: 'id',
      })
    } catch {
      canSyncBanbanFlavorLinks = false
      if (normalizedBanbanFlavorMenuIds.length > 0) {
        return {
          success: false,
          message: '반반 허용 맛 저장용 DB 스키마가 아직 배포되지 않았습니다. SQL 적용 후 다시 저장해 주세요.',
        }
      }
    }
  }
  if (hasStoreCodesPayload && normalizedStoreCodes.length === 0 && !isPartialMenuEdit) {
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
  const normalizeGroupsForMenu = (groups: string[]) => {
    if (isStrictBonelessBbqChickenCode(effectiveCode)) {
      return normalizeBbqChickenOptionSelectionGroups(groups)
    }
    if (isChickenMenu) return normalizeChickenOptionSelectionGroups(groups)
    return groups
  }

  const chickenSyncGroupOrder =
    isChickenMenu && optionSelectionGroupsCleaned && optionSelectionGroupsCleaned.length > 0
      ? normalizeGroupsForMenu(optionSelectionGroupsCleaned)
      : isChickenMenu && optionSelectionGroupsLegacy && optionSelectionGroupsLegacy.length > 0
        ? normalizeGroupsForMenu(optionSelectionGroupsLegacy)
        : isChickenMenu && optionSelectionConfigCleaned && optionSelectionConfigCleaned.length > 0
          ? normalizeGroupsForMenu(
              optionSelectionConfigCleaned.map((x) => String(x?.key ?? '').trim()).filter(Boolean)
            )
          : null

  const optionSelectionGroupsFinal =
    optionSelectionGroupsExplicit && optionSelectionGroupsCleaned != null
      ? normalizeGroupsForMenu(optionSelectionGroupsCleaned)
      : null
  const optionSelectionGroupsLegacyFinal =
    optionSelectionGroupsLegacy && optionSelectionGroupsLegacy.length > 0
      ? normalizeGroupsForMenu(optionSelectionGroupsLegacy)
      : null
  const optionSelectionConfigFinal =
    isChickenMenu && optionSelectionConfigExplicit && optionSelectionConfigCleaned != null
      ? syncOptionSelectionConfigToGroupKeys(
          chickenSyncGroupOrder && chickenSyncGroupOrder.length > 0
            ? chickenSyncGroupOrder
            : isStrictBonelessBbqChickenCode(effectiveCode)
              ? []
              : ['part'],
          optionSelectionConfigCleaned
        )
      : optionSelectionConfigCleaned
  const bbqGroupGuard = validateBbqOptionSelectionGroups(
    effectiveCode,
    optionSelectionGroupsFinal ?? optionSelectionGroupsLegacyFinal
  )
  if (!bbqGroupGuard.ok) {
    return { success: false, message: bbqGroupGuard.message }
  }
  const kitchenPrinterInBody = 'kitchenPrinter' in body
  const kitchenPrinter =
    body.kitchenPrinter === 0 ||
    body.kitchenPrinter === 1 ||
    body.kitchenPrinter === 2 ||
    body.kitchenPrinter === 3
      ? body.kitchenPrinter
      : null
  const cookingTimeInBody = 'cookingTimeMin' in body
  const cookingTimeMin =
    body.cookingTimeMin != null && Number.isFinite(body.cookingTimeMin) && body.cookingTimeMin >= 0
      ? body.cookingTimeMin
      : null
  const hasDescriptionDefault = 'descriptionDefault' in body
  const hasDescriptionDelivery = 'descriptionDelivery' in body
  const hasDescriptionTable = 'descriptionTable' in body
  const hasSortOrder = body.sortOrder != null && Number.isFinite(Number(body.sortOrder))
  const hasDeliveryAppFeePercent = 'deliveryAppFeePercent' in body
  const deliveryAppFeePercent =
    hasDeliveryAppFeePercent && body.deliveryAppFeePercent != null
      ? Math.max(0, Math.min(100, Number(body.deliveryAppFeePercent)))
      : hasDeliveryAppFeePercent
        ? null
        : undefined
  const baseRow = buildPosMenuUpsertRow(body, {
    isEdit,
    optionSelectionGroupsExplicit,
    optionSelectionGroupsLegacyFinal,
    optionSelectionGroupsFinal,
    optionSelectionConfigExplicit,
    optionSelectionConfigFinal,
    hasSortOrder,
    hasDeliveryAppFeePercent,
    deliveryAppFeePercent,
    kitchenPrinterInBody,
    kitchenPrinter,
    cookingTimeInBody,
    cookingTimeMin,
    hasDescriptionDefault,
    hasDescriptionDelivery,
    hasDescriptionTable,
  })

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
          menuIdFilter(editingId),
          {
            limit: 1,
            select:
              'id,price,price_delivery,name,category_main,category,image,promo_id,vat_included,is_active,sort_order,option_selection_groups,option_selection_config,kitchen_printer,cooking_time_min,is_banban,buffet_includable,description_default,description_delivery,description_table,delivery_app_fee_percent,sell_hall,sell_delivery,sell_packaging',
          }
        )) as ExistingMenuRow[] | null
      } catch (err) {
        if (isMissingTenantIdColumnError(err)) {
          markPosMenusTenantIdColumnMissing()
          return {
            success: false,
            message: '메뉴 tenant_id 스키마가 없습니다. Omni DB에 sql/pos_catalog_tenant_id.sql 을 실행해 주세요.',
          }
        }
        existing = (await supabaseSelectFilter(
          'pos_menus',
          menuIdFilter(editingId),
          { limit: 1 }
        )) as ExistingMenuRow[] | null
      }
      if (!existing || existing.length === 0) {
        return {
          success: false,
          message: catalogScope.enforce
            ? '메뉴를 찾을 수 없거나 다른 회사 메뉴입니다.'
            : '존재하지 않는 메뉴입니다.',
        }
      }
      if (existing && existing.length > 0) {
        const prev = existing[0]

        if (Object.keys(row).length === 0) {
          return {
            success: true,
            message: '수정되었습니다.',
            syncHint: {
              imageChanged: false,
              changedFields: [],
              partnerMerchantID: body.storeCode ? String(body.storeCode).trim() : null,
            },
          }
        }

        // imageOnly 플래그가 켜진 요청은 image 컬럼만 갱신한다.
        // - 프로모션과 연동된 메뉴라도 사진 업로드는 마케팅 화면을 거치지 않고
        //   운영자가 메뉴 화면에서 직접 갱신할 수 있어야 한다.
        if (body.imageOnly === true) {
          const incomingImage = String(body.imageUrl ?? '').trim()
          const prevImage = String(prev.image ?? '').trim()
          const imageRow: Record<string, unknown> = { image: incomingImage }
          await supabaseUpdateByFilter('pos_menus', menuIdFilter(editingId), imageRow)
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
        if (body.descriptionOnly === true) {
          const descRow: Record<string, unknown> = {}
          const changedFields: string[] = []
          if ('descriptionDefault' in body) {
            const next = String(body.descriptionDefault ?? '').trim()
            descRow.description_default = next
            if (next !== String(prev.description_default ?? '').trim()) {
              changedFields.push('description_default')
            }
          }
          if ('descriptionDelivery' in body) {
            const v = body.descriptionDelivery
            const next = v == null ? null : String(v).trim()
            descRow.description_delivery = next
            const prevVal =
              prev.description_delivery == null ? null : String(prev.description_delivery).trim()
            if (next !== prevVal) changedFields.push('description_delivery')
          }
          if ('descriptionTable' in body) {
            const v = body.descriptionTable
            const next = v == null ? null : String(v).trim()
            descRow.description_table = next
            const prevVal =
              prev.description_table == null ? null : String(prev.description_table).trim()
            if (next !== prevVal) changedFields.push('description_table')
          }
          const imageCol = resolveMenuImageColumnForUpsert(body, { isEdit: true })
          if (imageCol.includeInRow) {
            const nextImage = imageCol.image
            descRow.image = nextImage
            const prevImage = String(prev.image ?? '').trim()
            if (nextImage !== prevImage) changedFields.push('image')
          }
          if (Object.keys(descRow).length === 0) {
            return {
              success: true,
              message: '수정되었습니다.',
              syncHint: {
                imageChanged: false,
                changedFields: [],
                partnerMerchantID: body.storeCode ? String(body.storeCode).trim() : null,
              },
            }
          }
          await supabaseUpdateByFilter('pos_menus', menuIdFilter(editingId), descRow)
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
        const pid = prev.promo_id
        if (pid != null && Number(pid) > 0 && hasBanbanFlavorMenuIdsPayload) {
          // 클라이언트가 isBanban=false일 때도 banbanFlavorMenuIds: []를 보내는 경우가 있어
          // payload 존재만으로 차단하면 설명·이미지 저장까지 막힌다.
          const wantsBanbanChange =
            body.isBanban === true || normalizedBanbanFlavorMenuIds.length > 0
          if (wantsBanbanChange) {
            return {
              success: false,
              message: '프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.',
            }
          }
        }
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
                const audienceRaw = String(c.audience ?? 'all').trim().toLowerCase()
                const audience: 'all' | 'hall' | 'delivery' =
                  audienceRaw === 'hall' || audienceRaw === 'delivery' ? audienceRaw : 'all'
                const minSelect = Number.isFinite(minRaw)
                  ? Math.max(0, Math.floor(minRaw))
                  : (required ? 1 : 0)
                const maxFromInput = Number.isFinite(maxRaw)
                  ? Math.max(0, Math.floor(maxRaw))
                  : 1
                const maxSelect = Math.max(1, maxFromInput, minSelect)
                return { key, label, audience, required, minSelect, maxSelect }
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
          const normCategoryMain = (v: unknown) =>
            asString(normalizePromotionCategoryMain(asString(v)))
          const normCategory = (v: unknown) =>
            asString(normalizePromotionSubcategory(asString(v)))
          const normNum = (v: unknown) => String(asNumberOrNull(v))
          const normBool = (v: unknown) => String(asBool(v))
          const normStrArr = (v: unknown) => JSON.stringify(asStringArray(v))
          /** 프로모션 연동 메뉴: 설명·이미지는 메뉴 화면에서, 나머지는 프로모션 관리에서 */
          const promoManagedFieldsUnchanged =
            fieldUnchanged('name', normStr) &&
            fieldUnchanged('category_main', normCategoryMain) &&
            fieldUnchanged('category', normCategory) &&
            fieldUnchanged('price', normNum) &&
            fieldUnchanged('price_delivery', normNum) &&
            fieldUnchanged('vat_included', normBool) &&
            fieldUnchanged('is_active', normBool) &&
            fieldUnchanged('sort_order', normNum) &&
            fieldUnchanged('kitchen_printer', normNum) &&
            fieldUnchanged('cooking_time_min', normNum) &&
            fieldUnchanged('is_banban', normBool) &&
            fieldUnchanged('buffet_includable', normBool) &&
            fieldUnchanged('delivery_app_fee_percent', normNum) &&
            fieldUnchanged('sell_hall', normBool) &&
            fieldUnchanged('sell_delivery', normBool) &&
            fieldUnchanged('sell_packaging', normBool) &&
            fieldUnchanged('option_selection_groups', normStrArr) &&
            fieldUnchanged('option_selection_config', normalizeOptionConfig)
          if (!promoManagedFieldsUnchanged) {
            return {
              success: false,
              message: '프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.',
            }
          }
        }
        if (pid != null && Number(pid) > 0 && 'imageUrl' in body) {
          const incomingImage = String(body.imageUrl ?? '').trim()
          if (!incomingImage && prev.image != null && String(prev.image).trim()) {
            row.image = String(prev.image).trim()
          }
        }
        const changedFields: string[] = []
        const prevName = String(prev.name ?? '').trim()
        const prevCategoryMain = String(prev.category_main ?? '').trim()
        const prevCategory = String(prev.category ?? '').trim()
        const prevImage = String(prev.image ?? '').trim()
        if ('name' in row) {
          const nextName = String(row.name ?? '').trim()
          if (nextName !== prevName) changedFields.push('name')
        }
        if ('category_main' in row) {
          const nextCategoryMain = String(row.category_main ?? '').trim()
          if (nextCategoryMain !== prevCategoryMain) changedFields.push('category_main')
        }
        if ('category' in row) {
          const nextCategory = String(row.category ?? '').trim()
          if (nextCategory !== prevCategory) changedFields.push('category')
        }
        if ('image' in row) {
          const nextImage = String(row.image ?? '').trim()
          if (nextImage !== prevImage) changedFields.push('image')
        }
        if ('sell_hall' in row) {
          const nextSellHall = row.sell_hall !== false
          if (nextSellHall !== (prev.sell_hall !== false)) changedFields.push('sell_hall')
        }
        if ('sell_delivery' in row) {
          const nextSellDelivery = row.sell_delivery !== false
          if (nextSellDelivery !== (prev.sell_delivery !== false)) changedFields.push('sell_delivery')
        }
        if ('sell_packaging' in row) {
          const nextSellPackaging = row.sell_packaging !== false
          if (nextSellPackaging !== (prev.sell_packaging !== false)) changedFields.push('sell_packaging')
        }
        if ('description_default' in row) {
          const next = String(row.description_default ?? '').trim()
          if (next !== String(prev.description_default ?? '').trim()) changedFields.push('description_default')
        }
        if ('description_delivery' in row) {
          const next = row.description_delivery == null ? '' : String(row.description_delivery).trim()
          const prevVal =
            prev.description_delivery == null ? '' : String(prev.description_delivery).trim()
          if (next !== prevVal) changedFields.push('description_delivery')
        }
        if ('description_table' in row) {
          const next = row.description_table == null ? '' : String(row.description_table).trim()
          const prevVal = prev.description_table == null ? '' : String(prev.description_table).trim()
          if (next !== prevVal) changedFields.push('description_table')
        }
        const catMain = (prev.category_main || '').trim()
        const cat = (prev.category || '').trim()
        const changes: { fieldName: string; oldValue: number | null; newValue: number | null }[] = []
        if ('price' in row) {
          const newPrice = Number(row.price ?? 0)
          if (Number(prev.price) !== newPrice) {
            changedFields.push('price')
            changes.push({ fieldName: 'price', oldValue: prev.price ?? null, newValue: newPrice })
          }
        }
        if ('price_delivery' in row) {
          const newPriceDelivery = row.price_delivery != null ? Number(row.price_delivery) : null
          if ((prev.price_delivery ?? null) !== newPriceDelivery) {
            changedFields.push('price_delivery')
            changes.push({
              fieldName: 'price_delivery',
              oldValue: prev.price_delivery ?? null,
              newValue: newPriceDelivery,
            })
          }
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
        await supabaseUpdateByFilterWithPgrst204Fallback(
          'pos_menus',
          menuIdFilter(editingId),
          row,
          'savePosMenu'
        )
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
      appendPosCatalogTenantFilter(`code=ilike.${encodeURIComponent(code)}`, catalogScope),
      { limit: 20, select: 'id,code' }
    )) as { id?: number; code?: string | null }[] | null
    const duplicated = (codeExists || []).some(
      (r) => normalizeMenuCode(r.code) === normalizeMenuCode(code)
    )
    if (duplicated && !editingId) {
      return { success: false, message: '이미 존재하는 메뉴 코드입니다.' }
    }

    const inserted = (await supabaseInsertWithPgrst204Fallback(
      'pos_menus',
      stampPosCatalogTenantId(row, catalogScope),
      'savePosMenu'
    )) as
      | { id?: number }[]
      | { id?: number }
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
  }

  const itemsSyncCode = String(('code' in body ? body.code : code) ?? '').trim()
  try {
    const result = await doSave(baseRow)
    if (result.success && itemsSyncCode && 'price' in body) {
      const newPrice = Number(body.price ?? 0)
      try {
        await supabaseUpdateByFilter('items', `code=eq.${encodeURIComponent(itemsSyncCode)}`, {
          price: newPrice,
        })
      } catch {
        /* items에 해당 code 없으면 무시 */
      }
    }
    if (result.success && hasStoreCodesPayload && !isPartialMenuEdit) {
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
    if (result.success && hasBanbanFlavorMenuIdsPayload && canSyncBanbanFlavorLinks && !isPartialMenuEdit) {
      const savedMenuId = String(result.newId || editingId || '').trim()
      if (!savedMenuId) {
        return {
          success: false,
          message: '메뉴 저장은 완료되었지만 반반 허용 맛을 저장하지 못했습니다. 다시 저장해 주세요.',
        }
      }
      try {
        const savedMenuRows = (await supabaseSelectFilter(
          'pos_menus',
          `id=eq.${encodeURIComponent(savedMenuId)}`,
          { limit: 1, select: 'id,is_banban' }
        )) as { id?: number | null; is_banban?: boolean | null }[] | null
        const savedMenu = savedMenuRows?.[0]
        const isBanbanMenuSaved = savedMenu?.is_banban === true
        if (!isBanbanMenuSaved && normalizedBanbanFlavorMenuIds.length > 0) {
          return {
            success: false,
            message: '반반 메뉴로 체크된 메뉴에만 반반 허용 맛을 지정할 수 있습니다.',
          }
        }
        if (normalizedBanbanFlavorMenuIds.length > 0) {
          const flavorFilter = `id=in.(${normalizedBanbanFlavorMenuIds.map((id) => encodeURIComponent(id)).join(',')})`
          const flavorRows = (await supabaseSelectFilter('pos_menus', flavorFilter, {
            limit: Math.max(100, normalizedBanbanFlavorMenuIds.length),
            select: 'id,is_banban',
          })) as { id?: number | null; is_banban?: boolean | null }[] | null
          const flavorRowMap = new Map<string, { id?: number | null; is_banban?: boolean | null }>()
          for (const row of flavorRows || []) {
            const id = String(row.id || '').trim()
            if (id) flavorRowMap.set(id, row)
          }
          for (const flavorMenuId of normalizedBanbanFlavorMenuIds) {
            if (flavorMenuId === savedMenuId) {
              return {
                success: false,
                message: '반반 메뉴 자기 자신은 반반 맛으로 지정할 수 없습니다.',
              }
            }
            const row = flavorRowMap.get(flavorMenuId)
            if (!row) {
              return {
                success: false,
                message: '존재하지 않는 메뉴가 반반 허용 맛에 포함되어 있습니다. 새로고침 후 다시 저장해 주세요.',
              }
            }
            if (row.is_banban === true) {
              return {
                success: false,
                message: '반반 메뉴는 다른 반반 메뉴를 맛으로 지정할 수 없습니다.',
              }
            }
          }
        }
        await supabaseDeleteByFilter(
          'pos_banban_flavor_links',
          `banban_menu_id=eq.${encodeURIComponent(savedMenuId)}`
        )
        if (isBanbanMenuSaved && normalizedBanbanFlavorMenuIds.length > 0) {
          await supabaseUpsert(
            'pos_banban_flavor_links',
            normalizedBanbanFlavorMenuIds.map((flavorMenuId, idx) => ({
              banban_menu_id: Number(savedMenuId),
              flavor_menu_id: Number(flavorMenuId),
              sort_order: idx,
              enabled: true,
            })),
            'banban_menu_id,flavor_menu_id'
          )
        }
      } catch (banbanErr: unknown) {
        console.error('upsertPosMenuFromBody banban flavor sync:', banbanErr)
        return {
          success: false,
          message: '메뉴 저장은 완료되었지만 반반 허용 맛 저장에 실패했습니다. DB 스키마를 확인해 주세요.',
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
        kitchenPrinterInBody ||
        cookingTimeInBody ||
        'isBanban' in body ||
        'buffetIncludable' in body ||
        hasDescriptionDefault ||
        hasDescriptionDelivery ||
        hasDescriptionTable ||
        'sellHall' in body ||
        'sellDelivery' in body ||
        'sellPackaging' in body ||
        'sellMember' in body) &&
      (err.includes('option_selection_groups') ||
        err.includes('option_selection_config') ||
        err.includes('kitchen_printer') ||
        err.includes('cooking_time_min') ||
        err.includes('is_banban') ||
        err.includes('buffet_includable') ||
        err.includes('description_default') ||
        err.includes('description_delivery') ||
        err.includes('description_table') ||
        err.includes('sell_hall') ||
        err.includes('sell_delivery') ||
        err.includes('sell_packaging') ||
        err.includes('sell_member') ||
        err.includes('42703'))
    ) {
      const rowWithout = { ...baseRow }
      delete rowWithout.option_selection_groups
      delete rowWithout.option_selection_config
      delete rowWithout.kitchen_printer
      delete rowWithout.cooking_time_min
      delete rowWithout.is_banban
      delete rowWithout.buffet_includable
      delete rowWithout.description_default
      delete rowWithout.description_delivery
      delete rowWithout.description_table
      delete rowWithout.sell_hall
      delete rowWithout.sell_delivery
      delete rowWithout.sell_packaging
      delete rowWithout.sell_member
      const result = await doSave(rowWithout)
      if (result.success && itemsSyncCode && 'price' in body) {
        const newPrice = Number(body.price ?? 0)
        try {
          await supabaseUpdateByFilter('items', `code=eq.${encodeURIComponent(itemsSyncCode)}`, {
            price: newPrice,
          })
        } catch {
          /* ignore */
        }
      }
      return result
    }
    if (/23505|duplicate key|unique constraint.*code|idx_pos_menus_code|ux_pos_menus.*code/i.test(err)) {
      return {
        success: false,
        message: '이미 존재하는 메뉴 코드입니다. 대분류를 다시 선택해 자동 코드를 받거나 다른 코드를 입력해 주세요.',
      }
    }
    throw saveErr
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdateByFilterWithPgrst204Fallback } from '@/lib/supabase-pgrst204-retry'
import {
  assertPosCatalogTenantWritable,
  appendPosCatalogTenantFilter,
  resolvePosCatalogTenantScope,
  rowBelongsToPosCatalogTenant,
} from '@/lib/pos-catalog-tenant-scope'
import { validatePosMenuImageUrlForMenu } from '@/lib/pos-menu-image-storage-path'
import {
  supabaseSelectFilter,
  supabaseUpsert,
} from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'

type MenuRow = {
  id?: number
  code?: string
  tenant_id?: string | null
}

type DeliveryPolicyRow = {
  app_code?: string
  menu_id?: number
}

const KNOWN_DELIVERY_APPS = ['grab', 'lineman', 'shopee'] as const

function toInt(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

/**
 * POS ↔ 배달 채널 이미지 동기화.
 * Omni: 동일 menu code 라도 다른 법인(tenant) 메뉴에는 절대 쓰지 않는다.
 * (과거 code 전량 fan-out 이 마루↔반주 사진 교차 오염 원인이었음)
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json()
    const storeCode = String(body?.storeCode ?? '').trim()
    const imageUrl = String(body?.imageUrl ?? '').trim()
    const requestedMenuCode = String(body?.menuCode ?? '').trim()
    const requestedMenuId = toInt(body?.menuId)

    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode_required' }, { status: 400, headers })
    }
    if (!imageUrl) {
      return NextResponse.json({ success: false, message: 'imageUrl_required' }, { status: 400, headers })
    }
    if (!requestedMenuCode && requestedMenuId <= 0) {
      return NextResponse.json(
        { success: false, message: 'menuCode_or_menuId_required' },
        { status: 400, headers }
      )
    }

    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const catalogScope = await resolvePosCatalogTenantScope({
      auth,
      storeCode,
    })
    const tenantBlock = assertPosCatalogTenantWritable(catalogScope)
    if (tenantBlock) {
      return NextResponse.json({ success: false, message: tenantBlock }, { status: 403, headers })
    }

    let resolvedMenuCode = requestedMenuCode
    let targetMenus: MenuRow[] = []

    if (requestedMenuId > 0) {
      const oneFilter = appendPosCatalogTenantFilter(`id=eq.${requestedMenuId}`, catalogScope)
      const one = (await supabaseSelectFilter('pos_menus', oneFilter, {
        limit: 1,
        select: 'id,code,tenant_id',
      })) as MenuRow[] | null
      const row = one?.[0]
      if (!row?.id || !rowBelongsToPosCatalogTenant(row, catalogScope)) {
        return NextResponse.json(
          { success: false, message: 'target_menu_not_found' },
          { status: 404, headers }
        )
      }
      resolvedMenuCode = resolvedMenuCode || String(row.code ?? '').trim()
      // menuId 가 있으면 그 행만 갱신 (code fan-out 금지 — Omni 교차 오염 방지)
      targetMenus = [row]
    } else if (resolvedMenuCode) {
      const codeFilter = appendPosCatalogTenantFilter(
        `code=eq.${encodeURIComponent(resolvedMenuCode)}`,
        catalogScope
      )
      targetMenus =
        ((await supabaseSelectFilter('pos_menus', codeFilter, {
          limit: 50,
          select: 'id,code,tenant_id',
        })) as MenuRow[] | null) || []
      targetMenus = targetMenus.filter((row) => rowBelongsToPosCatalogTenant(row, catalogScope))
    }

    const targetMenuIds = Array.from(
      new Set(targetMenus.map((row) => toInt(row.id)).filter((id) => id > 0))
    )
    if (targetMenuIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'target_menu_not_found' },
        { status: 404, headers }
      )
    }

    const skippedMismatchIds: number[] = []
    const nowIso = new Date().toISOString()
    for (const menuId of targetMenuIds) {
      const check = validatePosMenuImageUrlForMenu(imageUrl, menuId)
      if (!check.ok) {
        skippedMismatchIds.push(menuId)
        continue
      }
      // pos_menus.updated_at 은 일부 DB에만 있음 — 없으면 image 만 갱신(PGRST204 폴백)
      await supabaseUpdateByFilterWithPgrst204Fallback(
        'pos_menus',
        appendPosCatalogTenantFilter(`id=eq.${menuId}`, catalogScope),
        {
          image: imageUrl,
          updated_at: nowIso,
        },
        'syncPosMenuImageCrossChannels'
      )
    }

    const updatedMenuIds = targetMenuIds.filter((id) => !skippedMismatchIds.includes(id))
    if (updatedMenuIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            skippedMismatchIds.length > 0
              ? 'image_menu_id_mismatch'
              : 'target_menu_not_found',
          skippedMismatchIds,
        },
        { status: 400, headers }
      )
    }

    const deliveryPolicies =
      ((await supabaseSelectFilter(
        'pos_delivery_menu_policies',
        `store_code=eq.${encodeURIComponent(storeCode)}`,
        { limit: 10000, select: 'app_code,menu_id' }
      )) as DeliveryPolicyRow[] | null) || []

    const targetIdSet = new Set<number>(updatedMenuIds)
    const deliveryImageRows = deliveryPolicies
      .map((row) => {
        const menuId = toInt(row.menu_id)
        const appCodeRaw = String(row.app_code ?? '').trim().toLowerCase()
        const appCode = KNOWN_DELIVERY_APPS.includes(appCodeRaw as (typeof KNOWN_DELIVERY_APPS)[number])
          ? appCodeRaw
          : ''
        if (!appCode || !targetIdSet.has(menuId)) return null
        return {
          store_code: storeCode,
          app_code: appCode,
          menu_id: menuId,
          image_url: imageUrl,
          updated_at: nowIso,
        }
      })
      .filter(
        (
          row
        ): row is {
          store_code: string
          app_code: string
          menu_id: number
          image_url: string
          updated_at: string
        } => !!row
      )

    if (deliveryImageRows.length > 0) {
      await supabaseUpsert('pos_delivery_menu_images', deliveryImageRows, 'store_code,app_code,menu_id')
    }

    return NextResponse.json(
      {
        success: true,
        normalizedMenuCode: resolvedMenuCode || null,
        touchedMenuCount: updatedMenuIds.length,
        touchedDeliveryImageCount: deliveryImageRows.length,
        skippedMismatchIds,
      },
      { headers }
    )
  } catch (e) {
    console.error('syncPosMenuImageCrossChannels:', e)
    return NextResponse.json(
      { success: false, message: String(e ?? 'unknown_error') },
      { status: 500, headers }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { triggerGrabMenuNotificationPerStoreCodes } from '@/lib/grab-menu-sync-trigger'
import { canAccessPosOrder, isOfficeRole } from '@/lib/permissions'
import {
  loadStoreBanbanFlavorSoldOut,
  setStoreBanbanFlavorSoldOut,
} from '@/lib/pos-banban-flavor-store-sold-out-server'
import { normalizePosMenuSoldOutScope, type PosMenuSoldOutScope } from '@/lib/pos-menu-sold-out'
import { stripTenantPrefixedStoreCode } from '@/lib/pos-operating-store-code'
import { requireAuth } from '@/lib/verify-auth'

function resolveAuthorizedStoreCode(params: {
  requested: string
  authStore: string
  role: string
}): { storeCode: string } | { error: string; status: number } {
  const authStore = stripTenantPrefixedStoreCode(params.authStore)
  const requested = stripTenantPrefixedStoreCode(params.requested) || authStore
  if (!requested) {
    return { error: 'storeCode required', status: 400 }
  }
  if (!isOfficeRole(params.role) && authStore && requested.toLowerCase() !== authStore.toLowerCase()) {
    return { error: '다른 매장의 Banban 맛 품절은 변경할 수 없습니다.', status: 403 }
  }
  if (!isOfficeRole(params.role) && !authStore) {
    return { error: 'storeCode required', status: 400 }
  }
  return { storeCode: isOfficeRole(params.role) ? requested : authStore || requested }
}

/**
 * Banban(반반) 맛 전용 매장 품절 — 단품 치킨 품절과 분리.
 * GET  — 현재 품절 맵
 * POST — 토글 (scope store|all). 배달 범위 변경 시 Grab 메뉴 동기화 요청
 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store')

  try {
    const authResult = await requireAuth(req, 'any')
    if (authResult.errorResponse) return authResult.errorResponse
    const auth = authResult.auth!
    if (!canAccessPosOrder(auth.role || '')) {
      return NextResponse.json(
        { success: false, message: 'Banban 맛 품절 조회 권한이 없습니다.' },
        { status: 403, headers }
      )
    }

    const { searchParams } = new URL(req.url)
    const resolved = resolveAuthorizedStoreCode({
      requested: searchParams.get('storeCode') || searchParams.get('store_code') || '',
      authStore: auth.store || '',
      role: auth.role || '',
    })
    if ('error' in resolved) {
      return NextResponse.json(
        { success: false, message: resolved.error },
        { status: resolved.status, headers }
      )
    }
    const { storeCode } = resolved

    const load = await loadStoreBanbanFlavorSoldOut(storeCode, { channel: 'storefront' })
    if (!load.schemaReady) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Banban 맛 품절 테이블이 없습니다. SQL pos_banban_flavor_store_sold_out_01_create.sql 을 먼저 실행해 주세요.',
          code: 'banban_flavor_sold_out_schema_missing',
          schemaReady: false,
          items: [],
        },
        { status: 503, headers }
      )
    }

    const items = [...load.byMenuId.entries()].map(([flavorMenuId, soldOutDate]) => ({
      flavorMenuId: String(flavorMenuId),
      soldOut: true,
      soldOutDate,
      soldOutScope: load.scopeByMenuId.get(flavorMenuId) || 'store',
    }))

    return NextResponse.json(
      { success: true, schemaReady: true, storeCode, items },
      { headers }
    )
  } catch (e) {
    console.error('pos/banban-flavor-sold-out GET:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { status: 500, headers }
    )
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(req, 'any')
    if (authResult.errorResponse) return authResult.errorResponse
    const auth = authResult.auth!
    if (!canAccessPosOrder(auth.role || '')) {
      return NextResponse.json(
        { success: false, message: 'Banban 맛 품절 변경 권한이 없습니다.' },
        { status: 403, headers }
      )
    }

    const body = await req.json().catch(() => ({}))
    const resolved = resolveAuthorizedStoreCode({
      requested: body?.storeCode ?? body?.store_code ?? '',
      authStore: auth.store || '',
      role: auth.role || '',
    })
    if ('error' in resolved) {
      return NextResponse.json(
        { success: false, message: resolved.error },
        { status: resolved.status, headers }
      )
    }
    const { storeCode } = resolved
    const flavorMenuId = Math.floor(
      Number(body?.flavorMenuId ?? body?.flavor_menu_id ?? body?.menuId ?? body?.id ?? 0)
    )
    const soldOut = body?.soldOut === true
    const scope = normalizePosMenuSoldOutScope(body?.scope ?? 'store')

    if (!flavorMenuId) {
      return NextResponse.json(
        { success: false, message: 'flavorMenuId required' },
        { status: 400, headers }
      )
    }

    const before = await loadStoreBanbanFlavorSoldOut(storeCode, { channel: 'storefront' }).catch(
      () => ({
        byMenuId: new Map<number, string>(),
        scopeByMenuId: new Map<number, PosMenuSoldOutScope>(),
        soldOutMenuIds: new Set<string>(),
        schemaReady: true,
      })
    )
    const prevScope = before.byMenuId.has(flavorMenuId)
      ? before.scopeByMenuId.get(flavorMenuId) || 'all'
      : null

    const result = await setStoreBanbanFlavorSoldOut({
      storeCode,
      flavorMenuId,
      soldOut,
      scope,
    })

    if (!result.schemaReady) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Banban 맛 품절 테이블이 없습니다. SQL pos_banban_flavor_store_sold_out_01_create.sql 을 먼저 실행해 주세요.',
          code: 'banban_flavor_sold_out_schema_missing',
        },
        { status: 503, headers }
      )
    }

    const nextScope = result.soldOutScope
    const affectsDelivery =
      prevScope === 'all' || nextScope === 'all' || (soldOut && scope === 'all')
    let grabSync: {
      attempted: number
      sent: number
      failed: number
    } | null = null
    if (affectsDelivery) {
      try {
        grabSync = await triggerGrabMenuNotificationPerStoreCodes({
          reason: 'banban_flavor_sold_out',
          storeCodes: [storeCode],
          syncPromoTargetPriceCampaigns: false,
        })
      } catch (e) {
        console.error('pos/banban-flavor-sold-out grab sync:', e)
        grabSync = { attempted: 0, sent: 0, failed: 1 }
      }
    }

    return NextResponse.json(
      {
        success: true,
        storeCode,
        flavorMenuId: String(flavorMenuId),
        soldOutDate: result.soldOutDate,
        soldOutScope: result.soldOutScope,
        grabSyncRequested: !!affectsDelivery,
        grabSync,
      },
      { headers }
    )
  } catch (e) {
    console.error('pos/banban-flavor-sold-out POST:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { status: 500, headers }
    )
  }
}

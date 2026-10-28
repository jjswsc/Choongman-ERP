import { NextRequest, NextResponse } from 'next/server'
import { triggerGrabMenuNotificationPerStoreCodes } from '@/lib/grab-menu-sync-trigger'
import { canAccessPosOrder, isOfficeRole } from '@/lib/permissions'
import { stripTenantPrefixedStoreCode } from '@/lib/pos-operating-store-code'
import {
  OPTION_STEP_SOLD_OUT_PART_KEY,
  normalizeOptionStepKey,
  normalizeOptionStepValue,
  normalizePosMenuSoldOutScope,
  optionStepSoldOutKey,
  type PosMenuSoldOutScope,
} from '@/lib/pos-option-step-store-sold-out'
import {
  listDistinctOptionStepParts,
  loadStoreOptionStepSoldOut,
  setStoreOptionStepSoldOut,
} from '@/lib/pos-option-step-store-sold-out-server'
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
  // 매장 직원은 자기 매장만. 본사는 다른 매장 지정 가능.
  if (!isOfficeRole(params.role) && authStore && requested.toLowerCase() !== authStore.toLowerCase()) {
    return { error: '다른 매장의 옵션 품절은 변경할 수 없습니다.', status: 403 }
  }
  if (!isOfficeRole(params.role) && !authStore) {
    return { error: 'storeCode required', status: 400 }
  }
  return { storeCode: isOfficeRole(params.role) ? requested : authStore || requested }
}

/**
 * 매장별 옵션 단계(부위) 품절.
 * GET  — part 목록 + 현재 품절 상태
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
        { success: false, message: '옵션 품절 조회 권한이 없습니다.' },
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

    const [load, parts] = await Promise.all([
      loadStoreOptionStepSoldOut(storeCode, { channel: 'storefront' }),
      listDistinctOptionStepParts().catch(() => [] as string[]),
    ])

    if (!load.schemaReady) {
      return NextResponse.json(
        {
          success: false,
          message:
            '매장별 옵션 품절 테이블이 없습니다. SQL pos_option_step_store_sold_out_01_create.sql 을 먼저 실행해 주세요.',
          code: 'option_step_sold_out_schema_missing',
          schemaReady: false,
          items: [],
        },
        { status: 503, headers }
      )
    }

    const items = parts.map((stepValue) => {
      const key = optionStepSoldOutKey(OPTION_STEP_SOLD_OUT_PART_KEY, stepValue)
      const soldOutDate = load.byKey.get(key) || null
      return {
        stepKey: OPTION_STEP_SOLD_OUT_PART_KEY,
        stepValue,
        soldOut: !!soldOutDate,
        soldOutDate,
        soldOutScope: soldOutDate ? load.scopeByKey.get(key) || 'store' : null,
      }
    })

    return NextResponse.json(
      { success: true, schemaReady: true, storeCode, items },
      { headers }
    )
  } catch (e) {
    console.error('pos/option-step-sold-out GET:', e)
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
        { success: false, message: '옵션 품절 변경 권한이 없습니다.' },
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
    const stepKey = normalizeOptionStepKey(body?.stepKey ?? body?.step_key ?? OPTION_STEP_SOLD_OUT_PART_KEY)
    const stepValue = normalizeOptionStepValue(body?.stepValue ?? body?.step_value)
    const soldOut = body?.soldOut === true
    const scope = normalizePosMenuSoldOutScope(body?.scope ?? 'store')

    if (!stepValue) {
      return NextResponse.json(
        { success: false, message: 'stepValue required' },
        { status: 400, headers }
      )
    }

    const before = await loadStoreOptionStepSoldOut(storeCode, { channel: 'storefront' }).catch(() => ({
      byKey: new Map<string, string>(),
      scopeByKey: new Map<string, PosMenuSoldOutScope>(),
      soldOutKeys: new Set<string>(),
      schemaReady: true,
    }))
    const key = optionStepSoldOutKey(stepKey, stepValue)
    const prevScope = before.byKey.has(key) ? before.scopeByKey.get(key) || 'all' : null

    const result = await setStoreOptionStepSoldOut({
      storeCode,
      stepKey,
      stepValue,
      soldOut,
      scope,
    })

    if (!result.schemaReady) {
      return NextResponse.json(
        {
          success: false,
          message:
            '매장별 옵션 품절 테이블이 없습니다. SQL pos_option_step_store_sold_out_01_create.sql 을 먼저 실행해 주세요.',
          code: 'option_step_sold_out_schema_missing',
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
          reason: 'option_step_sold_out',
          storeCodes: [storeCode],
          syncPromoTargetPriceCampaigns: false,
        })
      } catch (e) {
        console.error('pos/option-step-sold-out grab sync:', e)
        grabSync = { attempted: 0, sent: 0, failed: 1 }
      }
    }

    return NextResponse.json(
      {
        success: true,
        storeCode,
        stepKey,
        stepValue,
        soldOutDate: result.soldOutDate,
        soldOutScope: result.soldOutScope,
        grabSyncRequested: !!affectsDelivery,
        grabSync,
      },
      { headers }
    )
  } catch (e) {
    console.error('pos/option-step-sold-out POST:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { status: 500, headers }
    )
  }
}

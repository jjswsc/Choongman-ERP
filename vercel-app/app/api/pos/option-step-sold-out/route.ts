import { NextRequest, NextResponse } from 'next/server'
import { canAccessPosOrder } from '@/lib/permissions'
import { stripTenantPrefixedStoreCode } from '@/lib/pos-operating-store-code'
import {
  OPTION_STEP_SOLD_OUT_PART_KEY,
  normalizeOptionStepKey,
  normalizeOptionStepValue,
  normalizePosMenuSoldOutScope,
  optionStepSoldOutKey,
} from '@/lib/pos-option-step-store-sold-out'
import {
  listDistinctOptionStepParts,
  loadStoreOptionStepSoldOut,
  setStoreOptionStepSoldOut,
} from '@/lib/pos-option-step-store-sold-out-server'
import { requireAuth } from '@/lib/verify-auth'

/**
 * 매장별 옵션 단계(부위) 품절.
 * GET  — part 목록 + 현재 품절 상태
 * POST — 토글 (scope 기본 store = หน้าร้าน만)
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
    const storeCode = stripTenantPrefixedStoreCode(
      searchParams.get('storeCode') || searchParams.get('store_code') || auth.store || ''
    )
    if (!storeCode) {
      return NextResponse.json(
        { success: false, message: 'storeCode required' },
        { status: 400, headers }
      )
    }

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
    const storeCode = stripTenantPrefixedStoreCode(
      body?.storeCode ?? body?.store_code ?? auth.store ?? ''
    )
    const stepKey = normalizeOptionStepKey(body?.stepKey ?? body?.step_key ?? OPTION_STEP_SOLD_OUT_PART_KEY)
    const stepValue = normalizeOptionStepValue(body?.stepValue ?? body?.step_value)
    const soldOut = body?.soldOut === true
    const scope = normalizePosMenuSoldOutScope(body?.scope ?? 'store')

    if (!storeCode || !stepValue) {
      return NextResponse.json(
        { success: false, message: 'storeCode and stepValue required' },
        { status: 400, headers }
      )
    }

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

    return NextResponse.json(
      {
        success: true,
        storeCode,
        stepKey,
        stepValue,
        soldOutDate: result.soldOutDate,
        soldOutScope: result.soldOutScope,
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

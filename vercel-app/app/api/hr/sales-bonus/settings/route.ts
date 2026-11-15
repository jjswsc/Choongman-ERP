import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { forbidUnlessAdminPayroll } from '@/lib/payroll-admin-gate'
import {
  loadAllStoreSalesBonusSettings,
  loadStoreSalesBonusSettings,
  saveStoreSalesBonusSettings,
  validateSalesBonusSettingsInput,
} from '@/lib/sales-bonus/load-store-settings-server'
import type { SalesBonusTier } from '@/lib/sales-bonus/types'

export const dynamic = 'force-dynamic'

function corsHeaders() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  return headers
}

/** GET ?store=CODE — 단건 / 없으면 전체 */
export async function GET(request: NextRequest) {
  const headers = corsHeaders()
  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    authRes.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authRes.errorResponse
  }
  const gate = forbidUnlessAdminPayroll(authRes.auth, headers)
  if (gate) return gate

  const store = String(new URL(request.url).searchParams.get('store') || '').trim()
  try {
    if (store) {
      const settings = await loadStoreSalesBonusSettings(store)
      return NextResponse.json({ success: true, settings }, { headers })
    }
    const list = await loadAllStoreSalesBonusSettings()
    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('hr/sales-bonus/settings GET:', msg)
    return NextResponse.json(
      { success: false, msg: '매출 보너스 설정을 불러오지 못했습니다.', detail: msg },
      { status: 500, headers }
    )
  }
}

/** POST — 매장 설정 저장 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders()
  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    authRes.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authRes.errorResponse
  }
  const gate = forbidUnlessAdminPayroll(authRes.auth, headers)
  if (gate) return gate

  try {
    const body = (await request.json()) as Record<string, unknown>
    const tiersRaw = Array.isArray(body.tiers) ? body.tiers : []
    const tiers: SalesBonusTier[] = tiersRaw.map((t) => {
      const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>
      return {
        threshold: Number(o.threshold) || 0,
        amount: Number(o.amount) || 0,
      }
    })
    const designeeRaw = body.doubleBonusEmployeeId ?? body.double_bonus_employee_id
    const designeeId =
      designeeRaw == null || designeeRaw === '' || designeeRaw === 0
        ? null
        : Math.floor(Number(designeeRaw))
    const input = {
      storeCode: String(body.storeCode || body.store || '').trim(),
      enabled: body.enabled === true || body.enabled === 'true' || body.enabled === 1,
      absencePenaltyPctPerDay: Number(body.absencePenaltyPctPerDay ?? body.absence_penalty_pct_per_day) || 0,
      managerMultiplier: Number(body.managerMultiplier ?? body.manager_multiplier) || 2,
      staffMultiplier: Number(body.staffMultiplier ?? body.staff_multiplier) || 1,
      doubleBonusEmployeeId:
        designeeId != null && Number.isFinite(designeeId) && designeeId > 0 ? designeeId : null,
      payoutDay: Number(body.payoutDay ?? body.payout_day) || 5,
      tiers,
    }
    const checked = validateSalesBonusSettingsInput(input)
    if (!checked.ok) {
      return NextResponse.json({ success: false, msg: checked.msg }, { status: 400, headers })
    }
    const settings = await saveStoreSalesBonusSettings(checked.value)
    return NextResponse.json({ success: true, settings }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('hr/sales-bonus/settings POST:', msg)
    return NextResponse.json(
      { success: false, msg: '매출 보너스 설정 저장에 실패했습니다.', detail: msg },
      { status: 500, headers }
    )
  }
}

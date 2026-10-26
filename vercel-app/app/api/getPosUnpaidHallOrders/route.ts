import { NextRequest, NextResponse } from 'next/server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'
import { resolveSaasTenantScope } from '@/lib/saas-tenant-scope'
import { listUnpaidHallOrdersForStore } from '@/lib/pos-unpaid-hall-guard-server'

export const dynamic = 'force-dynamic'

/** 결산 마감 전 미결제 홀 목록 — 해당 결산(영업)일에 오픈된 건만 */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
    const storeCode = String(body.storeCode ?? '').trim()
    const settleDate = String(body.settleDate ?? body.businessDate ?? '').trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settleDate)) {
      return NextResponse.json({ success: false, message: 'settleDate_required' }, { headers })
    }
    const authGate = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!authGate.ok) return authGate.response
    const tenantScope = await resolveSaasTenantScope({
      auth: authGate.auth
        ? { tenantId: authGate.auth.tenantId, company: authGate.auth.company }
        : null,
      storeCode,
    })
    const orders = await listUnpaidHallOrdersForStore({ storeCode, settleDate, tenantScope })
    return NextResponse.json(
      {
        success: true,
        count: orders.length,
        totalAmt: orders.reduce((s, o) => s + o.total, 0),
        orders,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosUnpaidHallOrders:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { headers }
    )
  }
}

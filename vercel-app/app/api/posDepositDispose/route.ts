import { NextRequest, NextResponse } from 'next/server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'
import { disposePosDepositHeld } from '@/lib/pos-deposit-server'
import { shouldRunPosAccountingSideEffectsForStore } from '@/lib/saas/pos-completion-side-effects-gate'
import { resolveSaasTenantScope } from '@/lib/saas-tenant-scope'

export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
    const storeCode = String(body.storeCode ?? body.store_code ?? '').trim()
    const authGate = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!authGate.ok) return authGate.response
    const auth = authGate.auth

    const dispositionRaw = String(body.disposition ?? '').trim().toLowerCase()
    if (dispositionRaw !== 'refund' && dispositionRaw !== 'forfeit') {
      return NextResponse.json({ success: false, message: 'deposit_disposition_required' }, { headers })
    }
    const memberId = Math.trunc(Number(body.memberId ?? body.member_id ?? 0) || 0) || null
    const guestPhone = String(body.guestPhone ?? body.guest_phone ?? body.phone ?? '').trim()

    const tenantScope = await resolveSaasTenantScope({
      auth: { tenantId: auth.tenantId, company: auth.company },
      storeCode,
    })
    const allowAccounting = await shouldRunPosAccountingSideEffectsForStore(storeCode)
    const result = await disposePosDepositHeld({
      storeCode,
      disposition: dispositionRaw,
      memberId,
      guestPhone,
      createdBy: String(auth.name || '').trim(),
      tenantId: tenantScope.enforce ? tenantScope.tenantId : auth.tenantId,
      allowAccounting,
    })
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { headers })
    }

    return NextResponse.json(
      {
        success: true,
        ledgerId: result.ledgerId,
        amount: result.amount,
        remaining: result.remaining,
      },
      { headers }
    )
  } catch (e) {
    console.error('posDepositDispose:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'deposit_dispose_failed' },
      { headers }
    )
  }
}

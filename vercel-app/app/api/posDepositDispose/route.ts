import { NextRequest, NextResponse } from 'next/server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'
import { coercePosDepositTender } from '@/lib/pos-deposit-domain'
import {
  insertPosDepositLedgerRow,
  loadPosDepositLedgerForHolder,
  loadPosDepositHeldAmount,
  postPosDepositForfeitJournal,
  postPosDepositRefundJournal,
} from '@/lib/pos-deposit-server'
import { shouldRunPosAccountingSideEffectsForStore } from '@/lib/saas/pos-completion-side-effects-gate'
import { resolveSaasTenantScope } from '@/lib/saas-tenant-scope'
import { posDepositBalanceFromLedger } from '@/lib/pos-deposit-domain'

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

    const disposition = String(body.disposition ?? '').trim().toLowerCase()
    if (disposition !== 'refund' && disposition !== 'forfeit') {
      return NextResponse.json({ success: false, message: 'deposit_disposition_required' }, { headers })
    }
    const memberId = Math.trunc(Number(body.memberId ?? body.member_id ?? 0) || 0) || null
    const guestPhone = String(body.guestPhone ?? body.guest_phone ?? body.phone ?? '').trim()
    if (!memberId && !guestPhone) {
      return NextResponse.json({ success: false, message: 'phone_or_member_required' }, { headers })
    }

    const holder = { storeCode, memberId, guestPhone }
    const held = await loadPosDepositHeldAmount(holder)
    if (held <= 0.005) {
      return NextResponse.json({ success: false, message: 'deposit_nothing_held' }, { headers })
    }
    const rows = await loadPosDepositLedgerForHolder(holder)
    const lastReceive = [...rows].reverse().find((r) => String(r.kind ?? '') === 'receive')
    const tender = coercePosDepositTender(lastReceive?.tender)
    const guestName = String(lastReceive?.guest_name ?? '').trim()

    const tenantScope = await resolveSaasTenantScope({
      auth: { tenantId: auth.tenantId, company: auth.company },
      storeCode,
    })
    const createdBy = String(auth.name || '').trim()
    const ledgerId = await insertPosDepositLedgerRow({
      tenantId: tenantScope.enforce ? tenantScope.tenantId : auth.tenantId,
      storeCode,
      memberId,
      guestPhone,
      guestName,
      kind: disposition === 'refund' ? 'refund' : 'forfeit',
      amount: held,
      tender,
      memo: disposition === 'refund' ? 'hold_refund' : 'hold_forfeit',
      createdBy,
    })
    if (ledgerId <= 0) {
      return NextResponse.json({ success: false, message: 'deposit_ledger_failed' }, { headers })
    }

    try {
      const allowAccounting = await shouldRunPosAccountingSideEffectsForStore(storeCode)
      if (allowAccounting) {
        if (disposition === 'refund') {
          await postPosDepositRefundJournal({
            ledgerId,
            storeCode,
            amount: held,
            tender,
            createdAtIso: new Date().toISOString(),
          })
        } else {
          await postPosDepositForfeitJournal({
            ledgerId,
            storeCode,
            amount: held,
            createdAtIso: new Date().toISOString(),
          })
        }
      }
    } catch (journalErr) {
      console.error('posDepositDispose journal:', journalErr)
    }

    return NextResponse.json(
      {
        success: true,
        ledgerId,
        amount: held,
        remaining: posDepositBalanceFromLedger([
          ...rows,
          { kind: disposition === 'refund' ? 'refund' : 'forfeit', amount: held },
        ]),
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

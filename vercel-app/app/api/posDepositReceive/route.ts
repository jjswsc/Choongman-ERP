import { NextRequest, NextResponse } from 'next/server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'
import { parsePosDepositReceiveFromBody } from '@/lib/pos-deposit-domain'
import {
  insertPosDepositLedgerRow,
  postPosDepositReceiveJournal,
} from '@/lib/pos-deposit-server'
import { shouldRunPosAccountingSideEffectsForStore } from '@/lib/saas/pos-completion-side-effects-gate'
import { resolveSaasTenantScope } from '@/lib/saas-tenant-scope'
import { supabaseSelectFilterStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'

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

    const parsed = parsePosDepositReceiveFromBody(body)
    if (!parsed.ok) {
      return NextResponse.json({ success: false, message: parsed.message }, { headers })
    }
    const value = parsed.value

    let guestPhone = value.guestPhone
    let guestName = value.guestName
    if (value.memberId) {
      try {
        const members = (await supabaseSelectFilterStrippingUnknownColumns(
          'members',
          `id=eq.${value.memberId}`,
          { select: 'id,name,full_name,phone', limit: 1 },
          'posDepositReceive/member'
        )) as { id?: number; name?: string; full_name?: string; phone?: string }[] | null
        const member = members?.[0]
        if (!member?.id) {
          return NextResponse.json({ success: false, message: 'member_not_found' }, { headers })
        }
        if (!guestPhone) guestPhone = String(member.phone ?? '').trim()
        if (!guestName) guestName = String(member.full_name || member.name || '').trim()
      } catch (memberErr) {
        console.error('posDepositReceive member lookup:', memberErr)
        return NextResponse.json({ success: false, message: 'member_not_found' }, { headers })
      }
    }

    const tenantScope = await resolveSaasTenantScope({
      auth: { tenantId: auth.tenantId, company: auth.company },
      storeCode,
    })
    const createdBy = String(auth.name || body.createdBy || '').trim()
    const ledgerId = await insertPosDepositLedgerRow({
      tenantId: tenantScope.enforce ? tenantScope.tenantId : auth.tenantId,
      storeCode,
      memberId: value.memberId,
      guestPhone,
      guestName,
      kind: 'receive',
      amount: value.depositAmt,
      tender: value.depositTender,
      memo: 'hold_receive',
      createdBy,
    })
    if (ledgerId <= 0) {
      return NextResponse.json({ success: false, message: 'deposit_ledger_failed' }, { headers })
    }

    try {
      const allowAccounting = await shouldRunPosAccountingSideEffectsForStore(storeCode)
      if (allowAccounting) {
        await postPosDepositReceiveJournal({
          ledgerId,
          storeCode,
          amount: value.depositAmt,
          tender: value.depositTender,
          createdAtIso: new Date().toISOString(),
        })
      }
    } catch (journalErr) {
      console.error('posDepositReceive journal:', journalErr)
    }

    return NextResponse.json(
      {
        success: true,
        ledgerId,
        amount: value.depositAmt,
        memberId: value.memberId || undefined,
        guestPhone,
        guestName,
      },
      { headers }
    )
  } catch (e) {
    console.error('posDepositReceive:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'deposit_receive_failed' },
      { headers }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { BankSettlementGuardError } from '@/lib/bank-settlement-guards'
import { saveChannelSettlement } from '@/lib/pos-channel-settlement-process'
import { normalizePosChannelSettlementChannel } from '@/lib/pos-channel-settlement'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  try {
    const body = await req.json().catch(() => ({}))
    const channel = normalizePosChannelSettlementChannel(body.channel)
    if (!channel) {
      return NextResponse.json({ success: false, message: 'INVALID_PARAMS' }, { status: 400, headers })
    }
    const feeRaw = body.fee ?? body.feeAmt ?? body.fee_amt
    const out = await saveChannelSettlement({
      storeCode: String(body.storeCode ?? body.store_code ?? '').trim(),
      settleDate: String(body.settleDate ?? body.settle_date ?? '').slice(0, 10),
      channel,
      gross: Number(body.gross ?? 0),
      net: Number(body.net ?? 0),
      fee: feeRaw != null && feeRaw !== '' ? Number(feeRaw) : undefined,
      memo: String(body.memo ?? '').trim() || null,
      feeSource: String(body.feeSource ?? body.fee_source ?? '').trim() || null,
      bankTransactionId:
        body.bankTransactionId != null ? Math.floor(Number(body.bankTransactionId)) : null,
      repost: Boolean(body.repost),
      postedBy: String(auth.name || auth.employeeCode || '').trim() || null,
    })

    if (!out.ok) {
      const status =
        out.code === 'ALREADY_POSTED' || out.code === 'BANK_ALREADY_LINKED_SETTLEMENT'
          ? 409
          : out.code === 'BANK_RECEIVABLE_RECEIVE_CONFLICT' ||
              out.code === 'BANK_NOT_DEPOSIT' ||
              out.code === 'BANK_LINKED_TO_CHANNEL_SETTLEMENT'
            ? 409
          : out.code === 'INVALID_PARAMS' || out.code === 'INVALID_AMOUNTS' || out.code === 'GROSS_FEE_NET_MISMATCH'
            ? 400
            : 500
      return NextResponse.json(
        {
          success: false,
          message: out.message || out.code,
          code: out.code,
          settlementId: out.settlementId,
        },
        { status, headers }
      )
    }

    return NextResponse.json(
      {
        success: true,
        settlementId: out.settlementId,
        journalEntryId: out.journalEntryId,
        alreadyPosted: out.alreadyPosted,
        gross: out.gross,
        fee: out.fee,
        net: out.net,
      },
      { headers }
    )
  } catch (e) {
    if (e instanceof BankSettlementGuardError) {
      return NextResponse.json(
        { success: false, message: e.message, code: e.code },
        { status: 409, headers }
      )
    }
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'ACCOUNTING_PERIOD_CLOSED') {
      return NextResponse.json({ success: false, message: msg }, { status: 403, headers })
    }
    console.error('savePosChannelSettlement:', e)
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { saveChannelSettlement } from '@/lib/pos-channel-settlement-process'
import { normalizePosChannelSettlementChannel } from '@/lib/pos-channel-settlement'
import { requireAuth } from '@/lib/verify-auth'

const MAX_ROWS = 60

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const postedBy = String(auth.name || auth.employeeCode || '').trim() || null

  try {
    const body = await req.json().catch(() => ({}))
    const repost = Boolean(body.repost)
    const rawRows = Array.isArray(body.rows) ? body.rows : []
    if (!rawRows.length) {
      return NextResponse.json({ success: false, message: 'EMPTY_ROWS' }, { status: 400, headers })
    }
    if (rawRows.length > MAX_ROWS) {
      return NextResponse.json({ success: false, message: 'TOO_MANY_ROWS' }, { status: 400, headers })
    }

    const results: {
      index: number
      ok: boolean
      code?: string
      settlementId?: number
      journalEntryId?: number | null
      channel?: string
      settleDate?: string
    }[] = []

    let okCount = 0
    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i] as Record<string, unknown>
      const channel = normalizePosChannelSettlementChannel(r.channel)
      if (!channel || channel === 'delivery_all') {
        results.push({ index: i, ok: false, code: 'INVALID_CHANNEL' })
        continue
      }
      const out = await saveChannelSettlement({
        storeCode: String(r.storeCode ?? r.store_code ?? '').trim(),
        settleDate: String(r.settleDate ?? r.settle_date ?? '').slice(0, 10),
        channel,
        gross: Number(r.gross ?? 0),
        net: Number(r.net ?? 0),
        fee: r.fee != null ? Number(r.fee) : undefined,
        memo: String(r.memo ?? 'CSV import').trim() || null,
        feeSource: String(r.feeSource ?? r.fee_source ?? 'csv_import').trim() || 'csv_import',
        repost,
        postedBy,
      })
      if (out.ok) {
        okCount++
        results.push({
          index: i,
          ok: true,
          settlementId: out.settlementId,
          journalEntryId: out.journalEntryId,
          channel,
          settleDate: String(r.settleDate ?? r.settle_date ?? '').slice(0, 10),
        })
      } else {
        results.push({
          index: i,
          ok: false,
          code: out.code,
          settlementId: out.settlementId,
          channel,
          settleDate: String(r.settleDate ?? r.settle_date ?? '').slice(0, 10),
        })
      }
    }

    return NextResponse.json(
      {
        success: okCount > 0,
        processed: okCount,
        failed: rawRows.length - okCount,
        results,
      },
      { headers }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'ACCOUNTING_PERIOD_CLOSED') {
      return NextResponse.json({ success: false, message: msg }, { status: 403, headers })
    }
    console.error('importPosChannelSettlements:', e)
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type WebhookEventRow = {
  id?: number
  event_kind?: string
  request_id?: string | null
  job_id?: string | null
  merchant_id?: string | null
  partner_merchant_id?: string | null
  payload_json?: unknown
  received_at?: string | null
}

/**
 * Grab → 파트너 `menu-sync-state` 웹훅 기록 조회.
 * Grab이 우리 메뉴를 pull·검증한 결과(SUCCESS/FAILED + 사유)를 그대로 본다.
 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const url = new URL(req.url)
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || '15')))
    const merchantFilter = String(url.searchParams.get('merchantID') || '').trim().toLowerCase()

    let rows: WebhookEventRow[] | null = null
    try {
      rows = (await supabaseSelectFilter(
        'pos_grab_webhook_events',
        'event_kind=eq.menu_sync_state',
        {
          limit,
          order: 'received_at.desc',
          select: 'id,event_kind,request_id,job_id,merchant_id,partner_merchant_id,payload_json,received_at',
        }
      )) as WebhookEventRow[] | null
    } catch (e) {
      return NextResponse.json(
        { success: false, message: `query_failed: ${String(e)}` },
        { status: 500, headers }
      )
    }

    let events = (rows || []).map((r) => {
      const payload = (r.payload_json || {}) as Record<string, unknown>
      return {
        id: r.id,
        receivedAt: r.received_at,
        merchantID: r.merchant_id,
        partnerMerchantID: r.partner_merchant_id,
        status: payload.status ?? null,
        errorMessage: payload.errorMessage ?? payload.error ?? payload.message ?? null,
        payload,
      }
    })
    if (merchantFilter) {
      events = events.filter(
        (e) => String(e.merchantID ?? '').trim().toLowerCase() === merchantFilter
      )
    }

    return NextResponse.json(
      {
        success: true,
        count: events.length,
        merchantFilter: merchantFilter || null,
        latestStatus: events[0]?.status ?? null,
        events,
      },
      { headers }
    )
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

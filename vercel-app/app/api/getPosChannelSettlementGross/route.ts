import { NextRequest, NextResponse } from 'next/server'
import { fetchChannelGrossCoveringNet } from '@/lib/pos-channel-cover-gross-server'
import { fetchPosChannelSettlementGross } from '@/lib/pos-channel-settlement-gross-server'
import { normalizePosChannelSettlementChannel } from '@/lib/pos-channel-settlement'
import {
  deliveryAppCodeForSettlementChannel,
  fetchDeliveryPlatformSettlementFeePct,
  suggestedPlatformSettlementFee,
} from '@/lib/pos-delivery-platform-settlement'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  try {
    const { searchParams } = new URL(request.url)
    const storeCode = String(searchParams.get('storeCode') || searchParams.get('store_code') || '').trim()
    const settleDate = String(searchParams.get('settleDate') || searchParams.get('settle_date') || '').slice(0, 10)
    const channel = normalizePosChannelSettlementChannel(searchParams.get('channel'))
    if (!storeCode || !/^\d{4}-\d{2}-\d{2}$/.test(settleDate) || !channel) {
      return NextResponse.json(
        { success: false, message: 'INVALID_PARAMS' },
        { status: 400, headers }
      )
    }

    const netRaw = Number(searchParams.get('net') || 0)
    const net = Number.isFinite(netRaw) && netRaw > 0 ? netRaw : 0

    const grossRow =
      net > 0
        ? await fetchChannelGrossCoveringNet({ storeCode, settleDate, channel, net })
        : { ...(await fetchPosChannelSettlementGross({ storeCode, settleDate, channel })), coverDates: [settleDate], expanded: false, partial: false }

    const appCode = deliveryAppCodeForSettlementChannel(channel)
    let platformFeePct: number | null = null
    let platformFeePctSource: 'policy' | 'default' | null = null
    if (appCode) {
      const rate = await fetchDeliveryPlatformSettlementFeePct({ storeCode, appCode })
      platformFeePct = rate.pct
      platformFeePctSource = rate.source
    }

    const suggestedFee =
      appCode && platformFeePct != null
        ? suggestedPlatformSettlementFee({
            channel,
            gross: grossRow.gross,
            feePct: platformFeePct,
          })
        : null

    return NextResponse.json(
      {
        success: true,
        storeCode,
        settleDate,
        channel,
        gross: grossRow.gross,
        orderCount: grossRow.orderCount,
        cardFeeTotal: grossRow.cardFeeTotal,
        coverDates: grossRow.coverDates,
        expanded: grossRow.expanded,
        partial: Boolean(grossRow.partial),
        suggestedFee,
        suggestedFeeSource:
          suggestedFee != null && platformFeePctSource ? `platform_${platformFeePctSource}` : null,
        platformFeePct,
        platformAppCode: appCode,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosChannelSettlementGross:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

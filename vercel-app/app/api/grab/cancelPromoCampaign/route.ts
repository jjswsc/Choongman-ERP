import { NextRequest, NextResponse } from 'next/server'
import { grabUpdateMenuNotification } from '@/lib/grab-partner-api'
import { deleteGrabManagedPromoCampaign } from '@/lib/grab-promo-target-price-campaign'

export const dynamic = 'force-dynamic'

/**
 * Grab Partner Campaign 1건 취소(DELETE).
 * 새 프로모가 안 바뀌면 예전 캠페인을 먼저 지운 뒤 메뉴 알림을 보내야 한다.
 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as { merchantID?: string; campaignId?: string }
    const merchantID = String(body.merchantID ?? '').trim()
    const campaignId = String(body.campaignId ?? '').trim()
    if (!merchantID || !campaignId) {
      return NextResponse.json(
        { success: false, message: 'merchantID_and_campaignId_required' },
        { status: 400, headers }
      )
    }
    const deleted = await deleteGrabManagedPromoCampaign({ merchantID, campaignId })
    if (!deleted.ok) {
      const status = deleted.message === 'campaign_not_found' ? 404 : 400
      return NextResponse.json({ success: false, message: deleted.message }, { status, headers })
    }
    let menuNotified = false
    try {
      await grabUpdateMenuNotification(merchantID)
      menuNotified = true
    } catch (e) {
      console.warn('[cancelPromoCampaign] menu_notify_failed', { merchantID, error: String(e) })
    }
    return NextResponse.json(
      { success: true, name: deleted.name, menuNotified },
      { headers }
    )
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

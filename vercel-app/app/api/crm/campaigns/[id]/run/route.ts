import { NextRequest, NextResponse } from 'next/server'
import { runCrmCouponCampaign } from '@/lib/crm-coupon-campaign-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const path = await params
    const campaignId = Number(path.id || 0)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const result = await runCrmCouponCampaign({
      campaignId,
      runMode:
        String(body.runMode || '').trim() === 'auto'
          ? 'auto'
          : String(body.runMode || '').trim() === 'retry'
            ? 'retry'
            : 'manual',
      reason: String(body.reason || ''),
      actor: String(authRes.auth?.name || ''),
    })
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : '캠페인 실행 중 오류가 발생했습니다.'
    return NextResponse.json({ success: false, message })
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { getCrmCouponCampaignResults } from '@/lib/crm-coupon-campaign-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const path = await params
    const { searchParams } = new URL(req.url)
    const limit = Number(searchParams.get('limit') || 20)
    const result = await getCrmCouponCampaignResults(Number(path.id || 0), limit)
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : '캠페인 결과 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ success: false, message, campaign: null, runs: [] })
  }
}


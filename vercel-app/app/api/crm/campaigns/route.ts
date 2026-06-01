import { NextRequest, NextResponse } from 'next/server'
import {
  listCrmCouponCampaigns,
  saveCrmCouponCampaign,
} from '@/lib/crm-coupon-campaign-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const { searchParams } = new URL(req.url)
    const limit = Number(searchParams.get('limit') || 200)
    const rows = await listCrmCouponCampaigns(limit)
    return NextResponse.json({ success: true, rows })
  } catch (e) {
    const message = e instanceof Error ? e.message : '캠페인 목록 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ success: false, message, rows: [] })
  }
}

export async function POST(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as Record<string, unknown>
    const saved = await saveCrmCouponCampaign({
      id: Number(body.id || 0) || undefined,
      name: String(body.name || ''),
      description: String(body.description || ''),
      status: String(body.status || ''),
      triggerType: String(body.triggerType || ''),
      audienceType: String(body.audienceType || ''),
      audiencePayload:
        body.audiencePayload && typeof body.audiencePayload === 'object'
          ? (body.audiencePayload as Record<string, unknown>)
          : {},
      couponCode: String(body.couponCode || ''),
      issueLimit: Number(body.issueLimit || 0) || undefined,
      startsAt: String(body.startsAt || ''),
      endsAt: String(body.endsAt || ''),
      autoSchedule:
        body.autoSchedule && typeof body.autoSchedule === 'object'
          ? (body.autoSchedule as Record<string, unknown>)
          : {},
      actor: String(authRes.auth?.name || ''),
    })
    return NextResponse.json({ success: true, id: saved.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : '캠페인 저장 중 오류가 발생했습니다.'
    return NextResponse.json({ success: false, message })
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { previewCampaignAudience } from '@/lib/crm-coupon-campaign-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as {
      audienceType?: string
      audiencePayload?: Record<string, unknown>
      issueLimit?: number
    }
    const preview = await previewCampaignAudience(body)
    return NextResponse.json({ success: true, ...preview })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'preview failed', count: 0, capped: 0 },
      { status: 400 }
    )
  }
}

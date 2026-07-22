import { NextRequest, NextResponse } from 'next/server'
import {
  listMemberCouponPromoCodes,
  saveMemberCouponPromoCode,
} from '@/lib/member-portal-promo-code'
import { resolveMembersTenantScope } from '@/lib/members-tenant-scope'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const tenantScope = await resolveMembersTenantScope({ auth: authRes.auth })
    const limit = Number(new URL(req.url).searchParams.get('limit') || 200)
    const rows = await listMemberCouponPromoCodes(tenantScope, limit)
    return NextResponse.json({ success: true, rows })
  } catch (e) {
    const message = e instanceof Error ? e.message : '프로모 코드 목록 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ success: false, message, rows: [] })
  }
}

export async function POST(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const tenantScope = await resolveMembersTenantScope({ auth: authRes.auth })
    const body = (await req.json()) as Record<string, unknown>
    const maxRaw = body.maxRedemptions ?? body.max_redemptions
    const maxRedemptions =
      maxRaw === null || maxRaw === undefined || maxRaw === ''
        ? null
        : Number(maxRaw)
    const saved = await saveMemberCouponPromoCode({
      tenantScope,
      id: Number(body.id || 0) || undefined,
      code: String(body.code || ''),
      couponCode: String(body.couponCode || body.coupon_code || ''),
      label: String(body.label || ''),
      note: String(body.note || ''),
      isActive: body.isActive !== false && body.is_active !== false,
      validFrom: String(body.validFrom || body.valid_from || ''),
      validTo: String(body.validTo || body.valid_to || ''),
      maxRedemptions,
      maxPerMember: Number(body.maxPerMember || body.max_per_member || 1),
    })
    return NextResponse.json({ success: true, id: saved.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : '프로모 코드 저장 중 오류가 발생했습니다.'
    return NextResponse.json({ success: false, message })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import {
  deleteMemberCouponPromoCode,
  saveMemberCouponPromoCode,
  setMemberCouponPromoCodeActive,
} from '@/lib/member-portal-promo-code'
import { resolveMembersTenantScope } from '@/lib/members-tenant-scope'
import { requireAuth } from '@/lib/verify-auth'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const tenantScope = await resolveMembersTenantScope({ auth: authRes.auth })
    const id = Number((await ctx.params).id || 0)
    if (!id) {
      return NextResponse.json({ success: false, message: '유효한 id가 필요합니다.' }, { status: 400 })
    }
    const body = (await req.json()) as Record<string, unknown>

    if ('isActive' in body || 'is_active' in body) {
      const isActive = body.isActive !== false && body.is_active !== false
      const onlyToggle =
        Object.keys(body).every((k) =>
          ['isActive', 'is_active'].includes(k)
        )
      if (onlyToggle) {
        await setMemberCouponPromoCodeActive({ tenantScope, id, isActive })
        return NextResponse.json({ success: true, id })
      }
    }

    const maxRaw = body.maxRedemptions ?? body.max_redemptions
    const maxRedemptions =
      maxRaw === null || maxRaw === undefined || maxRaw === ''
        ? null
        : Number(maxRaw)
    await saveMemberCouponPromoCode({
      tenantScope,
      id,
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
    return NextResponse.json({ success: true, id })
  } catch (e) {
    const message = e instanceof Error ? e.message : '프로모 코드 수정 중 오류가 발생했습니다.'
    return NextResponse.json({ success: false, message })
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const tenantScope = await resolveMembersTenantScope({ auth: authRes.auth })
    const id = Number((await ctx.params).id || 0)
    if (!id) {
      return NextResponse.json({ success: false, message: '유효한 id가 필요합니다.' }, { status: 400 })
    }
    await deleteMemberCouponPromoCode({ tenantScope, id })
    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : '프로모 코드 삭제 중 오류가 발생했습니다.'
    return NextResponse.json({ success: false, message })
  }
}

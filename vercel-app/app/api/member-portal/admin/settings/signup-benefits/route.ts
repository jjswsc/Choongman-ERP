import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { MEMBER_PORTAL_SIGNUP_WELCOME_COUPON_KEY } from '@/lib/member-portal-signup-welcome-coupon'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

function normalizeCouponCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
}

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${MEMBER_PORTAL_SIGNUP_WELCOME_COUPON_KEY}`, {
      limit: 1,
      select: 'value_json',
    })) as { value_json?: unknown }[]
    return NextResponse.json({
      success: true,
      welcomeCouponCode: String(rows?.[0]?.value_json || '').trim(),
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as { welcomeCouponCode?: string }
    const welcomeCouponCode = normalizeCouponCode(body.welcomeCouponCode)
    await supabaseUpsert(
      'system_settings',
      [
        {
          key: MEMBER_PORTAL_SIGNUP_WELCOME_COUPON_KEY,
          value_json: welcomeCouponCode,
          updated_at: getBangkokDateTimeString(),
        },
      ],
      'key'
    )
    return NextResponse.json({ success: true, welcomeCouponCode })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정을 저장하지 못했습니다.' },
      { status: 500 }
    )
  }
}

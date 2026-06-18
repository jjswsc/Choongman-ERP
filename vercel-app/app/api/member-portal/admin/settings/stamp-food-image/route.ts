import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  MEMBER_PORTAL_STAMP_FOOD_IMAGE_KEY,
  normalizeMemberPortalStampFoodImageUrl,
} from '@/lib/member-portal-stamp-food-image'
import { loadMemberPortalStampFoodImageUrl } from '@/lib/member-portal-stamp-food-image-server'
import { supabaseUpsert } from '@/lib/supabase-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const imageUrl = await loadMemberPortalStampFoodImageUrl()
    return NextResponse.json({ success: true, imageUrl })
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
    const body = (await req.json()) as { imageUrl?: unknown }
    const imageUrl = normalizeMemberPortalStampFoodImageUrl(body.imageUrl)
    await supabaseUpsert(
      'system_settings',
      [
        {
          key: MEMBER_PORTAL_STAMP_FOOD_IMAGE_KEY,
          value_json: imageUrl,
          updated_at: getBangkokDateTimeString(),
        },
      ],
      'key'
    )
    return NextResponse.json({ success: true, imageUrl })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정을 저장하지 못했습니다.' },
      { status: 500 }
    )
  }
}

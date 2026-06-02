import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  isMemberPortalContentVisibleNow,
  isMemberPortalHomePromoItem,
  mapMemberPortalContentRow,
  type MemberPortalContentRow,
} from '@/lib/member-portal-content'
import { requireMemberSession } from '@/lib/member-portal-session'
import { supabaseSelect } from '@/lib/supabase-server'

function isMissingContentTableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e || '')
  return /42p01|relation .*member_portal_content.* does not exist/i.test(msg)
}

export async function GET(req: NextRequest) {
  const { error } = await requireMemberSession(req)
  if (error) return error
  try {
    const rows = (await supabaseSelect('member_portal_content', {
      order: 'sort_order.asc,updated_at.desc,id.desc',
      limit: 1000,
    })) as MemberPortalContentRow[]
    const now = getBangkokDateTimeString()
    const mapped = rows.map(mapMemberPortalContentRow)
    const items = mapped.filter(
      (x) => isMemberPortalHomePromoItem(x) || isMemberPortalContentVisibleNow(x, now)
    )
    return NextResponse.json({ success: true, items })
  } catch (e) {
    if (isMissingContentTableError(e)) {
      return NextResponse.json({ success: true, items: [] })
    }
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '콘텐츠를 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}


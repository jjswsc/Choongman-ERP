import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { mapMemberPortalContentRow, type MemberPortalContentRow } from '@/lib/member-portal-content'
import { supabaseDeleteByFilter, supabaseSelect, supabaseUpsertMerge } from '@/lib/supabase-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

function isMissingContentTableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e || '')
  return /42p01|relation .*member_portal_content.* does not exist/i.test(msg)
}

function normalizeBangkokDateTimeInput(raw: unknown): string | null {
  const v = String(raw || '').trim()
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v} 00:00:00`
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
    const [datePart, timePart] = v.split('T')
    return `${datePart} ${timePart}:00`
  }
  const withTime = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/)
  if (withTime) return `${withTime[1]} ${withTime[2]}`
  return v
}

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const rows = (await supabaseSelect('member_portal_content', {
      order: 'sort_order.asc,updated_at.desc,id.desc',
      limit: 1000,
    })) as MemberPortalContentRow[]
    const items = rows.map(mapMemberPortalContentRow)
    return NextResponse.json({ success: true, items })
  } catch (e) {
    if (isMissingContentTableError(e)) {
      return NextResponse.json({
        success: true,
        needsSetup: true,
        message: 'member_portal_content 테이블이 아직 없습니다. SQL 스크립트를 먼저 적용하세요.',
        items: [],
      })
    }
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '콘텐츠를 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as Record<string, unknown>
    const contentType = String(body.contentType || '').trim()
    if (!['popup', 'info', 'store_photo'].includes(contentType)) {
      return NextResponse.json({ success: false, message: 'contentType is invalid' }, { status: 400 })
    }
    const contentKey = String(body.contentKey || '').trim() || `mp_${contentType}_${crypto.randomUUID()}`
    const row = {
      content_key: contentKey,
      content_type: contentType,
      store_code: String(body.storeCode || '').trim() || null,
      title: String(body.title || '').trim() || null,
      body: String(body.body || '').trim() || null,
      image_url: String(body.imageUrl || '').trim() || null,
      target_tab: String(body.targetTab || '').trim() || null,
      is_active: body.isActive !== false,
      sort_order: Number(body.sortOrder || 0),
      starts_at: normalizeBangkokDateTimeInput(body.startsAt),
      ends_at: normalizeBangkokDateTimeInput(body.endsAt),
      updated_at: getBangkokDateTimeString(),
      updated_by: String(authResult.auth?.name || authResult.auth?.store || 'manager'),
    }
    await supabaseUpsertMerge('member_portal_content', 'content_key', row)
    return NextResponse.json({ success: true, contentKey })
  } catch (e) {
    if (isMissingContentTableError(e)) {
      return NextResponse.json(
        { success: false, message: 'member_portal_content 테이블이 없어 저장할 수 없습니다. SQL 먼저 적용해 주세요.' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장에 실패했습니다.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const contentKey = String(new URL(req.url).searchParams.get('contentKey') || '').trim()
    if (!contentKey) {
      return NextResponse.json({ success: false, message: 'contentKey is required' }, { status: 400 })
    }
    await supabaseDeleteByFilter(
      'member_portal_content',
      `content_key=eq.${encodeURIComponent(contentKey)}`
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    if (isMissingContentTableError(e)) {
      return NextResponse.json(
        { success: false, message: 'member_portal_content 테이블이 없어 삭제할 수 없습니다.' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제에 실패했습니다.' },
      { status: 500 }
    )
  }
}


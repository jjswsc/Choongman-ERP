import { NextRequest, NextResponse } from 'next/server'
import {
  bangkokComplaintDateTimeParts,
  COMPLAINT_SOURCE_MEMBER_PORTAL,
  insertComplaintLog,
  isAllowedComplaintPlatform,
  isAllowedComplaintType,
  isAllowedComplaintVisitPath,
  mapComplaintLogRowToDto,
  MEMBER_COMPLAINT_DAILY_LIMIT,
  MEMBER_PORTAL_COMPLAINT_WRITER,
  type ComplaintLogDbRow,
} from '@/lib/complaint-log-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { requireMemberSessionWithTenant } from '@/lib/member-portal-session'
import { memberPortalStoresForSession } from '@/lib/member-portal-stores-server'
import { supabaseCountFilter, supabaseSelectFilter } from '@/lib/supabase-server'

const TITLE_MAX = 120
const CONTENT_MAX = 4000
const MENU_MAX = 80
const LIST_LIMIT = 50
const COMPLAINT_PHOTO_BUCKET = 'complaint-photos'

function isAllowedMemberComplaintPhotoUrl(url: string): boolean {
  const v = String(url || '').trim()
  if (!v) return true
  try {
    const parsed = new URL(v)
    return parsed.pathname.includes(`/${COMPLAINT_PHOTO_BUCKET}/`)
  } catch {
    return false
  }
}

type MemberComplaintBody = {
  store?: string
  visitPath?: string
  platform?: string
  type?: string
  menu?: string
  title?: string
  content?: string
  photoUrl?: string
}

function memberComplaintListItem(d: ComplaintLogDbRow) {
  const row = mapComplaintLogRowToDto(d)
  const customerReply = String(row.customerReply || '').trim()
  // 레거시: customer_reply 없이 처리완료+action 만 있는 건은 action 을 답변으로 노출
  const visibleReply =
    customerReply ||
    (row.status === '처리완료' && String(row.action || '').trim() ? String(row.action || '').trim() : '')
  return {
    number: row.number,
    store: row.store,
    type: row.type,
    title: row.title,
    status: row.status,
    customerReply: visibleReply,
    createdAt: row.createdAt || (row.date ? `${row.date}T${row.time || '00:00'}:00+07:00` : ''),
    date: row.date,
    time: row.time,
  }
}

async function resolveAllowedStoreName(storeInput: string): Promise<string | null> {
  const target = String(storeInput || '').trim()
  if (!target) return null
  const stores = await memberPortalStoresForSession()
  const hit = stores.find((s) => s.displayName === target || s.storeCode === target)
  return hit?.storeCode || null
}

async function countMemberComplaintsToday(memberId: number, tenantId?: string): Promise<number> {
  const today = getBangkokTodayDateString()
  const tenantFilter = tenantId ? `&tenant_id=eq.${encodeURIComponent(tenantId)}` : ''
  return supabaseCountFilter(
    'complaint_logs',
    `member_id=eq.${memberId}&log_date=eq.${today}&source_channel=eq.${COMPLAINT_SOURCE_MEMBER_PORTAL}${tenantFilter}`
  )
}

export async function GET(req: NextRequest) {
  const session = await requireMemberSessionWithTenant(req)
  if (session.error) return session.error

  const memberId = Number(session.member?.id || 0)
  const tenantId = session.tenantScope?.tenantId || ''
  if (!memberId) {
    return NextResponse.json({ success: false, message: 'member_not_found' }, { status: 404 })
  }

  try {
    const list = (await supabaseSelectFilter(
      'complaint_logs',
      `member_id=eq.${memberId}&source_channel=eq.${COMPLAINT_SOURCE_MEMBER_PORTAL}${
        session.tenantScope?.enforce && tenantId ? `&tenant_id=eq.${encodeURIComponent(tenantId)}` : ''
      }`,
      {
        order: 'log_date.desc,id.desc',
        limit: LIST_LIMIT,
      }
    )) as ComplaintLogDbRow[]

    return NextResponse.json({
      success: true,
      rows: (list || []).map(memberComplaintListItem),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('member-portal/me/complaints GET:', msg)
    return NextResponse.json({ success: false, message: 'load_failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await requireMemberSessionWithTenant(req)
  if (session.error) return session.error

  const member = session.member
  const memberId = Number(member?.id || 0)
  if (!memberId || !member) {
    return NextResponse.json({ success: false, code: 'member_not_found' }, { status: 404 })
  }

  try {
    const body = (await req.json()) as MemberComplaintBody
    const store = await resolveAllowedStoreName(String(body.store || ''))
    if (!store) {
      return NextResponse.json({ success: false, code: 'invalid_store' }, { status: 400 })
    }

    const visitPath = String(body.visitPath || '').trim()
    if (!isAllowedComplaintVisitPath(visitPath)) {
      return NextResponse.json({ success: false, code: 'invalid_visit_path' }, { status: 400 })
    }

    const type = String(body.type || '').trim()
    if (!isAllowedComplaintType(type)) {
      return NextResponse.json({ success: false, code: 'invalid_type' }, { status: 400 })
    }

    const platformRaw = String(body.platform || '').trim()
    const platform = platformRaw === '__none__' ? '' : platformRaw
    if (visitPath === '배달' && !platform) {
      return NextResponse.json({ success: false, code: 'platform_required' }, { status: 400 })
    }
    if (platform && !isAllowedComplaintPlatform(platform)) {
      return NextResponse.json({ success: false, code: 'invalid_platform' }, { status: 400 })
    }

    const title = String(body.title || '').trim()
    const content = String(body.content || '').trim()
    if (!title) {
      return NextResponse.json({ success: false, code: 'title_required' }, { status: 400 })
    }
    if (!content) {
      return NextResponse.json({ success: false, code: 'content_required' }, { status: 400 })
    }
    if (title.length > TITLE_MAX || content.length > CONTENT_MAX) {
      return NextResponse.json({ success: false, code: 'text_too_long' }, { status: 400 })
    }

    const menu = String(body.menu || '').trim().slice(0, MENU_MAX)
    const photoUrl = String(body.photoUrl || '').trim()
    if (!isAllowedMemberComplaintPhotoUrl(photoUrl)) {
      return NextResponse.json({ success: false, code: 'invalid_photo' }, { status: 400 })
    }

    const todayCount = await countMemberComplaintsToday(
      memberId,
      session.tenantScope?.enforce ? session.tenantScope.tenantId : undefined
    )
    if (todayCount >= MEMBER_COMPLAINT_DAILY_LIMIT) {
      return NextResponse.json({ success: false, code: 'rate_limit' }, { status: 429 })
    }

    const { date, time } = bangkokComplaintDateTimeParts()
    const { number } = await insertComplaintLog({
      date,
      time,
      store,
      writer: MEMBER_PORTAL_COMPLAINT_WRITER,
      customer: String(member.name || member.fullName || '').trim(),
      contact: String(member.phone || '').trim(),
      visitPath,
      platform,
      type,
      menu,
      title,
      content,
      severity: '경미',
      status: '접수',
      photoUrl,
      memberId,
      sourceChannel: COMPLAINT_SOURCE_MEMBER_PORTAL,
    })

    return NextResponse.json({ success: true, number })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('member-portal/me/complaints POST:', msg)
    return NextResponse.json({ success: false, code: 'save_failed', message: msg }, { status: 500 })
  }
}

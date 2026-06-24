import { NextRequest, NextResponse } from 'next/server'
import {
  bangkokComplaintDateTimeParts,
  insertComplaintLog,
} from '@/lib/complaint-log-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { listMemberSignupStoreOptions } from '@/lib/member-signup-store'
import {
  COMPLAINT_SOURCE_PUBLIC_WEB,
  parsePublicComplaintBody,
  PUBLIC_COMPLAINT_DAILY_LIMIT,
  PUBLIC_WEB_COMPLAINT_WRITER,
} from '@/lib/member-portal-public-complaint'
import { supabaseCountFilter } from '@/lib/supabase-server'

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    ''
  )
}

async function resolvePublicComplaintStoreDisplayName(
  storeInput: string,
  lang: string
): Promise<string | null> {
  const target = String(storeInput || '').trim()
  if (!target) return null
  const stores = await listMemberSignupStoreOptions(lang)
  const hit = stores.find((s) => s.displayName === target || s.storeCode === target)
  return hit?.displayName || null
}

async function countPublicComplaintsToday(contactDigits: string): Promise<number> {
  const today = getBangkokTodayDateString()
  return supabaseCountFilter(
    'complaint_logs',
    `log_date=eq.${today}&source_channel=eq.${COMPLAINT_SOURCE_PUBLIC_WEB}&contact=eq.${encodeURIComponent(contactDigits)}`
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const lang = String(body.lang || req.nextUrl.searchParams.get('lang') || 'th').trim()
    const storeDisplayName = await resolvePublicComplaintStoreDisplayName(String(body.store || ''), lang)
    const parsed = parsePublicComplaintBody(body, { storeDisplayName })
    if (!parsed.ok) {
      return NextResponse.json({ success: false, code: parsed.code }, { status: 400 })
    }

    const todayCount = await countPublicComplaintsToday(parsed.data.contact)
    if (todayCount >= PUBLIC_COMPLAINT_DAILY_LIMIT) {
      return NextResponse.json({ success: false, code: 'rate_limit' }, { status: 429 })
    }

    const { date, time } = bangkokComplaintDateTimeParts()
    const remarkParts = ['public_web']
    const ip = clientIp(req)
    if (ip) remarkParts.push(`ip:${ip.slice(0, 64)}`)

    const { number } = await insertComplaintLog({
      date,
      time,
      store: parsed.data.store,
      writer: PUBLIC_WEB_COMPLAINT_WRITER,
      customer: parsed.data.customer,
      contact: parsed.data.contact,
      visitPath: parsed.data.visitPath,
      platform: parsed.data.platform,
      type: parsed.data.type,
      menu: parsed.data.menu,
      title: parsed.data.title,
      content: parsed.data.content,
      severity: '경미',
      status: '접수',
      photoUrl: parsed.data.photoUrl,
      remark: remarkParts.join(' · '),
      sourceChannel: COMPLAINT_SOURCE_PUBLIC_WEB,
    })

    return NextResponse.json({ success: true, number })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('member-portal/public/complaints POST:', msg)
    return NextResponse.json({ success: false, code: 'save_failed', message: msg }, { status: 500 })
  }
}

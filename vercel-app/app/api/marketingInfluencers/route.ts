import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

function parseNum(val: unknown): number {
  if (val == null || val === '') return 0
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  return Number.isNaN(n) ? 0 : n
}

function parseDate(val: unknown): string | null {
  if (val == null || val === '') return null
  const s = String(val).trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function parsePlatformLinks(val: unknown): Record<string, string> {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(val)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim()
    }
    return out
  }
  return {}
}

/** 인플루언서 목록 조회 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')?.trim()

    let filter = ''
    if (campaignId) filter = `campaign_id=eq.${encodeURIComponent(campaignId)}`

    const rows = filter
      ? ((await supabaseSelectFilter('marketing_influencers', filter, {
          order: 'publish_date.desc.nullslast,id.desc',
          limit: 500,
        })) as Record<string, unknown>[])
      : ((await supabaseSelect('marketing_influencers', {
          order: 'publish_date.desc.nullslast,id.desc',
          limit: 500,
        })) as Record<string, unknown>[])

    const list = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
      name: String(row.name ?? ''),
      followers: String(row.followers ?? ''),
      contentFormat: String(row.content_format ?? ''),
      contentTopic: String(row.content_topic ?? ''),
      status: String(row.status ?? 'finish'),
      branchReview: String(row.branch_review ?? ''),
      hireType: String(row.hire_type ?? 'pay'),
      budget: parseNum(row.budget),
      shootingDate: row.shooting_date ? parseDate(row.shooting_date) : null,
      publishDate: row.publish_date ? parseDate(row.publish_date) : null,
      platformLinks: parsePlatformLinks(row.platform_links),
      note: String(row.note ?? ''),
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('marketingInfluencers GET:', e)
    return NextResponse.json([], { headers })
  }
}

/** 인플루언서 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as {
      id?: string
      campaignId?: string | null
      name?: string
      followers?: string
      contentFormat?: string
      contentTopic?: string
      status?: string
      branchReview?: string
      hireType?: string
      budget?: number
      shootingDate?: string | null
      publishDate?: string | null
      platformLinks?: Record<string, string>
      note?: string
    }

    const name = String(body.name ?? '').trim()
    const editingId = body.id?.trim()

    if (!name) {
      return NextResponse.json(
        { success: false, message: '이름이 필요합니다.' },
        { headers }
      )
    }

    const platformLinks = body.platformLinks && typeof body.platformLinks === 'object'
      ? body.platformLinks
      : {}

    const row: Record<string, unknown> = {
      campaign_id: body.campaignId ? Number(body.campaignId) : null,
      name,
      followers: String(body.followers ?? '').trim(),
      content_format: String(body.contentFormat ?? '').trim(),
      content_topic: String(body.contentTopic ?? '').trim(),
      status: String(body.status ?? 'finish').trim(),
      branch_review: String(body.branchReview ?? '').trim(),
      hire_type: String(body.hireType ?? 'pay').trim(),
      budget: parseNum(body.budget),
      shooting_date: body.shootingDate ? parseDate(body.shootingDate) : null,
      publish_date: body.publishDate ? parseDate(body.publishDate) : null,
      platform_links: platformLinks,
      note: String(body.note ?? '').trim(),
    }

    if (editingId) {
      const existing = (await supabaseSelectFilter(
        'marketing_influencers',
        `id=eq.${encodeURIComponent(editingId)}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing?.length) {
        await supabaseUpdateByFilter('marketing_influencers', `id=eq.${editingId}`, row)
        return NextResponse.json({ success: true, message: '수정되었습니다.', id: editingId }, { headers })
      }
    }

    const inserted = (await supabaseInsert('marketing_influencers', row)) as { id?: number }[]
    const created = Array.isArray(inserted) ? inserted[0] : inserted
    return NextResponse.json({ success: true, message: '저장되었습니다.', id: created?.id ? String(created.id) : null }, { headers })
  } catch (e) {
    console.error('marketingInfluencers POST:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '저장 실패' }, { headers })
  }
}

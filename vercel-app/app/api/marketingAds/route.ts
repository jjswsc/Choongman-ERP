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

/** 광고 목록 조회 (campaignId 필터 옵션) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')?.trim()

    let filter = ''
    if (campaignId) {
      filter = `campaign_id=eq.${encodeURIComponent(campaignId)}`
    }

    const rows = filter
      ? ((await supabaseSelectFilter('marketing_ads', filter, {
          order: 'publish_date.desc,id.desc',
          limit: 500,
        })) as Record<string, unknown>[])
      : ((await supabaseSelect('marketing_ads', {
          order: 'publish_date.desc,id.desc',
          limit: 500,
        })) as Record<string, unknown>[])

    const list = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
      contentFormat: String(row.content_format ?? ''),
      contentPillar: String(row.content_pillar ?? ''),
      contentTopic: String(row.content_topic ?? ''),
      publishDate: row.publish_date ? parseDate(row.publish_date) : null,
      platform: String(row.platform ?? ''),
      postLink: String(row.post_link ?? ''),
      boostBudget: parseNum(row.boost_budget),
      actualSpent: parseNum(row.actual_spent),
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('marketingAds GET:', e)
    return NextResponse.json([], { headers })
  }
}

/** 광고 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as {
      id?: string
      campaignId?: string | null
      contentFormat?: string
      contentPillar?: string
      contentTopic?: string
      publishDate?: string | null
      platform?: string
      postLink?: string
      boostBudget?: number
      actualSpent?: number
    }

    const platform = String(body.platform ?? '').trim()
    const editingId = body.id?.trim()

    if (!platform) {
      return NextResponse.json(
        { success: false, message: '플랫폼이 필요합니다.' },
        { headers }
      )
    }

    const row: Record<string, unknown> = {
      campaign_id: body.campaignId ? Number(body.campaignId) : null,
      content_format: String(body.contentFormat ?? '').trim(),
      content_pillar: String(body.contentPillar ?? '').trim(),
      content_topic: String(body.contentTopic ?? '').trim(),
      publish_date: body.publishDate ? parseDate(body.publishDate) : null,
      platform,
      post_link: String(body.postLink ?? '').trim(),
      boost_budget: parseNum(body.boostBudget),
      actual_spent: parseNum(body.actualSpent),
    }

    if (editingId) {
      const existing = (await supabaseSelectFilter(
        'marketing_ads',
        `id=eq.${encodeURIComponent(editingId)}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing?.length) {
        await supabaseUpdateByFilter('marketing_ads', `id=eq.${editingId}`, row)
        return NextResponse.json({ success: true, message: '수정되었습니다.', id: editingId }, { headers })
      }
    }

    const inserted = (await supabaseInsert('marketing_ads', row)) as { id?: number }[]
    const created = Array.isArray(inserted) ? inserted[0] : inserted
    return NextResponse.json({ success: true, message: '저장되었습니다.', id: created?.id ? String(created.id) : null }, { headers })
  } catch (e) {
    console.error('marketingAds POST:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '저장 실패' }, { headers })
  }
}

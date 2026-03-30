import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { normalizeMarketingCollabDetail } from '@/lib/marketing-collab-detail'
import { collabHasPosDiscount } from '@/lib/pos-collab-discount'

function bangkokTodayYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

function parseYmd(val: unknown): string | null {
  if (val == null || val === '') return null
  const s = String(val).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

function parseBranches(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((x) => typeof x === 'string').map(String)
  if (typeof val === 'string') {
    const s = val.trim()
    if (!s) return []
    return s.split(/[\n,;]/).map((x) => x.trim()).filter(Boolean)
  }
  return []
}

/** POS: 매장·기간·진행중인 협업 캠페인 중 POS 할인이 설정된 것만 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const storeCode = String(new URL(req.url).searchParams.get('storeCode') ?? '').trim()
    if (!storeCode) {
      return NextResponse.json({ campaigns: [] }, { headers })
    }

    const rows = (await supabaseSelectFilter(
      'marketing_campaigns',
      'collab_management=eq.true&status=eq.ongoing',
      { limit: 300, order: 'start_date.desc' }
    )) as Record<string, unknown>[] | null

    const today = bangkokTodayYmd()
    const out: {
      id: string
      topic: string
      campaignNo: string
      collabDetail: ReturnType<typeof normalizeMarketingCollabDetail>
    }[] = []

    for (const row of rows || []) {
      const branches = parseBranches(row.branches)
      if (branches.length > 0 && !branches.includes(storeCode)) continue

      const start = parseYmd(row.start_date)
      const end = parseYmd(row.end_date)
      if (start && today < start) continue
      if (end && today > end) continue

      const collabDetail = normalizeMarketingCollabDetail(row.collab_detail)
      if (!collabHasPosDiscount(collabDetail)) continue

      out.push({
        id: String(row.id ?? ''),
        topic: String(row.topic ?? ''),
        campaignNo: String(row.campaign_no ?? ''),
        collabDetail,
      })
    }

    return NextResponse.json({ campaigns: out }, { headers })
  } catch (e) {
    console.error('getPosCollabCampaigns:', e)
    return NextResponse.json({ campaigns: [] }, { headers })
  }
}

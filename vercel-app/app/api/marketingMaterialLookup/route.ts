import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 홍보물 id 목록으로 이름·캠페인 id 조회 (최대 200개) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(req.url)
    const raw = searchParams.get('ids')?.trim() ?? ''
    const ids = [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))]
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 200)

    if (ids.length === 0) {
      return NextResponse.json([], { headers })
    }

    const filter = `id=in.(${ids.join(',')})`
    const rows = (await supabaseSelectFilter('marketing_materials', filter, {
      limit: 500,
    })) as Record<string, unknown>[] | null

    const list = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('marketingMaterialLookup GET:', e)
    return NextResponse.json([], { headers })
  }
}

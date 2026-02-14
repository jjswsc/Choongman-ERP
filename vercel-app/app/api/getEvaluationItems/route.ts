import { NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export interface EvaluationItem {
  id: string | number
  main: string
  sub: string
  name: string
  use?: boolean
}

/** 평가 항목 조회 (kitchen | service). activeOnly=true면 use_flag=true만 */
export async function GET(req: Request) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const type = (searchParams.get('type') || 'kitchen').trim()
    const activeOnly = searchParams.get('activeOnly') === 'true'

    if (!['kitchen', 'service'].includes(type)) {
      return NextResponse.json([], { headers })
    }

    let filter = `eval_type=eq.${encodeURIComponent(type)}`
    if (activeOnly) filter += '&use_flag=eq.true'

    const rows = (await supabaseSelectFilter('evaluation_items', filter, {
      order: 'item_id.asc',
      limit: 500,
    })) as { item_id?: number; main_cat?: string; sub_cat?: string; name?: string; use_flag?: boolean }[] | null

    const list: EvaluationItem[] = (rows || []).map((r) => ({
      id: r.item_id ?? '',
      main: String(r.main_cat || '').trim(),
      sub: String(r.sub_cat || '').trim(),
      name: String(r.name || '').trim(),
      use: r.use_flag === true || r.use_flag === 1,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getEvaluationItems:', e)
    return NextResponse.json([], { status: 500, headers })
  }
}

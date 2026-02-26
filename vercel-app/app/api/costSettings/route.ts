import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

/** GET: 원가 관련 설정 (OH% 등) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelectFilter('cost_settings', 'or=(key.eq.default_overhead_percent,key.eq.global_overhead_percent)', {
      limit: 10,
    })) as { key?: string; value_json?: number }[] | null

    const map: Record<string, number> = {}
    for (const r of rows || []) {
      const k = r.key ?? ''
      const v = r.value_json
      map[k] = typeof v === 'number' ? v : 5
    }
    return NextResponse.json(
      {
        defaultOverheadPercent: map.default_overhead_percent ?? 5,
        globalOverheadPercent: map.global_overhead_percent ?? 5,
      },
      { headers }
    )
  } catch (e) {
    console.error('getCostSettings:', e)
    return NextResponse.json({ defaultOverheadPercent: 5, globalOverheadPercent: 5 }, { headers })
  }
}

/** POST: 설정 업데이트 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const globalOverheadPercent = body.globalOverheadPercent != null ? Number(body.globalOverheadPercent) : undefined
    const defaultOverheadPercent = body.defaultOverheadPercent != null ? Number(body.defaultOverheadPercent) : undefined

    const rows: Record<string, unknown>[] = []
    if (globalOverheadPercent != null) {
      rows.push({ key: 'global_overhead_percent', value_json: globalOverheadPercent, updated_at: new Date().toISOString() })
    }
    if (defaultOverheadPercent != null) {
      rows.push({ key: 'default_overhead_percent', value_json: defaultOverheadPercent, updated_at: new Date().toISOString() })
    }
    if (rows.length > 0) {
      await supabaseUpsert('cost_settings', rows, 'key')
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('updateCostSettings:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

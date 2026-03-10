import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

const COST_KEYS = ['global_overhead_percent', 'default_overhead_percent'] as const

/** GET: 원가 관련 설정 (OH% 등) - system_settings 사용 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const orFilter = `or=(${COST_KEYS.map((k) => `key.eq.${k}`).join(',')})`
    const rows = (await supabaseSelectFilter('system_settings', orFilter, {
      limit: 10,
    })) as { key?: string; value_json?: unknown }[] | null

    const map: Record<string, number> = {}
    for (const r of rows || []) {
      const k = r.key ?? ''
      const v = r.value_json
      const num = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) : NaN)
      map[k] = !isNaN(num) ? num : 5
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

/** POST: 설정 업데이트 - system_settings upsert */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const globalOverheadPercent = body.globalOverheadPercent != null ? Number(body.globalOverheadPercent) : undefined
    const defaultOverheadPercent = body.defaultOverheadPercent != null ? Number(body.defaultOverheadPercent) : undefined

    const rows: Record<string, unknown>[] = []
    if (globalOverheadPercent != null && !isNaN(globalOverheadPercent)) {
      rows.push({
        key: 'global_overhead_percent',
        value_json: globalOverheadPercent,
        updated_at: new Date().toISOString(),
      })
    }
    if (defaultOverheadPercent != null && !isNaN(defaultOverheadPercent)) {
      rows.push({
        key: 'default_overhead_percent',
        value_json: defaultOverheadPercent,
        updated_at: new Date().toISOString(),
      })
    }
    if (rows.length > 0) {
      await supabaseUpsert('system_settings', rows, 'key')
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('updateCostSettings:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

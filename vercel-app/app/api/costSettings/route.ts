import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isOfficeRole } from '@/lib/permissions'

const COST_KEYS = [
  'global_overhead_percent',
  'default_overhead_percent',
  'default_mise_percent',
  'cost_ratio_good_max',
  'cost_ratio_caution_max',
  'cost_category_targets',
] as const

function parseNum(v: unknown, fallback: number): number {
  const num = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return !isNaN(num) ? num : fallback
}

/** GET: 원가 관련 설정 (OH%·미즈·원가율 구간·카테고리 목표) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const orFilter = `or=(${COST_KEYS.map((k) => `key.eq.${k}`).join(',')})`
    const rows = (await supabaseSelectFilter('system_settings', orFilter, {
      limit: 20,
    })) as { key?: string; value_json?: unknown }[] | null

    const map: Record<string, unknown> = {}
    for (const r of rows || []) {
      const k = r.key ?? ''
      if (k) map[k] = r.value_json
    }

    const categoryTargets: Record<string, number> = {}
    const rawTargets = map.cost_category_targets
    if (rawTargets && typeof rawTargets === 'object' && !Array.isArray(rawTargets)) {
      for (const [k, v] of Object.entries(rawTargets as Record<string, unknown>)) {
        categoryTargets[k] = parseNum(v, 35)
      }
    }

    return NextResponse.json(
      {
        defaultOverheadPercent: parseNum(map.default_overhead_percent, 5),
        globalOverheadPercent: parseNum(map.global_overhead_percent, 5),
        defaultMisePercent: parseNum(map.default_mise_percent, 3),
        costRatioGoodMax: parseNum(map.cost_ratio_good_max, 35),
        costRatioCautionMax: parseNum(map.cost_ratio_caution_max, 42),
        categoryTargets,
      },
      { headers }
    )
  } catch (e) {
    console.error('getCostSettings:', e)
    return NextResponse.json(
      {
        defaultOverheadPercent: 5,
        globalOverheadPercent: 5,
        defaultMisePercent: 3,
        costRatioGoodMax: 35,
        costRatioCautionMax: 42,
        categoryTargets: {},
      },
      { headers }
    )
  }
}

/** POST: 설정 업데이트 - system_settings upsert (본사 오피스만) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    if (!isOfficeRole(String(authResult.auth.role || ''))) {
      return NextResponse.json({ success: false, message: 'no permission' }, { status: 403, headers })
    }

    const body = await request.json()
    const globalOverheadPercent = body.globalOverheadPercent != null ? Number(body.globalOverheadPercent) : undefined
    const defaultOverheadPercent = body.defaultOverheadPercent != null ? Number(body.defaultOverheadPercent) : undefined
    const defaultMisePercent = body.defaultMisePercent != null ? Number(body.defaultMisePercent) : undefined
    const costRatioGoodMax = body.costRatioGoodMax != null ? Number(body.costRatioGoodMax) : undefined
    const costRatioCautionMax = body.costRatioCautionMax != null ? Number(body.costRatioCautionMax) : undefined
    const categoryTargetsRaw = body.categoryTargets

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
    if (defaultMisePercent != null && !isNaN(defaultMisePercent)) {
      rows.push({
        key: 'default_mise_percent',
        value_json: defaultMisePercent,
        updated_at: new Date().toISOString(),
      })
    }
    if (costRatioGoodMax != null && !isNaN(costRatioGoodMax)) {
      rows.push({
        key: 'cost_ratio_good_max',
        value_json: costRatioGoodMax,
        updated_at: new Date().toISOString(),
      })
    }
    if (costRatioCautionMax != null && !isNaN(costRatioCautionMax)) {
      rows.push({
        key: 'cost_ratio_caution_max',
        value_json: costRatioCautionMax,
        updated_at: new Date().toISOString(),
      })
    }
    if (categoryTargetsRaw && typeof categoryTargetsRaw === 'object' && !Array.isArray(categoryTargetsRaw)) {
      const cleaned: Record<string, number> = {}
      for (const [k, v] of Object.entries(categoryTargetsRaw as Record<string, unknown>)) {
        const n = Number(v)
        if (String(k).trim() && Number.isFinite(n) && n > 0) cleaned[String(k).trim()] = n
      }
      rows.push({
        key: 'cost_category_targets',
        value_json: cleaned,
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

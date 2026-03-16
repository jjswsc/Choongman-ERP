import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate, supabaseSelectFilter } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const assetCode = String(body.assetCode || body.asset_code || '').trim()
    const name = String(body.name || '').trim()
    const storeName = String(body.storeName || body.store_name || 'All').trim()
    const acquisitionDate = String(body.acquisitionDate || body.acquisition_date || '').slice(0, 10)
    const acquisitionCost = Number(body.acquisitionCost || body.acquisition_cost) || 0
    const residualRate = Math.min(100, Math.max(0, Number(body.residualRate || body.residual_rate) || 0))
    const usefulLifeMonths = Math.max(1, Number(body.usefulLifeMonths || body.useful_life_months) || 60)
    const depreciationMethod = ['straight_line', 'declining_balance'].includes(
      String(body.depreciationMethod || body.depreciation_method || 'straight_line')
    )
      ? String(body.depreciationMethod || body.depreciation_method)
      : 'straight_line'
    const memo = String(body.memo || '').trim() || null

    if (!name) {
      return NextResponse.json({ success: false, message: '자산명을 입력하세요.' }, { status: 400, headers })
    }
    if (!acquisitionDate || !/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)) {
      return NextResponse.json({ success: false, message: '취득일을 입력하세요.' }, { status: 400, headers })
    }
    if (acquisitionCost < 0) {
      return NextResponse.json({ success: false, message: '취득가를 입력하세요.' }, { status: 400, headers })
    }

    const code = assetCode || `FA-${Date.now()}`

    if (id && id > 0) {
      const existing = (await supabaseSelectFilter('fixed_assets', `id=eq.${id}`, { limit: 1 })) as { id?: number }[]
      if (!existing?.length) {
        return NextResponse.json({ success: false, message: '해당 자산이 없습니다.' }, { status: 404, headers })
      }
      await supabaseUpdate('fixed_assets', id, {
        asset_code: code,
        name,
        store_name: storeName,
        acquisition_date: acquisitionDate,
        acquisition_cost: acquisitionCost,
        residual_rate: residualRate,
        useful_life_months: usefulLifeMonths,
        depreciation_method: depreciationMethod,
        memo,
        updated_at: new Date().toISOString(),
      })
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    const existingCode = (await supabaseSelectFilter('fixed_assets', `asset_code=eq.${encodeURIComponent(code)}`, { limit: 1 })) as unknown[]
    if (existingCode?.length) {
      return NextResponse.json({ success: false, message: '동일한 자산코드가 이미 있습니다.' }, { status: 400, headers })
    }

    await supabaseInsert('fixed_assets', {
      asset_code: code,
      name,
      store_name: storeName,
      acquisition_date: acquisitionDate,
      acquisition_cost: acquisitionCost,
      residual_rate: residualRate,
      useful_life_months: usefulLifeMonths,
      depreciation_method: depreciationMethod,
      status: 'active',
      memo,
    })
    return NextResponse.json({ success: true, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveFixedAsset:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}

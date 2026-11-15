import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

type FixedAssetRow = {
  id?: number
  acquisition_cost?: number
  status?: string
  accumulated_depreciation?: number
  book_value?: number
  [key: string]: unknown
}

/** 자산별 감가상각 누계·장부가액 부착 */
async function attachBookValues(assets: FixedAssetRow[]): Promise<FixedAssetRow[]> {
  if (!assets.length) return assets
  const ids = assets
    .map((a) => Number(a.id))
    .filter((id) => Number.isFinite(id) && id > 0)
  const accumMap = new Map<number, number>()
  const BATCH = 200
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const entries = (await supabaseSelectFilter(
      'depreciation_entries',
      `fixed_asset_id=in.(${chunk.join(',')})`,
      { select: 'fixed_asset_id,amount', limit: 50000 }
    )) as { fixed_asset_id?: number; amount?: number }[] | null
    for (const e of entries || []) {
      const id = Number(e.fixed_asset_id)
      if (!Number.isFinite(id) || id <= 0) continue
      accumMap.set(id, (accumMap.get(id) || 0) + (Number(e.amount) || 0))
    }
  }
  return assets.map((a) => {
    const cost = Number(a.acquisition_cost) || 0
    const accum = Math.round((accumMap.get(Number(a.id)) || 0) * 100) / 100
    const book = Math.round((cost - accum) * 100) / 100
    return {
      ...a,
      accumulated_depreciation: accum,
      book_value: book,
    }
  })
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeFilter = searchParams.get('storeFilter') || ''
  const status = searchParams.get('status') || 'active'
  const dateFrom = String(searchParams.get('dateFrom') || '').trim().slice(0, 10)
  const dateTo = String(searchParams.get('dateTo') || '').trim().slice(0, 10)

  try {
    let assets: FixedAssetRow[]
    const parts: string[] = []
    if (storeFilter && storeFilter !== 'All') {
      parts.push(`store_name=ilike.${encodeURIComponent(storeFilter)}`)
    }
    if (status && status !== 'all') {
      parts.push(`status=eq.${status}`)
    }
    // 취득일 기간 — 자산 목록·취득가 합계 조회 기준
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      parts.push(`acquisition_date=gte.${dateFrom}`)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      parts.push(`acquisition_date=lte.${dateTo}`)
    }
    const filter = parts.join('&')
    if (filter) {
      assets = (await supabaseSelectFilter('fixed_assets', filter, {
        select: '*',
        order: 'acquisition_date.desc',
        limit: 5000,
      })) as FixedAssetRow[]
    } else {
      assets = (await supabaseSelect('fixed_assets', {
        select: '*',
        order: 'acquisition_date.desc',
        limit: 5000,
      })) as FixedAssetRow[]
    }
    const list = await attachBookValues(assets || [])
    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    console.error('getFixedAssets:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

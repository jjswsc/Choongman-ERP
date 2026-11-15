import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeFilter = searchParams.get('storeFilter') || ''
  const status = searchParams.get('status') || 'active'
  const dateFrom = String(searchParams.get('dateFrom') || '').trim().slice(0, 10)
  const dateTo = String(searchParams.get('dateTo') || '').trim().slice(0, 10)

  try {
    let assets: { status?: string }[]
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
      })) as { status?: string }[]
    } else {
      assets = (await supabaseSelect('fixed_assets', {
        select: '*',
        order: 'acquisition_date.desc',
        limit: 5000,
      })) as { status?: string }[]
    }
    return NextResponse.json({ success: true, list: assets || [] }, { headers })
  } catch (e) {
    console.error('getFixedAssets:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

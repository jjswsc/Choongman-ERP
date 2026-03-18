import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeFilter = searchParams.get('storeFilter') || ''
  const status = searchParams.get('status') || 'active'

  try {
    let assets: { status?: string }[]
    let filter = ''
    if (storeFilter && storeFilter !== 'All') {
      filter = `store_name=ilike.${encodeURIComponent(storeFilter)}`
    }
    if (status && status !== 'all') {
      filter += filter ? `&status=eq.${status}` : `status=eq.${status}`
    }
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

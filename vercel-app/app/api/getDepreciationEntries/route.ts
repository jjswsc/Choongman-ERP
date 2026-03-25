import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const yearMonth = searchParams.get('yearMonth') || ''
  const storeFilter = searchParams.get('storeFilter') || ''

  try {
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ success: false, list: [], totalAmount: 0 }, { headers })
    }

    const filter = `year_month=eq.${yearMonth}`
    const entries = (await supabaseSelectFilter('depreciation_entries', filter, {
      select: 'id,fixed_asset_id,year_month,accounting_date,amount,journal_entry_id',
      limit: 5000,
    })) as {
      id?: number
      fixed_asset_id?: number
      amount?: number
      accounting_date?: string
    }[]

    if (!entries?.length) {
      return NextResponse.json({ success: true, list: [], totalAmount: 0 }, { headers })
    }

    const assetIds = [...new Set((entries as { fixed_asset_id?: number }[]).map((e) => e.fixed_asset_id).filter(Boolean))]
    const assets =
      assetIds.length > 0
        ? ((await supabaseSelectFilter(
            'fixed_assets',
            `id=in.(${assetIds.join(',')})`,
            { select: 'id,name,store_name,asset_code' }
          )) as { id?: number; name?: string; store_name?: string; asset_code?: string }[])
        : []

    const assetMap = Object.fromEntries((assets || []).map((a) => [a.id, a]))
    const list = (entries || []).map((e) => {
      const a = assetMap[e.fixed_asset_id!]
      return {
        ...e,
        assetName: a?.name,
        assetCode: a?.asset_code,
        storeName: a?.store_name,
      }
    })

    const filtered =
      storeFilter && storeFilter !== 'All'
        ? list.filter((l) => (l as { storeName?: string }).storeName === storeFilter)
        : list
    const totalAmount = filtered.reduce((s, l) => s + (Number(l.amount) || 0), 0)

    return NextResponse.json({ success: true, list: filtered, totalAmount }, { headers })
  } catch (e) {
    console.error('getDepreciationEntries:', e)
    return NextResponse.json(
      { success: false, list: [], error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

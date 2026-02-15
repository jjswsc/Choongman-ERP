import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 점검 이력 조회 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('start') || searchParams.get('startStr') || '2000-01-01').slice(0, 10)
  const endStr = String(searchParams.get('end') || searchParams.get('endStr') || '2100-12-31').slice(0, 10)
  const store = searchParams.get('store')?.trim()
  const inspector = searchParams.get('inspector')?.trim()
  try {
    const filters = [`check_date=gte.${startStr}`, `check_date=lte.${endStr}`]
    if (store && store !== 'All') filters.push(`store_name=eq.${encodeURIComponent(store)}`)
    const rows = (await supabaseSelectFilter('check_results', filters.join('&'), {
      order: 'check_date.desc',
      limit: 2000,
    })) as { id?: string; check_date?: string; store_name?: string; inspector?: string; summary?: string; memo?: string; json_data?: string }[]
    let result = (rows || []).map((r) => ({
      id: r.id,
      date: String(r.check_date || '').slice(0, 10),
      store: r.store_name,
      inspector: String(r.inspector || '').trim(),
      result: r.summary,
      memo: r.memo,
      json: r.json_data,
    }))
    if (inspector) {
      const q = inspector.toLowerCase()
      result = result.filter((r) => r.inspector.toLowerCase().includes(q))
    }
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('getCheckHistory:', msg)
    return NextResponse.json([], { status: 500 })
  }
}

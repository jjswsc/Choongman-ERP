import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const year = parseInt(String(searchParams.get('year') || '').trim(), 10)

  if (!year || isNaN(year)) {
    return NextResponse.json({ success: false, list: [], msg: '연도를 선택해주세요.' }, { status: 400, headers })
  }

  try {
    const rows = (await supabaseSelectFilter(
      'public_holidays',
      `year=eq.${year}`,
      { order: 'date.asc', limit: 100 }
    )) as { id?: number; year?: number; date?: string; name?: string }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      year: Number(r.year) || year,
      date: String(r.date || '').slice(0, 10),
      name: String(r.name || '').trim(),
    }))

    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    console.error('getPublicHolidays:', e)
    return NextResponse.json({ success: false, list: [], msg: '조회 실패.' }, { status: 500, headers })
  }
}

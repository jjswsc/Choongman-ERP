import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const TZ = 'Asia/Bangkok'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeName = String(searchParams.get('storeName') || searchParams.get('store') || '').trim()
  const name = String(searchParams.get('name') || '').trim()

  if (!storeName || !name) {
    return NextResponse.json([], { headers })
  }

  try {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const rows = (await supabaseSelectFilter(
      'attendance_logs',
      `store_name=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(name)}`,
      { order: 'log_at.desc', limit: 50 }
    )) as { log_at?: string; log_type?: string }[]

    const types: string[] = []
    for (const r of rows || []) {
      const rowDate = r.log_at
        ? new Date(r.log_at).toLocaleDateString('en-CA', { timeZone: TZ })
        : ''
      if (rowDate !== todayStr) continue
      const typ = String(r.log_type || '').trim()
      if (typ && !types.includes(typ)) types.push(typ)
    }
    return NextResponse.json(types, { headers })
  } catch (e) {
    console.error('getTodayAttendanceTypes:', e)
    return NextResponse.json([], { headers })
  }
}

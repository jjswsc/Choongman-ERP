import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 해당 사용자(store+name)의 푸시 토큰 등록 여부 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const { searchParams } = new URL(request.url)
    const store = String(searchParams.get('store') || '').trim()
    const name = String(searchParams.get('name') || '').trim()

    if (!store || !name) {
      return NextResponse.json({ registered: false }, { headers })
    }

    const rows = (await supabaseSelectFilter(
      'push_tokens',
      `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`,
      { select: 'token', limit: 1 }
    )) as { token?: string }[] | null

    const registered = !!(rows?.[0]?.token)
    return NextResponse.json({ registered }, { headers })
  } catch (e) {
    console.error('checkPushToken:', e)
    return NextResponse.json({ registered: false }, { headers })
  }
}

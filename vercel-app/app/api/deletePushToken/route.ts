import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await request.json()
    const store = String(body?.store || '').trim()
    const name = String(body?.name || '').trim()

    if (!store || !name) {
      return NextResponse.json(
        { success: false, message: 'store, name 필수입니다.' },
        { headers }
      )
    }

    await supabaseDeleteByFilter(
      'push_tokens',
      `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`
    )

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('deletePushToken:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : String(e),
      },
      { headers }
    )
  }
}

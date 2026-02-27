import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await request.json()
    const store = String(body?.store || '').trim()
    const name = String(body?.name || '').trim()
    const token = String(body?.token || '').trim()
    const userAgent = String(body?.userAgent ?? body?.user_agent ?? '').trim()
    const lang = String(body?.lang ?? body?.language ?? 'ko').toLowerCase().slice(0, 2)

    if (!store || !name || !token) {
      return NextResponse.json(
        { success: false, message: 'store, name, token 필수입니다.' },
        { headers }
      )
    }

    const row: Record<string, unknown> = {
      store,
      name,
      token,
      user_agent: userAgent,
      updated_at: new Date().toISOString(),
    }
    if (['ko', 'en', 'th', 'my', 'lo', 'mm', 'la'].includes(lang)) {
      row.lang = lang === 'mm' ? 'my' : lang === 'la' ? 'lo' : lang
    }
    await supabaseUpsert('push_tokens', [row], 'store,name')

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePushToken:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : String(e),
      },
      { headers }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as { code?: string }
    const code = String(body.code || '').trim()
    if (!code) {
      return NextResponse.json({ success: false, message: '거래처 코드가 필요합니다.' }, { headers })
    }

    await supabaseDeleteByFilter('vendors', `code=eq.${encodeURIComponent(code)}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteVendor:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { headers }
    )
  }
}

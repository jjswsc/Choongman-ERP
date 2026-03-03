import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as { id: string }
    const id = body?.id
    if (!id) return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { headers })
    await supabaseDeleteByFilter('marketing_ads', `id=eq.${encodeURIComponent(id)}`)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('deleteMarketingAd:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

/** 인테리어 업체 마스터 삭제 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = Number(body.id)
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400, headers })
    }
    await supabaseDeleteByFilter('interior_vendor_directory', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteInteriorVendorDirectory:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}

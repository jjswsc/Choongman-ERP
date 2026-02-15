import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'

/** 메뉴별 권한 저장 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const store = String(body.store || '').trim()
    const name = String(body.name || '').trim()
    const perm = body.perm ?? body.permissions ?? {}
    if (!store || !name) {
      return NextResponse.json(
        { success: false, message: '매장과 이름을 입력해 주세요.' },
        { status: 400 }
      )
    }
    const permissions = typeof perm === 'object' ? JSON.stringify(perm) : '{}'
    await supabaseUpsert(
      'menu_permissions',
      [{ store, name, permissions }],
      'store,name'
    )
    return NextResponse.json({ success: true, message: '메뉴 권한이 저장되었습니다.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('setMenuPermission:', msg)
    return NextResponse.json(
      { success: false, message: '저장 실패: ' + msg },
      { status: 500 }
    )
  }
}

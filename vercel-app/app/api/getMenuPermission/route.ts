import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 메뉴별 권한 조회 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const store = String(searchParams.get('store') || '').trim()
  const name = String(searchParams.get('name') || '').trim()
  if (!store || !name) {
    return NextResponse.json({})
  }
  try {
    const rows = (await supabaseSelectFilter(
      'menu_permissions',
      `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`,
      { limit: 1 }
    )) as { permissions?: string | Record<string, unknown> }[]
    if (rows?.[0]?.permissions) {
      const p = rows[0].permissions
      if (typeof p === 'string') {
        try {
          return NextResponse.json(JSON.parse(p) || {})
        } catch {
          return NextResponse.json({})
        }
      }
      return NextResponse.json(p || {})
    }
    return NextResponse.json({})
  } catch (e) {
    console.error('getMenuPermission:', e)
    return NextResponse.json({})
  }
}

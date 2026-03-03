import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'

/** 품목 카테고리 삭제 - 사용 중인 품목이 있으면 삭제 불가 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as { id?: number; name?: string }
    const id = body.id ? Number(body.id) : 0
    const name = String(body.name || '').trim()

    if (id <= 0 && !name) {
      return NextResponse.json({ success: false, message: 'id 또는 name이 필요합니다.' }, { headers })
    }

    let targetName = name
    if (!targetName && id > 0) {
      const rows = (await supabaseSelectFilter('item_categories', `id=eq.${id}`, { limit: 1, select: 'name' })) as { name?: string }[] | null
      targetName = (rows?.[0]?.name || '').trim()
    }

    if (targetName) {
      const used = (await supabaseSelectFilter('items', `category=eq.${encodeURIComponent(targetName)}`, { limit: 1 })) as unknown[]
      if (used && used.length > 0) {
        return NextResponse.json(
          { success: false, message: '해당 카테고리를 사용 중인 품목이 있어 삭제할 수 없습니다.' },
          { headers }
        )
      }
    }

    const filter = id > 0 ? `id=eq.${id}` : `name=eq.${encodeURIComponent(targetName!)}`
    await supabaseDeleteByFilter('item_categories', filter)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteItemCategory:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { headers }
    )
  }
}

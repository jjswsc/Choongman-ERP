import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdate, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** 품목 카테고리 추가/수정 (이름 변경 시 items.category도 업데이트) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      id?: number
      name?: string
      oldName?: string
      sort_order?: number
    }

    const id = body.id ? Number(body.id) : 0
    const name = String(body.name || '').trim()
    const oldName = String(body.oldName || '').trim()
    const sort_order = Number(body.sort_order) || 0

    if (!name) {
      return NextResponse.json({ success: false, message: '카테고리명이 필요합니다.' }, { headers })
    }

    if (id > 0 && oldName && oldName !== name) {
      await supabaseUpdateByFilter('items', `category=eq.${encodeURIComponent(oldName)}`, { category: name })
      await supabaseUpdate('item_categories', id, { name, sort_order })
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    if (id > 0) {
      const existing = (await supabaseSelectFilter('item_categories', `id=eq.${id}`, { limit: 1, select: 'id,name' })) as { id?: number; name?: string }[] | null
      if (!existing || existing.length === 0) {
        return NextResponse.json({ success: false, message: '존재하지 않는 카테고리입니다.' }, { headers })
      }
      await supabaseUpdate('item_categories', id, { name, sort_order })
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    const dup = (await supabaseSelectFilter('item_categories', `name=eq.${encodeURIComponent(name)}`, { limit: 1 })) as unknown[]
    if (dup && dup.length > 0) {
      return NextResponse.json({ success: false, message: '이미 같은 이름의 카테고리가 있습니다.' }, { headers })
    }

    await supabaseInsert('item_categories', { name, sort_order })
    return NextResponse.json({ success: true, message: '추가되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveItemCategory:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}

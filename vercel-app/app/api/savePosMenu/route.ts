import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

/** POS 메뉴 저장 (등록/수정) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as {
      code?: string
      name?: string
      category?: string
      price?: number
      imageUrl?: string
      vatIncluded?: boolean
      isActive?: boolean
      sortOrder?: number
      id?: string
    }

    const code = String(body.code ?? '').trim()
    const name = String(body.name ?? '').trim()
    const editingId = body.id ? String(body.id).trim() : null

    if (!code || !name) {
      return NextResponse.json(
        { success: false, message: '코드와 메뉴명이 필요합니다.' },
        { headers }
      )
    }

    const row = {
      code,
      name,
      category: String(body.category ?? '').trim(),
      price: Number(body.price) ?? 0,
      image: String(body.imageUrl ?? '').trim(),
      vat_included: body.vatIncluded !== false,
      is_active: body.isActive !== false,
      sort_order: Number(body.sortOrder) ?? 0,
    }

    if (editingId) {
      const existing = (await supabaseSelectFilter(
        'pos_menus',
        `id=eq.${editingId}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing && existing.length > 0) {
        await supabaseUpdateByFilter('pos_menus', `id=eq.${editingId}`, row)
        return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
      }
    }

    const codeExists = (await supabaseSelectFilter(
      'pos_menus',
      `code=eq.${encodeURIComponent(code)}`,
      { limit: 1 }
    )) as { id?: number }[] | null
    if (codeExists && codeExists.length > 0 && !editingId) {
      return NextResponse.json(
        { success: false, message: '이미 존재하는 메뉴 코드입니다.' },
        { headers }
      )
    }

    await supabaseInsert('pos_menus', row)
    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('savePosMenu:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}

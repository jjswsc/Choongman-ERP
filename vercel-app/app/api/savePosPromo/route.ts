import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

/** POS 프로모션 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as {
      id?: string
      code?: string
      name?: string
      category?: string
      price?: number
      priceDelivery?: number | null
      vatIncluded?: boolean
      isActive?: boolean
      sortOrder?: number
    }

    const code = String(body.code ?? '').trim()
    const name = String(body.name ?? '').trim()
    const editingId = body.id ? String(body.id).trim() : null

    if (!code || !name) {
      return NextResponse.json(
        { success: false, message: '코드와 프로모션명이 필요합니다.' },
        { headers }
      )
    }

    const row = {
      code,
      name,
      category: String(body.category ?? '프로모션').trim(),
      price: Number(body.price) ?? 0,
      price_delivery: body.priceDelivery != null ? Number(body.priceDelivery) : null,
      vat_included: body.vatIncluded !== false,
      is_active: body.isActive !== false,
      sort_order: Number(body.sortOrder) ?? 0,
    }

    if (editingId) {
      const existing = (await supabaseSelectFilter(
        'pos_promos',
        `id=eq.${editingId}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing && existing.length > 0) {
        await supabaseUpdateByFilter('pos_promos', `id=eq.${editingId}`, row)
        return NextResponse.json({ success: true, message: '수정되었습니다.', id: editingId }, { headers })
      }
    }

    const codeExists = (await supabaseSelectFilter(
      'pos_promos',
      `code=eq.${encodeURIComponent(code)}`,
      { limit: 1 }
    )) as { id?: number }[] | null
    if (codeExists && codeExists.length > 0 && !editingId) {
      return NextResponse.json(
        { success: false, message: '이미 존재하는 프로모션 코드입니다.' },
        { headers }
      )
    }

    const inserted = await supabaseInsert('pos_promos', row) as { id?: number }[]
    const created = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = created?.id

    return NextResponse.json({ success: true, message: '저장되었습니다.', id: newId ? String(newId) : null }, { headers })
  } catch (e) {
    console.error('savePosPromo:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}

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
      priceDelivery?: number | null
      imageUrl?: string
      vatIncluded?: boolean
      isActive?: boolean
      sortOrder?: number
      optionSelectionGroups?: string[]
      kitchenPrinter?: number | null
      cookingTimeMin?: number | null
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

    const optionSelectionGroups = Array.isArray(body.optionSelectionGroups) && body.optionSelectionGroups.length > 0
      ? body.optionSelectionGroups
      : null
    const kitchenPrinter = body.kitchenPrinter === 1 || body.kitchenPrinter === 2 ? body.kitchenPrinter : null
    const cookingTimeMin = body.cookingTimeMin != null && Number.isFinite(body.cookingTimeMin) && body.cookingTimeMin >= 0 ? body.cookingTimeMin : null
    const baseRow: Record<string, unknown> = {
      code,
      name,
      category: String(body.category ?? '').trim(),
      price: Number(body.price) ?? 0,
      price_delivery: body.priceDelivery != null ? Number(body.priceDelivery) : null,
      image: String(body.imageUrl ?? '').trim(),
      vat_included: body.vatIncluded !== false,
      is_active: body.isActive !== false,
      sort_order: Number(body.sortOrder) ?? 0,
    }
    if (optionSelectionGroups) baseRow.option_selection_groups = optionSelectionGroups
    if (kitchenPrinter != null) baseRow.kitchen_printer = kitchenPrinter
    if (cookingTimeMin != null) baseRow.cooking_time_min = cookingTimeMin

    const doSave = async (row: Record<string, unknown>): Promise<{ success: boolean; message: string; newId?: string }> => {
      if (editingId) {
        const existing = (await supabaseSelectFilter(
          'pos_menus',
          `id=eq.${editingId}`,
          { limit: 1 }
        )) as { id?: number }[] | null
        if (existing && existing.length > 0) {
          await supabaseUpdateByFilter('pos_menus', `id=eq.${editingId}`, row)
          return { success: true, message: '수정되었습니다.' }
        }
      }

      const codeExists = (await supabaseSelectFilter(
        'pos_menus',
        `code=eq.${encodeURIComponent(code)}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (codeExists && codeExists.length > 0 && !editingId) {
        return { success: false, message: '이미 존재하는 메뉴 코드입니다.' }
      }

      const inserted = (await supabaseInsert('pos_menus', row)) as { id?: number }[] | { id?: number }
      const newRow = Array.isArray(inserted) ? inserted[0] : inserted
      const newId = newRow?.id != null ? String(newRow.id) : undefined
      return { success: true, message: '저장되었습니다.', newId }
    }

    try {
      const result = await doSave(baseRow)
      return NextResponse.json(result, { headers })
    } catch (saveErr: unknown) {
      const err = String(saveErr)
      if ((optionSelectionGroups || kitchenPrinter != null || cookingTimeMin != null) && (err.includes('option_selection_groups') || err.includes('kitchen_printer') || err.includes('cooking_time_min') || err.includes('42703'))) {
        const rowWithout = { ...baseRow }
        delete rowWithout.option_selection_groups
        delete rowWithout.kitchen_printer
        delete rowWithout.cooking_time_min
        const result = await doSave(rowWithout)
        return NextResponse.json(result, { headers })
      }
      throw saveErr
    }
  } catch (e) {
    console.error('savePosMenu:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}

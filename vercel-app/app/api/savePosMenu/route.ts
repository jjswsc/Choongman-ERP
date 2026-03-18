import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { recordPriceChanges } from '@/lib/price-history'

/** POS 메뉴 저장 (등록/수정) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as {
      code?: string
      name?: string
      category?: string
      categoryMain?: string
      price?: number
      priceDelivery?: number | null
      imageUrl?: string
      vatIncluded?: boolean
      isActive?: boolean
      sortOrder?: number
      optionSelectionGroups?: string[]
      kitchenPrinter?: number | null
      cookingTimeMin?: number | null
      isBanban?: boolean
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
    const isBanban = body.isBanban === true
    const baseRow: Record<string, unknown> = {
      code,
      name,
      category: String(body.category ?? '').trim(),
      category_main: String(body.categoryMain ?? '').trim(),
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
    baseRow.is_banban = isBanban

    const doSave = async (row: Record<string, unknown>): Promise<{ success: boolean; message: string; newId?: string }> => {
      if (editingId) {
        const existing = (await supabaseSelectFilter(
          'pos_menus',
          `id=eq.${editingId}`,
          { limit: 1 }
        )) as { id?: number; price?: number; price_delivery?: number | null; name?: string; category_main?: string; category?: string; image?: string }[] | null
        if (existing && existing.length > 0) {
          const prev = existing[0]
          // 수정 시 이미지 URL이 비어 있으면 기존 이미지 유지 (폼 리셋/오류로 빈 값 저장 방지)
          const incomingImage = String(body.imageUrl ?? '').trim()
          if (!incomingImage && prev.image != null && String(prev.image).trim()) {
            row.image = String(prev.image).trim()
          }
          const catMain = (prev.category_main || '').trim()
          const cat = (prev.category || '').trim()
          const changes: { fieldName: string; oldValue: number | null; newValue: number | null }[] = []
          const newPrice = Number(row.price ?? prev.price ?? 0)
          const newPriceDelivery = row.price_delivery != null ? Number(row.price_delivery) : null
          if (Number(prev.price) !== newPrice) {
            changes.push({ fieldName: 'price', oldValue: prev.price ?? null, newValue: newPrice })
          }
          if ((prev.price_delivery ?? null) !== newPriceDelivery) {
            changes.push({ fieldName: 'price_delivery', oldValue: prev.price_delivery ?? null, newValue: newPriceDelivery })
          }
          if (changes.length > 0) {
            recordPriceChanges({
              entityType: 'pos_menu',
              entityId: editingId,
              entityDisplayName: prev.name ?? code,
              changes,
              category: cat || undefined,
              categoryMain: catMain || undefined,
            }).catch(() => {})
          }
          try {
            await supabaseUpdateByFilter('pos_menus', `id=eq.${editingId}`, row)
          } catch (colErr: unknown) {
            if (String(colErr).includes('category_main') || String(colErr).includes('42703') || String(colErr).includes('is_banban')) {
              const rowWithout = { ...row } as Record<string, unknown>
              if (String(colErr).includes('category_main')) delete rowWithout.category_main
              if (String(colErr).includes('is_banban')) delete rowWithout.is_banban
              await supabaseUpdateByFilter('pos_menus', `id=eq.${editingId}`, rowWithout)
            } else throw colErr
          }
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

      try {
        const inserted = (await supabaseInsert('pos_menus', row)) as { id?: number }[] | { id?: number }
        const newRow = Array.isArray(inserted) ? inserted[0] : inserted
        const newId = newRow?.id != null ? String(newRow.id) : undefined
        if (newId && (baseRow.price != null || body.price != null)) {
          const catMain = (baseRow.category_main as string || '').trim()
          const cat = (baseRow.category as string || '').trim()
          const initChanges: { fieldName: string; oldValue: number | null; newValue: number | null }[] = []
          const price = Number(baseRow.price ?? body.price ?? 0)
          const priceDelivery = baseRow.price_delivery != null ? Number(baseRow.price_delivery) : (body.priceDelivery != null ? Number(body.priceDelivery) : null)
          initChanges.push({ fieldName: 'price', oldValue: null, newValue: price })
          if (priceDelivery != null) initChanges.push({ fieldName: 'price_delivery', oldValue: null, newValue: priceDelivery })
          recordPriceChanges({
            entityType: 'pos_menu',
            entityId: newId,
            entityDisplayName: name,
            changes: initChanges,
            category: cat || undefined,
            categoryMain: catMain || undefined,
          }).catch(() => {})
        }
        return { success: true, message: '저장되었습니다.', newId }
      } catch (insErr: unknown) {
        if (String(insErr).includes('category_main') || String(insErr).includes('42703')) {
          const { category_main: _cm, ...rowWithout } = row
          const inserted = (await supabaseInsert('pos_menus', rowWithout)) as { id?: number }[] | { id?: number }
          const newRow = Array.isArray(inserted) ? inserted[0] : inserted
          const newId = newRow?.id != null ? String(newRow.id) : undefined
          if (newId && (baseRow.price != null || body.price != null)) {
            const cat = (baseRow.category as string || '').trim()
            const price = Number(baseRow.price ?? body.price ?? 0)
            recordPriceChanges({
              entityType: 'pos_menu',
              entityId: newId,
              entityDisplayName: name,
              changes: [{ fieldName: 'price', oldValue: null, newValue: price }],
              category: cat || undefined,
            }).catch(() => {})
          }
          return { success: true, message: '저장되었습니다.', newId }
        }
        throw insErr
      }
    }

    try {
      const result = await doSave(baseRow)
      if (result.success && code && (baseRow.price != null || body.price != null)) {
        const newPrice = Number(baseRow.price ?? body.price ?? 0)
        try {
          await supabaseUpdateByFilter(
            'items',
            `code=eq.${encodeURIComponent(code)}`,
            { price: newPrice }
          )
        } catch {
          // items에 해당 code가 없으면 무시
        }
      }
      return NextResponse.json(result, { headers })
    } catch (saveErr: unknown) {
      const err = String(saveErr)
      if ((optionSelectionGroups || kitchenPrinter != null || cookingTimeMin != null || isBanban) && (err.includes('option_selection_groups') || err.includes('kitchen_printer') || err.includes('cooking_time_min') || err.includes('is_banban') || err.includes('42703'))) {
        const rowWithout = { ...baseRow }
        delete rowWithout.option_selection_groups
        delete rowWithout.kitchen_printer
        delete rowWithout.cooking_time_min
        delete rowWithout.is_banban
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

import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'

function taxTypeToDb(taxType: string): string {
  if (taxType === 'exempt') return '면세'
  if (taxType === 'zero') return '영세율'
  return '과세'
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      code?: string
      name?: string
      category?: string
      vendor?: string
      outboundLocation?: string
      spec?: string
      unit?: string
      price?: number
      cost?: number
      taxType?: string
      imageUrl?: string
      description?: string
      editingCode?: string
      purchaseSource?: 'hq' | 'store'
    }

    const code = String(body.code || '').trim()
    const name = String(body.name || '').trim()
    const editingCode = body.editingCode ? String(body.editingCode).trim() : null
    if (!code || !name) {
      return NextResponse.json({ success: false, message: '코드와 품목명이 필요합니다.' }, { headers })
    }

    const tax = taxTypeToDb(body.taxType || 'taxable')
    const purchaseSource = (body.purchaseSource || 'hq') === 'store' ? 'store' : 'hq'
    const categoryRaw = String(body.category || '').trim()
    const category = purchaseSource === 'store' && !categoryRaw ? '매장 품목' : categoryRaw
    const row = {
      code,
      name,
      category,
      vendor: String(body.vendor || '').trim(),
      outbound_location: String(body.outboundLocation || '').trim(),
      spec: String(body.spec || '').trim(),
      unit: String(body.unit || '').trim(),
      price: Number(body.price) || 0,
      cost: Number(body.cost) || 0,
      image: String(body.imageUrl || '').trim(),
      description: String(body.description || '').trim() || null,
      tax,
      purchase_source: purchaseSource,
    }

    const filterCode = editingCode || code
    const existing = (await supabaseSelectFilter(
      'items',
      `code=eq.${encodeURIComponent(filterCode)}`
    )) as { id?: number }[] | null

    if (existing && existing.length > 0) {
      await supabaseUpdateByFilter('items', `code=eq.${encodeURIComponent(filterCode)}`, row)
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    await supabaseInsert('items', row)
    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveItem:', e)
    const errMsg = e instanceof Error ? e.message : String(e)
    const isDuplicateCode =
      errMsg.includes('23505') ||
      /duplicate key|unique constraint|items_code/i.test(errMsg)
    const message = isDuplicateCode
      ? `품목 코드 "${code}"가 이미 사용 중입니다. 다른 코드를 입력해 주세요.`
      : errMsg || '저장 실패'
    return NextResponse.json({ success: false, message }, { headers })
  }
}

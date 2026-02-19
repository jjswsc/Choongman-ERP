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
      price?: number
      cost?: number
      taxType?: string
      imageUrl?: string
      editingCode?: string
    }

    const code = String(body.code || '').trim()
    const name = String(body.name || '').trim()
    const editingCode = body.editingCode ? String(body.editingCode).trim() : null
    if (!code || !name) {
      return NextResponse.json({ success: false, message: '코드와 품목명이 필요합니다.' }, { headers })
    }

    const tax = taxTypeToDb(body.taxType || 'taxable')
    const row = {
      code,
      name,
      category: String(body.category || '').trim(),
      vendor: String(body.vendor || '').trim(),
      outbound_location: String(body.outboundLocation || '').trim(),
      spec: String(body.spec || '').trim(),
      price: Number(body.price) || 0,
      cost: Number(body.cost) || 0,
      image: String(body.imageUrl || '').trim(),
      tax,
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
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}

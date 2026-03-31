import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { isSyntheticPosPaymentMethodId } from '@/lib/pos-payment-settings-resolve'

/** POS 결제 수단 항목 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json()
    const rawId = body.id != null ? String(body.id).trim() : ''
    const id = isSyntheticPosPaymentMethodId(rawId) ? '' : rawId
    const storeCode = (body.storeCode ?? body.store_code ?? '').toString().trim() || null
    const category = String(body.category || 'other').trim()
    const validCategory = ['card', 'qr', 'delivery', 'other'].includes(category)
      ? category
      : 'other'
    const name = String(body.name || '').trim()
    const hidden = Boolean(body.hidden)

    if (!name) {
      return NextResponse.json(
        { success: false, message: '이름을 입력하세요.' },
        { status: 400, headers }
      )
    }

    const row = {
      store_code: storeCode,
      category: validCategory,
      name,
      hidden,
      updated_at: new Date().toISOString(),
    }

    if (id) {
      const existing = (await supabaseSelectFilter('pos_payment_method_items', `id=eq.${id}`, {
        limit: 1,
      })) as { id?: number }[] | null
      if (existing?.length) {
        await supabaseUpdate('pos_payment_method_items', existing[0].id!, row)
        return NextResponse.json({ success: true, id: String(existing[0].id) }, { headers })
      }
    }

    const inserted = (await supabaseInsert('pos_payment_method_items', {
      ...row,
      sort_order: 0,
    })) as { id?: number }[] | { id?: number }
    const newId = Array.isArray(inserted) ? inserted[0]?.id : (inserted as { id?: number })?.id
    return NextResponse.json({ success: true, id: String(newId ?? '') }, { headers })
  } catch (e) {
    console.error('savePosPaymentMethodItem:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { status: 500, headers }
    )
  }
}

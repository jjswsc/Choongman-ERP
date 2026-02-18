import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdateByFilter, supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 쿠폰 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const id = body?.id
    const code = String(body?.code ?? '').trim().toUpperCase()
    const name = String(body?.name ?? '').trim()
    const discountType = body?.discountType === 'percent' ? 'percent' : 'amount'
    const discountValue = Math.max(0, Number(body?.discountValue) ?? 0)
    const startDate = body?.startDate?.trim() || null
    const endDate = body?.endDate?.trim() || null
    const maxUses = body?.maxUses != null ? Math.max(0, Number(body.maxUses)) : null
    const isActive = body?.isActive !== false

    if (!code) {
      return NextResponse.json({ success: false, message: '쿠폰 코드를 입력하세요.' }, { headers })
    }

    const row = {
      code,
      name: name || code,
      discount_type: discountType,
      discount_value: discountValue,
      start_date: startDate,
      end_date: endDate,
      max_uses: maxUses,
      is_active: isActive,
    }

    if (id) {
      await supabaseUpdateByFilter('pos_coupons', `id=eq.${id}`, row)
    } else {
      const existing = (await supabaseSelectFilter(
        'pos_coupons',
        `code=eq.${encodeURIComponent(code)}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing?.length) {
        return NextResponse.json({ success: false, message: '이미 존재하는 쿠폰 코드입니다.' }, { headers })
      }
      await supabaseInsert('pos_coupons', row)
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosCoupon:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

/** POS 쿠폰 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await req.json()
    const id = body.id != null ? Number(body.id) : undefined
    const code = String(body.code ?? '').trim().toUpperCase()
    const name = String(body.name ?? '').trim()
    const discountType = body.discountType === 'percent' ? 'percent' : 'fixed'
    const discountValue = Math.max(0, Number(body.discountValue) ?? 0)
    const validFrom = body.validFrom?.trim() || null
    const validTo = body.validTo?.trim() || null
    const isActive = Boolean(body.isActive !== false)

    if (!code) {
      return NextResponse.json({ success: false, message: '쿠폰 코드를 입력하세요.' }, { headers })
    }
    if (discountType === 'percent' && (discountValue < 1 || discountValue > 100)) {
      return NextResponse.json({ success: false, message: '할인율은 1~100입니다.' }, { headers })
    }

    const row = {
      code,
      name: name || code,
      discount_type: discountType,
      discount_value: discountValue,
      valid_from: validFrom,
      valid_to: validTo,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    }

    if (id) {
      const existing = (await supabaseSelectFilter('pos_coupons', `id=eq.${id}`, { limit: 1 })) as unknown[]
      if (!existing?.length) {
        return NextResponse.json({ success: false, message: '쿠폰을 찾을 수 없습니다.' }, { headers })
      }
      const byCode = (await supabaseSelectFilter('pos_coupons', `code=eq.${encodeURIComponent(code)}`, { limit: 2 })) as { id?: number }[]
      if (byCode?.some((r) => r.id !== id)) {
        return NextResponse.json({ success: false, message: '이미 사용 중인 쿠폰 코드입니다.' }, { headers })
      }
      await supabaseUpdate('pos_coupons', id, row)
    } else {
      const byCode = (await supabaseSelectFilter('pos_coupons', `code=eq.${encodeURIComponent(code)}`, { limit: 1 })) as unknown[]
      if (byCode?.length) {
        return NextResponse.json({ success: false, message: '이미 사용 중인 쿠폰 코드입니다.' }, { headers })
      }
      await supabaseInsert('pos_coupons', row)
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosCoupon:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}

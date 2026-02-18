import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 쿠폰 코드 검증 및 할인 금액 계산 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(req.url)
  const code = String(searchParams.get('code') ?? '').trim().toUpperCase()
  const subtotal = Math.max(0, Number(searchParams.get('subtotal') ?? 0))

  if (!code) {
    return NextResponse.json({ valid: false, message: '쿠폰 코드를 입력하세요.' }, { headers })
  }

  try {
    const rows = (await supabaseSelectFilter(
      'pos_coupons',
      `code=eq.${encodeURIComponent(code)}`,
      { limit: 1 }
    )) as {
      id?: number
      code?: string
      name?: string
      discount_type?: string
      discount_value?: number
      valid_from?: string | null
      valid_to?: string | null
      is_active?: boolean
    }[] | null

    const c = rows?.[0]
    if (!c || !c.is_active) {
      return NextResponse.json({ valid: false, message: '유효하지 않거나 만료된 쿠폰입니다.' }, { headers })
    }

    const today = new Date().toISOString().slice(0, 10)
    if (c.valid_from && today < c.valid_from) {
      return NextResponse.json({ valid: false, message: '아직 사용 기간이 아닙니다.' }, { headers })
    }
    if (c.valid_to && today > c.valid_to) {
      return NextResponse.json({ valid: false, message: '사용 기간이 지났습니다.' }, { headers })
    }

    let discountAmt = 0
    if (c.discount_type === 'percent') {
      discountAmt = Math.round(subtotal * (Number(c.discount_value) ?? 0) / 100)
    } else {
      discountAmt = Math.min(subtotal, Math.max(0, Number(c.discount_value) ?? 0))
    }

    return NextResponse.json({
      valid: true,
      couponName: c.name || c.code,
      discountAmt,
      discountReason: `쿠폰: ${c.code}`,
    }, { headers })
  } catch (e) {
    console.error('validatePosCoupon:', e)
    return NextResponse.json({ valid: false, message: '쿠폰 조회 중 오류가 발생했습니다.' }, { headers })
  }
}

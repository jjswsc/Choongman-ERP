import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 쿠폰 코드 검증 (활성·기간·사용횟수 확인) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const code = String(searchParams.get('code') ?? '').trim().toUpperCase()

  if (!code) {
    return NextResponse.json(
      { valid: false, message: '코드를 입력하세요.' },
      { headers }
    )
  }

  try {
    const rows = (await supabaseSelectFilter(
      'pos_coupons',
      `code=eq.${encodeURIComponent(code)}&is_active=eq.true`,
      { limit: 1 }
    )) as {
      id?: number
      code?: string
      name?: string
      discount_type?: string
      discount_value?: number
      start_date?: string | null
      end_date?: string | null
      max_uses?: number | null
      used_count?: number
    }[] | null

    const c = rows?.[0]
    if (!c) {
      return NextResponse.json(
        { valid: false, message: '유효하지 않은 쿠폰입니다.' },
        { headers }
      )
    }

    const today = new Date().toISOString().slice(0, 10)
    if (c.start_date && c.start_date > today) {
      return NextResponse.json(
        { valid: false, message: '아직 사용 기간이 아닙니다.' },
        { headers }
      )
    }
    if (c.end_date && c.end_date < today) {
      return NextResponse.json(
        { valid: false, message: '사용 기간이 만료되었습니다.' },
        { headers }
      )
    }
    if (c.max_uses != null && (c.used_count ?? 0) >= c.max_uses) {
      return NextResponse.json(
        { valid: false, message: '사용 횟수를 초과했습니다.' },
        { headers }
      )
    }

    return NextResponse.json(
      {
        valid: true,
        couponCode: c.code,
        couponName: c.name || c.code,
        discountType: c.discount_type || 'amount',
        discountValue: Number(c.discount_value) ?? 0,
      },
      { headers }
    )
  } catch (e) {
    console.error('validatePosCoupon:', e)
    return NextResponse.json(
      { valid: false, message: '쿠폰 확인 중 오류가 발생했습니다.' },
      { headers }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { validatePosCouponApplication } from '@/lib/pos-coupon-server'

/** POS 쿠폰 코드 검증 및 할인 금액 계산 (단일 — 하위 호환) */
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
    const res = await validatePosCouponApplication({
      subtotal,
      applied: [],
      candidate: { code },
    })
    if (!res.valid) {
      return NextResponse.json({ valid: false, message: res.message || '유효하지 않은 쿠폰입니다.' }, { headers })
    }
    return NextResponse.json(
      {
        valid: true,
        couponName: res.couponName,
        discountAmt: res.discountAmt,
        discountReason: res.discountReason ?? `쿠폰: ${code}`,
        quantity: res.quantity ?? 1,
        couponId: res.couponId,
      },
      { headers }
    )
  } catch (e) {
    console.error('validatePosCoupon:', e)
    return NextResponse.json({ valid: false, message: '쿠폰 조회 중 오류가 발생했습니다.' }, { headers })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import type { PosAppliedCouponLine } from '@/lib/pos-coupon-domain'
import {
  validatePosCouponApplication,
  validatePosCouponApplicationList,
} from '@/lib/pos-coupon-server'

function parseApplied(raw: unknown): PosAppliedCouponLine[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const r = row as Record<string, unknown>
      const code = String(r.code ?? '').trim().toUpperCase()
      if (!code) return null
      return {
        code,
        name: String(r.name ?? code).trim() || code,
        discountAmt: Math.max(0, Number(r.discountAmt ?? 0) || 0),
        quantity: Math.max(1, Math.trunc(Number(r.quantity ?? 1) || 1)),
        couponId: Number(r.couponId ?? 0) || undefined,
      } satisfies PosAppliedCouponLine
    })
    .filter(Boolean) as PosAppliedCouponLine[]
}

function parseCartLines(raw: unknown): Array<{
  menuId?: string
  categoryCode?: string
  quantity: number
  lineSubtotal: number
}> {
  if (!Array.isArray(raw)) return []
  const lines: Array<{
    menuId?: string
    categoryCode?: string
    quantity: number
    lineSubtotal: number
  }> = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const qty = Math.max(1, Math.trunc(Number(r.quantity ?? r.qty ?? 1) || 1))
    lines.push({
      menuId: String(r.menuId ?? r.menu_id ?? '').trim() || undefined,
      categoryCode: String(r.categoryCode ?? r.category_code ?? '').trim() || undefined,
      quantity: qty,
      lineSubtotal: Math.max(
        0,
        Number(
          r.lineSubtotal ??
            r.line_subtotal ??
            ((Number(r.price ?? 0) || 0) * qty)
        ) || 0
      ),
    })
  }
  return lines
}

/** POS 쿠폰 다중 검증 — candidate 추가 또는 applied 목록 재검증 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as Record<string, unknown>
    const subtotal = Math.max(0, Number(body.subtotal ?? 0))
    const manualDiscountAmt = Math.max(0, Number(body.manualDiscountAmt ?? 0))
    const collabDiscountAmt = Math.max(0, Number(body.collabDiscountAmt ?? 0))
    const cartLines = parseCartLines(body.cartLines ?? body.cart_lines ?? body.items)
    const memberId = Math.max(0, Math.trunc(Number(body.memberId ?? 0) || 0)) || undefined
    const applied = parseApplied(body.applied ?? body.appliedCoupons)
    const candidateRaw = body.candidate

    if (candidateRaw && typeof candidateRaw === 'object') {
      const candidate = candidateRaw as { code?: string; quantity?: number; memberIssueId?: number }
      const memberIssueId =
        Math.max(0, Math.trunc(Number(candidate.memberIssueId ?? 0) || 0)) || undefined
      const res = await validatePosCouponApplication({
        subtotal,
        manualDiscountAmt,
        collabDiscountAmt,
        cartLines,
        applied,
        candidate: {
          code: String(candidate.code ?? ''),
          quantity: candidate.quantity,
          ...(memberIssueId ? { memberIssueId } : {}),
        },
        memberId,
      })
      return NextResponse.json(res, { headers })
    }

    const list = await validatePosCouponApplicationList({
      subtotal,
      manualDiscountAmt,
      collabDiscountAmt,
      cartLines,
      appliedCoupons: applied,
      memberId,
    })
    return NextResponse.json(
      {
        valid: true,
        appliedCoupons: list.appliedCoupons,
        couponDiscountTotal: list.couponDiscountTotal,
        couponCode: list.legacy.couponCode,
        couponDiscountAmt: list.legacy.couponDiscountAmt,
      },
      { headers }
    )
  } catch (e) {
    console.error('validatePosCoupons:', e)
    return NextResponse.json({ valid: false, message: '쿠폰 검증 중 오류가 발생했습니다.' }, { headers })
  }
}

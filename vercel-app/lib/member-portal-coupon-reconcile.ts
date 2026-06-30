import { isPosCompletionStatus } from '@/lib/pos-order-policy'
import { parseAppliedCouponsFromOrderRow } from '@/lib/pos-coupon-domain'
import { posOrderPaymentSumFromAmounts } from '@/lib/pos-order-paid-at'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export type PortalCouponIssueRow = {
  id: number
  memberId?: number
  couponCode?: string
  status: string
  orderId?: number | null
  usedAt?: string
}

function normalizeCouponCode(code: string): string {
  return String(code || '').trim().toUpperCase()
}

function isPaidLikeOrder(row: {
  status?: string | null
  total?: number | null
  payment_cash?: number | null
  payment_card?: number | null
  payment_qr?: number | null
  payment_other?: number | null
  payment_delivery_app?: number | null
  paid_at?: string | null
}): boolean {
  const status = String(row.status || '').trim().toLowerCase()
  if (status === 'cancelled' || status === 'canceled' || status === 'refunded') return false
  if (String(row.paid_at || '').trim()) return true
  if (isPosCompletionStatus(status)) return true
  const total = Math.max(0, Number(row.total || 0))
  const paymentSum = posOrderPaymentSumFromAmounts({
    paymentCash: Number(row.payment_cash || 0),
    paymentCard: Number(row.payment_card || 0),
    paymentQr: Number(row.payment_qr || 0),
    paymentOther: Number(row.payment_other || 0),
    paymentDeliveryApp: Number(row.payment_delivery_app || 0),
  })
  return total > 0.02 ? paymentSum >= total - 0.02 : paymentSum > 0
}

function pickIssuedRowForCode(
  issuedRows: PortalCouponIssueRow[],
  couponCode: string,
  memberId: number,
  memberIds: number[],
  used: Map<number, { orderId: number | null }>
): PortalCouponIssueRow | null {
  const code = normalizeCouponCode(couponCode)
  if (!code) return null
  const candidates = issuedRows
    .filter((row) => {
      if (used.has(row.id)) return false
      if (normalizeCouponCode(row.couponCode || '') !== code) return false
      const rowMemberId = Number(row.memberId || 0)
      return rowMemberId === memberId || memberIds.includes(rowMemberId)
    })
    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
  return candidates[0] ?? null
}

async function loadRedemptionsByIssueIds(issueIds: number[]): Promise<Map<number, { orderId: number | null }>> {
  const meta = new Map<number, { orderId: number | null }>()
  const ids = issueIds.map((id) => Number(id || 0)).filter((id) => id > 0)
  if (!ids.length) return meta

  const chunkSize = 80
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    try {
      const rows = (await supabaseSelectFilter(
        'pos_order_coupon_redemptions',
        `member_coupon_issue_id=in.(${chunk.join(',')})`,
        { limit: chunk.length * 5, select: 'member_coupon_issue_id,order_id' }
      )) as Array<{ member_coupon_issue_id?: number | null; order_id?: number | null }>
      for (const row of rows || []) {
        const issueId = Number(row.member_coupon_issue_id || 0)
        if (!issueId) continue
        meta.set(issueId, { orderId: Number(row.order_id || 0) || null })
      }
    } catch {
      /* table may not exist on older DB */
    }
  }
  return meta
}

async function loadRedemptionsByOrderIds(orderIds: number[]): Promise<
  Array<{
    orderId: number
    issueId: number | null
    couponCode: string
  }>
> {
  const out: Array<{ orderId: number; issueId: number | null; couponCode: string }> = []
  const ids = orderIds.map((id) => Number(id || 0)).filter((id) => id > 0)
  if (!ids.length) return out

  const chunkSize = 80
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    try {
      const rows = (await supabaseSelectFilter(
        'pos_order_coupon_redemptions',
        `order_id=in.(${chunk.join(',')})`,
        { limit: chunk.length * 10, select: 'order_id,member_coupon_issue_id,coupon_code' }
      )) as Array<{
        order_id?: number | null
        member_coupon_issue_id?: number | null
        coupon_code?: string | null
      }>
      for (const row of rows || []) {
        const orderId = Number(row.order_id || 0)
        if (!orderId) continue
        out.push({
          orderId,
          issueId: Number(row.member_coupon_issue_id || 0) || null,
          couponCode: normalizeCouponCode(String(row.coupon_code || '')),
        })
      }
    } catch {
      /* ignore */
    }
  }
  return out
}

/** POS 사용 기록·주문 이력으로 아직 issued 로 남은 쿠폰을 used 로 판정 */
export async function buildUsedMemberCouponIssueMap(
  rows: PortalCouponIssueRow[],
  memberIds: number[]
): Promise<Map<number, { orderId: number | null }>> {
  const used = new Map<number, { orderId: number | null }>()
  const issuedRows = rows.filter((row) => String(row.status || '').toLowerCase() === 'issued')
  if (!issuedRows.length) return used

  for (const row of issuedRows) {
    if (Number(row.orderId || 0) > 0 && String(row.usedAt || '').trim()) {
      used.set(row.id, { orderId: Number(row.orderId || 0) || null })
    }
  }

  const issuedIds = issuedRows.map((row) => Number(row.id || 0)).filter((id) => id > 0)
  const direct = await loadRedemptionsByIssueIds(issuedIds)
  for (const [issueId, meta] of direct) used.set(issueId, meta)

  const filterMemberIds = memberIds.map((id) => Number(id || 0)).filter((id) => id > 0)
  if (!filterMemberIds.length) return used

  let orderRows: Array<{
    id?: number
    member_id?: number | null
    coupon_code?: string | null
    applied_coupons?: unknown
    status?: string | null
    total?: number | null
    payment_cash?: number | null
    payment_card?: number | null
    payment_qr?: number | null
    payment_other?: number | null
    payment_delivery_app?: number | null
    paid_at?: string | null
  }> = []

  try {
    orderRows = (await supabaseSelectFilter('pos_orders', `member_id=in.(${filterMemberIds.join(',')})`, {
      limit: 400,
      order: 'id.desc',
      select:
        'id,member_id,coupon_code,applied_coupons,status,total,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,paid_at',
    })) as typeof orderRows
  } catch {
    return used
  }

  const paidOrders = (orderRows || []).filter((order) => {
    const hasCoupon =
      normalizeCouponCode(String(order.coupon_code || '')) ||
      parseAppliedCouponsFromOrderRow(order.applied_coupons).length > 0
    return hasCoupon && isPaidLikeOrder(order)
  })

  const orderIds = paidOrders.map((order) => Number(order.id || 0)).filter((id) => id > 0)
  const redemptionRows = await loadRedemptionsByOrderIds(orderIds)

  for (const redemption of redemptionRows) {
    if (redemption.issueId && issuedIds.includes(redemption.issueId)) {
      used.set(redemption.issueId, { orderId: redemption.orderId })
      continue
    }
    const order = paidOrders.find((row) => Number(row.id || 0) === redemption.orderId)
    const orderMemberId = Number(order?.member_id || 0)
    if (!orderMemberId || !redemption.couponCode) continue
    const match = pickIssuedRowForCode(issuedRows, redemption.couponCode, orderMemberId, filterMemberIds, used)
    if (match) used.set(match.id, { orderId: redemption.orderId })
  }

  for (const order of paidOrders) {
    const orderId = Number(order.id || 0)
    const orderMemberId = Number(order.member_id || 0)
    if (!orderId || !orderMemberId) continue

    const applied = parseAppliedCouponsFromOrderRow(order.applied_coupons)
    for (const line of applied) {
      const issueId = Number(line.memberCouponIssueId || 0)
      if (issueId > 0 && issuedIds.includes(issueId)) {
        used.set(issueId, { orderId })
        continue
      }
      const code = normalizeCouponCode(line.code)
      if (!code) continue
      const match = pickIssuedRowForCode(issuedRows, code, orderMemberId, filterMemberIds, used)
      if (match) used.set(match.id, { orderId })
    }

    if (!applied.length) {
      const legacyCode = normalizeCouponCode(String(order.coupon_code || ''))
      if (!legacyCode) continue
      const match = pickIssuedRowForCode(issuedRows, legacyCode, orderMemberId, filterMemberIds, used)
      if (match) used.set(match.id, { orderId })
    }
  }

  return used
}

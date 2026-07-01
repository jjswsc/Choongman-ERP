import { couponIssueEligibleForOrderTime } from '@/lib/member-portal-coupon-status'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

export type CouponIssueRepairRow = {
  id: number
  memberId?: number
  couponCode?: string
  status: string
  issuedAt?: string
  orderId?: number | null
  usedAt?: string
}

const DUPLICATE_FALSE_USED_REASON = 'duplicate_false_used'
const SINGLE_FALSE_POSITIVE_REASON = 'false_positive_order_link'

function normalizeCouponCode(code: string): string {
  return String(code || '').trim().toUpperCase()
}

function groupKey(row: CouponIssueRepairRow): string {
  return `${Number(row.memberId || 0)}|${normalizeCouponCode(row.couponCode || '')}|${Number(row.orderId || 0)}`
}

async function loadOrderPaidAtById(orderIds: number[]): Promise<Map<number, string>> {
  const orderPaidAtById = new Map<number, string>()
  const chunkSize = 80
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize)
    try {
      const orderRows = (await supabaseSelectFilter('pos_orders', `id=in.(${chunk.join(',')})`, {
        limit: chunk.length,
        select: 'id,paid_at,created_at',
      })) as Array<{ id?: number; paid_at?: string | null; created_at?: string | null }>
      for (const order of orderRows || []) {
        const id = Number(order.id || 0)
        if (!id) continue
        const paid = String(order.paid_at || '').trim()
        const created = String(order.created_at || '').trim()
        const comparable = (paid || created).replace('T', ' ').slice(0, 19)
        if (comparable) orderPaidAtById.set(id, comparable)
      }
    } catch {
      /* ignore */
    }
  }
  return orderPaidAtById
}

async function cancelIssueRow(id: number, reason: string): Promise<void> {
  await supabaseUpdateByFilter('member_coupon_issues', `id=eq.${id}`, {
    status: 'cancelled',
    used_at: null,
    order_id: null,
    restore_reason: reason.slice(0, 120),
  })
}

async function revertIssueRowToIssued(id: number): Promise<void> {
  await supabaseUpdateByFilter('member_coupon_issues', `id=eq.${id}`, {
    status: 'issued',
    used_at: null,
    order_id: null,
  })
}

/**
 * 동일 주문에 잘못 묶인 used 중복은 취소하고,
 * 단일 false-positive(발급이 주문보다 늦음)만 issued 로 복원한다.
 */
export async function repairFalsePositiveAndDuplicateUsedCouponIssues<T extends CouponIssueRepairRow>(
  rows: T[]
): Promise<T[]> {
  const suspects = rows.filter((row) => {
    if (String(row.status || '').toLowerCase() !== 'used') return false
    return Number(row.orderId || 0) > 0 && String(row.issuedAt || '').trim()
  })
  if (!suspects.length) return rows

  const orderIds = [...new Set(suspects.map((row) => Number(row.orderId || 0)).filter((id) => id > 0))]
  const orderPaidAtById = await loadOrderPaidAtById(orderIds)

  const groups = new Map<string, T[]>()
  for (const row of suspects) {
    const key = groupKey(row)
    const bucket = groups.get(key) || []
    bucket.push(row)
    groups.set(key, bucket)
  }

  const cancelIds = new Set<number>()
  const revertToIssuedIds = new Set<number>()

  for (const group of groups.values()) {
    const orderId = Number(group[0]?.orderId || 0)
    const orderPaidAt = orderPaidAtById.get(orderId) || ''
    if (!orderPaidAt) continue

    if (group.length > 1) {
      const eligible = group
        .filter((row) => couponIssueEligibleForOrderTime(row.issuedAt, orderPaidAt))
        .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
      if (!eligible.length) {
        for (const row of group) cancelIds.add(Number(row.id || 0))
        continue
      }
      const keepId = Number(eligible[0]?.id || 0)
      for (const row of group) {
        const id = Number(row.id || 0)
        if (id && id !== keepId) cancelIds.add(id)
      }
      continue
    }

    const row = group[0]
    if (!couponIssueEligibleForOrderTime(row.issuedAt, orderPaidAt)) {
      revertToIssuedIds.add(Number(row.id || 0))
    }
  }

  for (const id of cancelIds) {
    try {
      await cancelIssueRow(id, DUPLICATE_FALSE_USED_REASON)
    } catch {
      /* ignore */
    }
  }
  for (const id of revertToIssuedIds) {
    try {
      await revertIssueRowToIssued(id)
    } catch {
      /* ignore */
    }
  }

  return rows
    .map((row) => {
      const id = Number(row.id || 0)
      if (cancelIds.has(id)) {
        return { ...row, status: 'cancelled', usedAt: '', orderId: null }
      }
      if (revertToIssuedIds.has(id)) {
        return { ...row, status: 'issued', usedAt: '', orderId: null }
      }
      return row
    })
    .filter((row) => String(row.status || '').toLowerCase() !== 'cancelled')
}

export { DUPLICATE_FALSE_USED_REASON, SINGLE_FALSE_POSITIVE_REASON }

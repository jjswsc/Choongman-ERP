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
const DUPLICATE_ISSUED_REASON = 'duplicate_issued_collapse'

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
        // UTC ISO 원문을 유지 — couponIssueEligibleForOrderTime 이 방콕 벽시계로 변환한다.
        // 여기서 T/Z 를 잘라 내면 UTC 시각이 방콕 naive 로 오인된다.
        const paid = String(order.paid_at || '').trim()
        const created = String(order.created_at || '').trim()
        const comparable = paid || created
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

function memberCodeKey(row: CouponIssueRepairRow): string {
  return `${Number(row.memberId || 0)}|${normalizeCouponCode(row.couponCode || '')}`
}

/**
 * 같은 회원·쿠폰코드의 issued 행이 2개 이상이면(중복 발급 잔재) 가장 최근 1건만 남기고
 * 나머지는 취소한다. 업무 규칙상 코드당 활성(issued) 쿠폰은 1장이어야 한다.
 */
async function collapseDuplicateIssuedCouponIssues<T extends CouponIssueRepairRow>(
  rows: T[]
): Promise<{ rows: T[]; cancelledIds: Set<number> }> {
  const cancelledIds = new Set<number>()
  const issuedByKey = new Map<string, T[]>()
  for (const row of rows) {
    if (String(row.status || '').toLowerCase() !== 'issued') continue
    if (!Number(row.memberId || 0) || !normalizeCouponCode(row.couponCode || '')) continue
    const key = memberCodeKey(row)
    const bucket = issuedByKey.get(key) || []
    bucket.push(row)
    issuedByKey.set(key, bucket)
  }

  for (const bucket of issuedByKey.values()) {
    if (bucket.length <= 1) continue
    const sorted = [...bucket].sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    const [, ...extras] = sorted
    for (const row of extras) cancelledIds.add(Number(row.id || 0))
  }

  for (const id of cancelledIds) {
    try {
      await cancelIssueRow(id, DUPLICATE_ISSUED_REASON)
    } catch {
      /* ignore */
    }
  }

  return { rows, cancelledIds }
}

/** POS 사용·지갑 표시와 맞추기 위해 같은 회원·코드의 다른 issued 행을 취소한다. */
export async function cancelOtherIssuedMemberCouponIssues(params: {
  keepIssueId: number
  memberIds: number[]
  couponCode: string
  reason?: string
}): Promise<number> {
  const keepId = Number(params.keepIssueId || 0)
  const code = normalizeCouponCode(params.couponCode)
  const memberIds = params.memberIds.map((id) => Number(id || 0)).filter((id) => id > 0)
  const reason = String(params.reason || DUPLICATE_ISSUED_REASON).slice(0, 120)
  if (!keepId || !code || !memberIds.length) return 0

  let cancelledCount = 0
  for (const memberId of memberIds) {
    try {
      const rows = (await supabaseSelectFilter(
        'member_coupon_issues',
        `member_id=eq.${memberId}&coupon_code=eq.${encodeURIComponent(code)}&status=eq.issued`,
        { limit: 100, select: 'id' }
      )) as Array<{ id?: number }>
      for (const row of rows || []) {
        const id = Number(row.id || 0)
        if (!id || id === keepId) continue
        await cancelIssueRow(id, reason)
        cancelledCount += 1
      }
    } catch {
      /* ignore */
    }
  }
  return cancelledCount
}

/**
 * 동일 주문에 잘못 묶인 used 중복은 취소하고,
 * 단일 false-positive(발급이 주문보다 늦음)만 issued 로 복원한다.
 * 마지막으로 같은 코드의 issued 중복은 최신 1건만 남긴다.
 */
export async function repairFalsePositiveAndDuplicateUsedCouponIssues<T extends CouponIssueRepairRow>(
  inputRows: T[]
): Promise<T[]> {
  const rows = inputRows
  const suspects = rows.filter((row) => {
    if (String(row.status || '').toLowerCase() !== 'used') return false
    return Number(row.orderId || 0) > 0 && String(row.issuedAt || '').trim()
  })

  const cancelIds = new Set<number>()
  const revertToIssuedIds = new Set<number>()

  if (suspects.length) {
    const orderIds = [...new Set(suspects.map((row) => Number(row.orderId || 0)).filter((id) => id > 0))]
    const orderPaidAtById = await loadOrderPaidAtById(orderIds)

    const groups = new Map<string, T[]>()
    for (const row of suspects) {
      const key = groupKey(row)
      const bucket = groups.get(key) || []
      bucket.push(row)
      groups.set(key, bucket)
    }

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
  }

  const afterUsedRepair = rows.map((row) => {
    const id = Number(row.id || 0)
    if (cancelIds.has(id)) {
      return { ...row, status: 'cancelled', usedAt: '', orderId: null }
    }
    if (revertToIssuedIds.has(id)) {
      return { ...row, status: 'issued', usedAt: '', orderId: null }
    }
    return row
  })

  const { cancelledIds: issuedDupIds } = await collapseDuplicateIssuedCouponIssues(afterUsedRepair)

  return afterUsedRepair
    .map((row) =>
      issuedDupIds.has(Number(row.id || 0)) ? { ...row, status: 'cancelled', usedAt: '', orderId: null } : row
    )
    .filter((row) => String(row.status || '').toLowerCase() !== 'cancelled')
}

export { DUPLICATE_FALSE_USED_REASON, SINGLE_FALSE_POSITIVE_REASON, DUPLICATE_ISSUED_REASON }

import 'server-only'

import type { JwtPayload } from '@/lib/jwt-auth'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { addDaysYmd, getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { loadPosBusinessHoursForServer } from '@/lib/pos-business-day-server'
import { authCanAccessPosStoreWrite } from '@/lib/pos-store-access-server'
import { isPosOrderMergedAbsorb } from '@/lib/pos-order-merge'
import { appendPosInternalMemoStamp } from '@/lib/pos-tax-invoice'
import {
  resolveAttachMemberAfterPayEligibility,
} from '@/lib/pos-attach-member-after-pay'
import { applyLoyaltyOnOrder, getMemberSummaryById } from '@/lib/members-server'
import { resolveMembersTenantScope } from '@/lib/members-tenant-scope'
import { notifyMemberPointLineForPaidOrder } from '@/lib/member-point-line-notify'
import { roundMemberPointsEarn } from '@/lib/member-points-math'
import {
  supabaseSelectFilterStrippingUnknownColumns,
  supabaseUpdateByFilterWithPgrst204Fallback,
} from '@/lib/supabase-pgrst204-retry'

export class AttachMemberAfterPayError extends Error {
  constructor(
    public code: string,
    public httpStatus = 400
  ) {
    super(code)
    this.name = 'AttachMemberAfterPayError'
  }
}

type PosOrderAttachRow = {
  id?: number
  order_no?: string | null
  store_code?: string | null
  status?: string | null
  total?: number | null
  created_at?: string | null
  paid_at?: string | null
  memo?: string | null
  order_type?: string | null
  created_by?: string | null
  member_id?: number | null
  member_no?: string | null
  point_earned?: number | null
  point_used?: number | null
  payment_cash?: number | null
  payment_card?: number | null
  payment_qr?: number | null
  payment_other?: number | null
  payment_delivery_app?: number | null
}

function sanitizeStampName(raw: string): string {
  return String(raw || '')
    .replace(/[\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

function bangkokYmdFromIso(raw: string | null | undefined): string {
  const iso = String(raw || '').trim()
  if (!iso) return ''
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return getBangkokTodayDateString(dt)
}

export async function attachMemberAndEarnPointsAfterPay(params: {
  orderId: number
  memberId: number
  caller: JwtPayload
}): Promise<{
  pointEarned: number
  memberNo: string
  memberName: string
  alreadyApplied: boolean
}> {
  const orderId = Math.trunc(Number(params.orderId || 0))
  const memberId = Math.trunc(Number(params.memberId || 0))
  if (orderId <= 0) throw new AttachMemberAfterPayError('id_required')
  if (memberId <= 0) throw new AttachMemberAfterPayError('member_required')

  const rows = (await supabaseSelectFilterStrippingUnknownColumns(
    'pos_orders',
    `id=eq.${orderId}`,
    {
      limit: 1,
      select:
        'id,order_no,store_code,status,total,created_at,paid_at,memo,order_type,created_by,member_id,member_no,point_earned,point_used,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app',
    },
    'attachPosOrderMember'
  )) as PosOrderAttachRow[] | null
  const order = rows?.[0]
  if (!order?.id) throw new AttachMemberAfterPayError('not_found', 404)

  const storeCode = String(order.store_code || '').trim()
  if (!(await authCanAccessPosStoreWrite(params.caller, storeCode))) {
    throw new AttachMemberAfterPayError('forbidden_store', 403)
  }

  const tenantScope = await resolveMembersTenantScope({
    auth: params.caller,
    storeCode,
  })
  const member = await getMemberSummaryById(memberId, tenantScope)
  if (!member) throw new AttachMemberAfterPayError('member_not_found')
  if (String(member.status || '').trim().toLowerCase() !== 'active') {
    throw new AttachMemberAfterPayError('member_inactive')
  }

  const businessHours = await loadPosBusinessHoursForServer(storeCode)
  const createdAt = order.created_at ? new Date(order.created_at) : null
  const orderBd =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? getPosBusinessDateStrFromConfig(createdAt, businessHours)
      : ''
  const todayBd = getPosBusinessDateStrFromConfig(new Date(), businessHours)
  const yesterdayBd = todayBd ? addDaysYmd(todayBd, -1) : ''
  const eligibility = resolveAttachMemberAfterPayEligibility({
    status: order.status,
    total: order.total,
    paymentCash: order.payment_cash,
    paymentCard: order.payment_card,
    paymentQr: order.payment_qr,
    paymentOther: order.payment_other,
    paymentDeliveryApp: order.payment_delivery_app,
    memberId: order.member_id,
    memberNo: order.member_no,
    pointEarned: order.point_earned,
    pointUsed: order.point_used,
    mergedAbsorb: isPosOrderMergedAbsorb(order.memo),
    orderBusinessDay: orderBd,
    todayBusinessDay: todayBd,
    yesterdayBusinessDay: yesterdayBd,
  })
  if (!eligibility.canAttach && !eligibility.canRetry) {
    throw new AttachMemberAfterPayError(eligibility.code)
  }

  const existingMemberId = Math.max(0, Math.trunc(Number(order.member_id || 0)))
  const existingMemberNo = String(order.member_no || '').trim()
  if (existingMemberId > 0 && existingMemberId !== memberId) {
    throw new AttachMemberAfterPayError('already_member')
  }
  if (
    existingMemberId <= 0 &&
    existingMemberNo &&
    existingMemberNo !== String(member.memberNo || '').trim()
  ) {
    throw new AttachMemberAfterPayError('already_member')
  }

  const memberNo = String(member.memberNo || '').trim()
  const memberName = String(member.fullName || member.name || '').trim()
  const staff = sanitizeStampName(params.caller.name || params.caller.employeeCode || '')
  const stamp = `[MEMBER_ATTACH_AFTER_PAY ${new Date().toISOString()}${staff ? ` ${staff}` : ''}] member_id=${memberId}${memberNo ? ` member_no=${memberNo}` : ''}`
  const shouldStamp = eligibility.canAttach
  const nextMemo = shouldStamp ? appendPosInternalMemoStamp(order.memo, stamp) : String(order.memo || '')

  await supabaseUpdateByFilterWithPgrst204Fallback(
    'pos_orders',
    `id=eq.${orderId}`,
    {
      member_id: memberId,
      member_no: memberNo || null,
      ...(shouldStamp ? { memo: nextMemo } : {}),
    },
    'attachPosOrderMember'
  )

  const orderAtYmd =
    bangkokYmdFromIso(order.paid_at) || bangkokYmdFromIso(order.created_at) || getBangkokTodayDateString()
  const loyalty = await applyLoyaltyOnOrder({
    memberId,
    orderId,
    storeCode,
    totalAmount: Math.max(0, Number(order.total || 0)),
    pointUsed: roundMemberPointsEarn(order.point_used),
    orderNo: String(order.order_no || ''),
    orderType: String(order.order_type || ''),
    createdBy: String(order.created_by || ''),
    orderAtYmd,
  })
  const pointEarned = roundMemberPointsEarn(loyalty.pointEarned)
  const priorEarned = roundMemberPointsEarn(order.point_earned)
  if (pointEarned > 0 && pointEarned !== priorEarned) {
    await supabaseUpdateByFilterWithPgrst204Fallback(
      'pos_orders',
      `id=eq.${orderId}`,
      { point_earned: pointEarned },
      'attachPosOrderMember.point'
    )
  }

  try {
    await notifyMemberPointLineForPaidOrder({
      orderId,
      memberId,
      storeCode,
      orderNo: String(order.order_no || ''),
    })
  } catch (notifyErr) {
    console.warn('attachPosOrderMember point notify:', notifyErr)
  }

  return {
    pointEarned,
    memberNo: memberNo || String((loyalty as { memberNo?: string }).memberNo || ''),
    memberName,
    alreadyApplied: priorEarned > 0 && pointEarned === priorEarned,
  }
}

/** 회원앱 QR 선결제 대기 — pos_orders.memo 태그 */
export const MEMBER_PORTAL_PAYMENT_PENDING_TAG = '[결제대기]'
export const MEMBER_PORTAL_PAYMENT_EXPIRED_TAG = '[결제만료]'

export function isMemberPortalPaymentPendingOrder(row: {
  memo?: string | null
  status?: string | null
  payment_qr?: number | null
  created_by?: string | null
}): boolean {
  const memo = String(row.memo || '')
  if (!memo.includes(MEMBER_PORTAL_PAYMENT_PENDING_TAG)) return false
  if (memo.includes(MEMBER_PORTAL_PAYMENT_EXPIRED_TAG)) return false
  const createdBy = String(row.created_by || '')
  if (createdBy && !createdBy.startsWith('member_portal:')) return false
  if (!createdBy && !memo.includes('[회원주문]')) return false
  const status = String(row.status || '').trim().toLowerCase()
  if (status === 'paid' || status === 'completed') return false
  if (status === 'cancelled' || status === 'canceled') return false
  const paymentQr = Math.max(0, Number(row.payment_qr || 0))
  return paymentQr <= 0.0001
}

export function stripMemberPortalPaymentPendingTag(memo: string): string {
  return String(memo || '')
    .split(' · ')
    .map((part) => part.trim())
    .filter((part) => part && part !== MEMBER_PORTAL_PAYMENT_PENDING_TAG)
    .join(' · ')
}

import { MEMBER_PORTAL_PREPAY_MIN_QR_BAHT } from '@/lib/member-portal-prepay-config'

export type MemberPortalCheckoutAmounts = {
  pointUsed: number
  qrAmount: number
  requiresQr: boolean
}

/**
 * 포인트 = 할인(POS 동일). QR은 할인 후 잔액, 최소 {@link MEMBER_PORTAL_PREPAY_MIN_QR_BAHT} 바트.
 */
export function resolveMemberPortalPointAndQr(params: {
  totalBeforePoints: number
  pointBalance: number
  requestedPointUsed: number
  minQrBaht?: number
}): MemberPortalCheckoutAmounts {
  const minQr = Math.max(0, Number(params.minQrBaht ?? MEMBER_PORTAL_PREPAY_MIN_QR_BAHT))
  const total = Math.max(0, Math.round(Number(params.totalBeforePoints || 0) * 100) / 100)
  const balance = Math.max(0, Math.trunc(Number(params.pointBalance || 0)))
  const requested = Math.max(0, Math.trunc(Number(params.requestedPointUsed || 0)))

  let pointUsed = Math.min(requested, balance, Math.trunc(total))
  let qrAmount = Math.round((total - pointUsed) * 100) / 100

  if (qrAmount <= 0.0001) {
    return { pointUsed, qrAmount: 0, requiresQr: false }
  }

  if (qrAmount >= minQr - 0.0001) {
    return { pointUsed, qrAmount, requiresQr: true }
  }

  // 0 < qrAmount < minQr → 포인트를 줄여 QR을 minQr 이상으로
  const maxPointForMinQr = Math.max(0, Math.trunc(total - minQr))
  pointUsed = Math.min(pointUsed, maxPointForMinQr, balance)
  qrAmount = Math.round((total - pointUsed) * 100) / 100

  if (qrAmount <= 0.0001) {
    return { pointUsed, qrAmount: 0, requiresQr: false }
  }

  return { pointUsed, qrAmount, requiresQr: true }
}

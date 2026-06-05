/** 회원 쿠폰 POS 스캔용 QR 페이로드 (회원번호 + 쿠폰코드 + 발급 ID) */
export const MEMBER_COUPON_QR_PREFIX = 'CM|CPN|'

export type MemberCouponQrPayload = {
  memberNo: string
  couponCode: string
  issueId?: number
}

export function buildMemberCouponQrPayload(params: {
  memberNo: string
  couponCode: string
  issueId?: number
}): string {
  const memberNo = String(params.memberNo ?? '').trim()
  const couponCode = String(params.couponCode ?? '').trim().toUpperCase()
  const issueId = Math.max(0, Math.trunc(Number(params.issueId ?? 0) || 0))
  if (!memberNo || !couponCode) return ''
  if (issueId > 0) return `${MEMBER_COUPON_QR_PREFIX}${memberNo}|${couponCode}|${issueId}`
  return `${MEMBER_COUPON_QR_PREFIX}${memberNo}|${couponCode}`
}

export function parseMemberCouponQrPayload(raw: string): MemberCouponQrPayload | null {
  const text = String(raw ?? '').trim()
  if (!text) return null

  const normalized = text.startsWith(MEMBER_COUPON_QR_PREFIX)
    ? text.slice(MEMBER_COUPON_QR_PREFIX.length)
    : text.startsWith('CM:CPN:')
      ? text.slice('CM:CPN:'.length)
      : null

  if (normalized != null) {
    const parts = normalized.split('|').map((p) => p.trim())
    const memberNo = parts[0] || ''
    const couponCode = String(parts[1] || '').trim().toUpperCase()
    const issueId = parts[2] ? Math.trunc(Number(parts[2])) : undefined
    if (!memberNo || !couponCode) return null
    return { memberNo, couponCode, issueId: issueId && issueId > 0 ? issueId : undefined }
  }

  return null
}

export function isMemberCouponQrPayload(raw: string): boolean {
  const text = String(raw ?? '').trim()
  return text.startsWith(MEMBER_COUPON_QR_PREFIX) || text.startsWith('CM:CPN:')
}

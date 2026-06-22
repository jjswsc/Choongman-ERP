/** 회원 쿠폰 POS 스캔용 QR 페이로드 (회원번호 + 쿠폰코드 + 발급 ID) */
export const MEMBER_COUPON_QR_PREFIX = 'CM|CPN|'

/** USB 스캐너가 `|` 대신 `~`·`-` 등으로 출력하는 경우가 많음 */
export const MEMBER_COUPON_QR_PREFIX_RE = /^CM[\|~:\-]CPN[\|~:\-]/i

const MEMBER_COUPON_QR_FIELD_SPLIT_RE = /[\|~:\-]+/

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

function extractMemberCouponQrBody(text: string): string | null {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return null
  if (MEMBER_COUPON_QR_PREFIX_RE.test(trimmed)) {
    return trimmed.replace(MEMBER_COUPON_QR_PREFIX_RE, '')
  }
  if (trimmed.startsWith('CM:CPN:')) {
    return trimmed.slice('CM:CPN:'.length)
  }
  return null
}

export function parseMemberCouponQrPayload(raw: string): MemberCouponQrPayload | null {
  const body = extractMemberCouponQrBody(raw)
  if (body == null) return null

  const parts = body.split(MEMBER_COUPON_QR_FIELD_SPLIT_RE).map((p) => p.trim()).filter(Boolean)
  const memberNo = parts[0] || ''
  const couponCode = String(parts[1] || '').trim().toUpperCase()
  const issueId = parts[2] ? Math.trunc(Number(parts[2])) : undefined
  if (!memberNo || !couponCode) return null
  return { memberNo, couponCode, issueId: issueId && issueId > 0 ? issueId : undefined }
}

export function isMemberCouponQrPayload(raw: string): boolean {
  const text = String(raw ?? '').trim()
  return MEMBER_COUPON_QR_PREFIX_RE.test(text) || text.startsWith('CM:CPN:')
}

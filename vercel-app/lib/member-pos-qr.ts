import {
  isMemberCouponQrPayload,
  normalizeCouponScanDelimiters,
  parseLooseMemberCouponScanInput,
} from '@/lib/member-coupon-qr'

/** POS·회원앱 회원 식별 QR (회원번호 단독 또는 CM|MEM|회원번호) */
export const MEMBER_POS_QR_PREFIX = 'CM|MEM|'

export const MEMBER_POS_QR_PREFIX_RE = /^CM[\|~:\-]MEM[\|~:\-]/i

const MEMBER_POS_QR_FIELD_SPLIT_RE = /[\|~:\-\uFF5E\u223C\u02DC\u2053\x1D\x1E;]+/

export type MemberPosScanPayload = {
  memberNo: string
}

function normalizeMemberNoToken(token: string): string | null {
  const value = String(token ?? '').trim().toUpperCase()
  if (!value) return null
  if (/^M\d{4,}$/.test(value)) return value
  if (/^CM\d{4,}$/.test(value)) return value
  return null
}

export function parseMemberPosScanInput(raw: string): MemberPosScanPayload | null {
  const text = normalizeCouponScanDelimiters(String(raw ?? '').trim())
  if (!text) return null

  let body = text
  if (MEMBER_POS_QR_PREFIX_RE.test(text)) {
    body = text.replace(MEMBER_POS_QR_PREFIX_RE, '')
  } else if (text.toUpperCase().startsWith('CM:MEM:')) {
    body = text.slice('CM:MEM:'.length)
  } else if (parseLooseMemberCouponScanInput(text) || isMemberCouponQrPayload(text)) {
    return null
  }

  const firstField = body.split(MEMBER_POS_QR_FIELD_SPLIT_RE).map((p) => p.trim()).filter(Boolean)[0] || ''
  const memberNo = normalizeMemberNoToken(firstField)
  if (!memberNo) return null
  return { memberNo }
}

export function isMemberPosScanPayload(raw: string): boolean {
  return parseMemberPosScanInput(raw) != null
}

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

function splitCouponScanFields(text: string): string[] {
  return text.split(MEMBER_COUPON_QR_FIELD_SPLIT_RE).map((p) => p.trim()).filter(Boolean)
}

function parseTrailingIssueId(parts: string[]): { body: string[]; issueId?: number } {
  if (parts.length < 2) return { body: parts }
  const last = parts[parts.length - 1]!
  const issueId = Math.trunc(Number(last))
  if (issueId > 0 && String(issueId) === last) {
    return { body: parts.slice(0, -1), issueId }
  }
  return { body: parts }
}

/** CM|CPN 헤더 없이 스캐너가 `~` 구분으로 보낸 페이로드 (앞부분 잘림·USB 변환 대응) */
export function parseLooseMemberCouponScanInput(raw: string): MemberCouponQrPayload | null {
  const text = String(raw ?? '').trim()
  if (!text) return null

  const full = parseMemberCouponQrPayload(text)
  if (full) return full

  const parts = splitCouponScanFields(text)
  if (parts.length < 2) return null

  const { body, issueId } = parseTrailingIssueId(parts)
  if (body.length >= 2) {
    const memberNo = body[0]!
    const couponCode = String(body[body.length - 1] ?? '').trim().toUpperCase()
    if (memberNo && couponCode) {
      return { memberNo, couponCode, issueId }
    }
  }

  if (body.length === 1 && issueId) {
    const couponCode = String(body[0] ?? '').trim().toUpperCase()
    if (couponCode) {
      return { memberNo: '', couponCode, issueId }
    }
  }

  if (body.length === 2 && !issueId) {
    const memberNo = body[0]!
    const couponCode = String(body[1] ?? '').trim().toUpperCase()
    if (memberNo && couponCode) {
      return { memberNo, couponCode }
    }
  }

  return null
}

export function isMemberCouponScanPayload(raw: string): boolean {
  return isMemberCouponQrPayload(raw) || parseLooseMemberCouponScanInput(raw) != null
}

/** 스캐너가 앞 `CM` 접두를 잘랐을 때 검증 후보 */
export function expandTruncatedCouponCodeCandidates(code: string): string[] {
  const normalized = String(code ?? '').trim().toUpperCase()
  if (!normalized) return []
  const out = [normalized]
  if (!normalized.startsWith('CM')) out.push(`CM${normalized}`)
  return [...new Set(out)]
}

/** 회원 쿠폰 POS 스캔용 QR 페이로드 (회원번호 + 쿠폰코드 + 발급 ID). Omni는 OM|CPN| */
export const MEMBER_COUPON_QR_PREFIX = 'CM|CPN|'
export const MEMBER_COUPON_QR_PREFIX_OMNI = 'OM|CPN|'

/** USB 스캐너가 `|` 대신 `~`·`-` 등으로 출력하는 경우가 많음 — CM·OM 모두 인식 */
export const MEMBER_COUPON_QR_PREFIX_RE = /^(?:CM|OM)[\|~:\-]CPN[\|~:\-]/i

const MEMBER_COUPON_QR_FIELD_SPLIT_RE = /[\|~:\-\uFF5E\u223C\u02DC\u2053\x1D\x1E;]+/

const MEMBER_POS_QR_PREFIX_RE = /^(?:CM|OM)[\|~:\-]MEM[\|~:\-]/i

function isMemberPosQrPayload(raw: string): boolean {
  const text = normalizeCouponScanDelimiters(String(raw ?? '').trim())
  const upper = text.toUpperCase()
  return (
    MEMBER_POS_QR_PREFIX_RE.test(text) ||
    upper.startsWith('CM:MEM:') ||
    upper.startsWith('OM:MEM:')
  )
}

function memberCouponQrPrefixForBrand(brandKey?: string | null): string {
  const k = String(brandKey || '').trim().toLowerCase()
  return k === 'omnifoodtech' || k === 'omni' || k === 'saas'
    ? MEMBER_COUPON_QR_PREFIX_OMNI
    : MEMBER_COUPON_QR_PREFIX
}

/** 스캐너·키보드가 보내는 다양한 구분 문자를 ASCII `|~:-` 로 통일 */
export function normalizeCouponScanDelimiters(raw: string): string {
  return String(raw ?? '')
    .replace(/[\uFF5E\u223C\u02DC\u2053]/g, '~')
    .replace(/[\u2016\u2223\u2758]/g, '|')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\x1D\x1E]/g, '~')
}

export type MemberCouponQrPayload = {
  memberNo: string
  couponCode: string
  issueId?: number
}

export function buildMemberCouponQrPayload(params: {
  memberNo: string
  couponCode: string
  issueId?: number
  /** omnifoodtech 이면 OM|CPN| (기본 CM|CPN|) */
  brandKey?: string | null
}): string {
  const memberNo = String(params.memberNo ?? '').trim()
  const couponCode = String(params.couponCode ?? '').trim().toUpperCase()
  const issueId = Math.max(0, Math.trunc(Number(params.issueId ?? 0) || 0))
  if (!memberNo || !couponCode) return ''
  const prefix = memberCouponQrPrefixForBrand(params.brandKey)
  if (issueId > 0) return `${prefix}${memberNo}|${couponCode}|${issueId}`
  return `${prefix}${memberNo}|${couponCode}`
}

function extractMemberCouponQrBody(text: string): string | null {
  const trimmed = normalizeCouponScanDelimiters(String(text ?? '').trim())
  if (!trimmed) return null
  if (MEMBER_COUPON_QR_PREFIX_RE.test(trimmed)) {
    return trimmed.replace(MEMBER_COUPON_QR_PREFIX_RE, '')
  }
  const upper = trimmed.toUpperCase()
  if (upper.startsWith('CM:CPN:')) {
    return trimmed.slice('CM:CPN:'.length)
  }
  if (upper.startsWith('OM:CPN:')) {
    return trimmed.slice('OM:CPN:'.length)
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
  const upper = text.toUpperCase()
  return (
    MEMBER_COUPON_QR_PREFIX_RE.test(text) ||
    upper.startsWith('CM:CPN:') ||
    upper.startsWith('OM:CPN:')
  )
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
  const text = normalizeCouponScanDelimiters(String(raw ?? '').trim())
  if (!text) return null

  if (isMemberPosQrPayload(text)) return null

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

/** CM|CPN QR 본문 필드 수 (memberNo, couponCode, issueId…) */
export function countMemberCouponQrBodyFields(raw: string): number {
  const body = extractMemberCouponQrBody(raw)
  if (body == null) return 0
  return splitCouponScanFields(body).length
}

/**
 * USB 웨지 스캔 중 CM|CPN QR이 memberNo+couponCode까지만 읽혀도 parse 가능해
 * issueId(|14 등) 꼬리가 아직 오지 않았을 수 있다.
 */
export function isLikelyIncompleteCouponQrScan(raw: string): boolean {
  const text = normalizeCouponScanDelimiters(String(raw ?? '').trim())
  if (!isMemberCouponQrPayload(text)) return false
  const fields = countMemberCouponQrBodyFields(text)
  if (fields < 2) return true
  const parsed = parseMemberCouponQrPayload(text)
  if (!parsed?.memberNo || !parsed.couponCode) return true
  // 발급 쿠폰 QR은 보통 3필드(memberNo|couponCode|issueId). 2필드만 있으면 꼬리 대기.
  if (fields === 2 && !parsed.issueId) return true
  return false
}

/** 스캐너가 앞 `CM` 접두를 잘랐을 때 검증 후보 */
export function expandTruncatedCouponCodeCandidates(code: string): string[] {
  const normalized = String(code ?? '').trim().toUpperCase()
  if (!normalized) return []
  const out = [normalized]
  if (!normalized.startsWith('CM')) out.push(`CM${normalized}`)
  return [...new Set(out)]
}

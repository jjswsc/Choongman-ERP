import {
  isMemberCouponScanPayload,
  normalizeCouponScanDelimiters,
  parseLooseMemberCouponScanInput,
} from '@/lib/member-coupon-qr'
import { isMemberPosScanPayload, parseMemberPosScanInput } from '@/lib/member-pos-qr'

export type PosScanPreviewKind = 'member' | 'coupon' | 'unknown'

export type PosScanParsePreview = {
  kind: PosScanPreviewKind
  memberNo?: string
  couponCode?: string
  issueId?: number
  summary: string
}

export function previewPosScanPayload(raw: string): PosScanParsePreview {
  const text = normalizeCouponScanDelimiters(String(raw ?? '').trim())
  if (!text) {
    return { kind: 'unknown', summary: '' }
  }

  if (isMemberCouponScanPayload(text)) {
    const parsed = parseLooseMemberCouponScanInput(text)
    if (parsed) {
      const parts = [
        parsed.memberNo ? `memberNo=${parsed.memberNo}` : null,
        parsed.couponCode ? `coupon=${parsed.couponCode}` : null,
        parsed.issueId ? `issueId=${parsed.issueId}` : null,
      ].filter(Boolean)
      return {
        kind: 'coupon',
        memberNo: parsed.memberNo || undefined,
        couponCode: parsed.couponCode,
        issueId: parsed.issueId,
        summary: parts.join(' · '),
      }
    }
  }

  if (isMemberPosScanPayload(text)) {
    const parsed = parseMemberPosScanInput(text)
    if (parsed) {
      return {
        kind: 'member',
        memberNo: parsed.memberNo,
        summary: `memberNo=${parsed.memberNo}`,
      }
    }
  }

  return { kind: 'unknown', summary: text.length > 80 ? `${text.slice(0, 80)}…` : text }
}

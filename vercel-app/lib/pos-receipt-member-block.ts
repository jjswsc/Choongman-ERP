/**
 * 손님 영수증 하단 — 멤버십 QR + 회원·포인트 블록
 */

import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import { formatMemberPointsDisplay, normalizeMemberPoints, roundMemberPointsEarn } from '@/lib/member-points-math'
import { escapeHtml } from '@/lib/utils'

export type PosReceiptMemberSnapshot = {
  memberId?: number
  memberNo?: string
  memberPhone?: string
  memberTierCode?: string
  memberPointEarned?: number
  /** 이 빌 적립분을 제외한 잔여 포인트(영수증 표시용) */
  memberPointBalance?: number
}

export type PosOrderLoyaltyReceiptApiFields = {
  pointEarned?: number
  memberPhone?: string
  memberTierCode?: string
  memberPointBalance?: number
  memberNo?: string
  memberId?: number
}

/** 영수증용 전화 마스킹 — 끝 4자리만 노출 */
export function maskMemberPhoneForReceipt(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length <= 4) return digits
  return `${'X'.repeat(digits.length - 4)}${digits.slice(-4)}`
}

export function formatMemberTierForReceipt(tierCode: string | null | undefined): string {
  const raw = String(tierCode ?? '').trim()
  if (!raw) return 'Member'
  if (/^member$/i.test(raw)) return 'Member'
  return raw
}

export function pickMemberReceiptFieldsFromApi(
  res: PosOrderLoyaltyReceiptApiFields | null | undefined,
  fallback?: { memberId?: number; memberNo?: string }
): PosReceiptMemberSnapshot | null {
  if (!res) return null
  const memberId = Math.max(0, Math.trunc(Number(res.memberId ?? fallback?.memberId ?? 0) || 0))
  const memberNo = String(res.memberNo ?? fallback?.memberNo ?? '').trim()
  const memberPhone = String(res.memberPhone ?? '').trim()
  const memberTierCode = String(res.memberTierCode ?? '').trim()
  const memberPointEarned = roundMemberPointsEarn(res.pointEarned)
  const memberPointBalance = normalizeMemberPoints(res.memberPointBalance)
  const hasMember =
    memberId > 0 ||
    Boolean(memberNo) ||
    Boolean(memberPhone) ||
    Boolean(memberTierCode) ||
    memberPointEarned > 0 ||
    memberPointBalance > 0
  if (!hasMember) return null
  return {
    ...(memberId > 0 ? { memberId } : {}),
    ...(memberNo ? { memberNo } : {}),
    ...(memberPhone ? { memberPhone } : {}),
    ...(memberTierCode ? { memberTierCode } : {}),
    memberPointEarned,
    memberPointBalance,
  }
}

export function mergeMemberReceiptFields(
  receipt: ReceiptModalData,
  member: PosReceiptMemberSnapshot | null | undefined
): ReceiptModalData {
  if (!member) return receipt
  return {
    ...receipt,
    ...(member.memberId != null && member.memberId > 0 ? { memberId: member.memberId } : {}),
    ...(member.memberNo ? { memberNo: member.memberNo } : {}),
    ...(member.memberPhone ? { memberPhone: member.memberPhone } : {}),
    ...(member.memberTierCode ? { memberTierCode: member.memberTierCode } : {}),
    ...(member.memberPointEarned != null ? { memberPointEarned: member.memberPointEarned } : {}),
    ...(member.memberPointBalance != null ? { memberPointBalance: member.memberPointBalance } : {}),
  }
}

export function hasReceiptMemberDetails(receiptData: ReceiptModalData): boolean {
  return Boolean(
    (Number(receiptData.memberId) || 0) > 0 ||
      String(receiptData.memberNo ?? '').trim() ||
      String(receiptData.memberPhone ?? '').trim() ||
      String(receiptData.memberTierCode ?? '').trim() ||
      roundMemberPointsEarn(receiptData.memberPointEarned) > 0 ||
      normalizeMemberPoints(receiptData.memberPointBalance) > 0
  )
}

type TrFn = (key: string, fallback: string) => string

/**
 * QR(좌) + 회원정보(우) 또는 QR만 / 회원정보만
 */
export function buildPaymentReceiptMemberFooterHtml(params: {
  receiptData: ReceiptModalData
  showMembershipQr: boolean
  membershipQrSrc: string
  membershipQrText: string
  tr: TrFn
  esc?: (s: string) => string
}): string {
  const esc = params.esc ?? escapeHtml
  const tr = params.tr
  const showQr = Boolean(params.showMembershipQr && params.membershipQrSrc)
  const showMember = hasReceiptMemberDetails(params.receiptData) && !params.receiptData.voidReceiptMode
  if (!showQr && !showMember) return ''

  const ctaRaw =
    String(params.membershipQrText || '').trim() ||
    tr('posReceiptMembershipQrCta', 'เช็คสิทธิพิเศษที่นี่')
  const phoneMasked = maskMemberPhoneForReceipt(params.receiptData.memberPhone)
  const tierLabel = formatMemberTierForReceipt(params.receiptData.memberTierCode)
  const pointBalance = formatMemberPointsDisplay(params.receiptData.memberPointBalance ?? 0)
  const pointEarned = roundMemberPointsEarn(params.receiptData.memberPointEarned)
  const pointEarnedLabel = pointEarned > 0 ? `+${formatMemberPointsDisplay(pointEarned)}` : '0'

  const qrCol = showQr
    ? `<div class="receipt-member-qr">
        <img src="${esc(params.membershipQrSrc)}" alt="Membership QR" class="receipt-member-qr-img" />
        <div class="receipt-member-qr-cta">${esc(ctaRaw)}</div>
      </div>`
    : ''

  const infoCol = showMember
    ? `<div class="receipt-member-info">
        <div class="receipt-member-info-title">${esc(tr('posReceiptMemberInfoTitle', 'ข้อมูลสมาชิก'))}</div>
        <div class="receipt-member-info-line">${esc(tr('posReceiptMemberPhone', 'เบอร์โทรศัพท์'))}: ${esc(phoneMasked || '-')}</div>
        <div class="receipt-member-info-line">${esc(tr('posReceiptMemberTier', 'ระดับสมาชิก'))}: ${esc(tierLabel)}</div>
        <div class="receipt-member-info-line">${esc(tr('posReceiptMemberPointsBalance', 'คะแนนคงเหลือ'))}: ${esc(pointBalance)}</div>
        <div class="receipt-member-info-line">${esc(tr('posReceiptMemberPointsEarn', 'คะแนนที่จะได้รับ'))}: ${esc(pointEarnedLabel)}</div>
        <div class="receipt-member-info-note">${esc(
          tr(
            'posReceiptMemberPointsNote',
            '* คะแนนคงเหลือไม่รวมคะแนนที่จะได้รับในบิลนี้'
          )
        )}</div>
      </div>`
    : ''

  const layoutClass =
    showQr && showMember
      ? 'receipt-member-block receipt-member-block--split'
      : showQr
        ? 'receipt-member-block receipt-member-block--qr-only'
        : 'receipt-member-block receipt-member-block--info-only'

  return `<div class="receipt-divider"></div>
        <div class="${layoutClass}">
          ${qrCol}${infoCol}
        </div>`
}

export const PAYMENT_RECEIPT_MEMBER_BLOCK_CSS = `
        .receipt-member-block { margin: 6px 0 4px 0; color: #000; }
        .receipt-member-block--split {
          display: table;
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
        }
        .receipt-member-block--split .receipt-member-qr,
        .receipt-member-block--split .receipt-member-info {
          display: table-cell;
          vertical-align: top;
        }
        .receipt-member-block--split .receipt-member-qr { width: 38%; padding-right: 3px; }
        .receipt-member-block--split .receipt-member-info { width: 62%; padding-left: 2px; }
        .receipt-member-block--qr-only { text-align: center; }
        .receipt-member-block--qr-only .receipt-member-qr { display: inline-block; text-align: center; }
        .receipt-member-qr-img {
          width: 72px;
          height: 72px;
          object-fit: contain;
          display: block;
          margin: 0 auto;
        }
        .receipt-member-qr-cta {
          display: block;
          margin: 3px auto 0 auto;
          padding: 2px 4px;
          max-width: 78px;
          background: #000;
          color: #fff !important;
          font-size: 8px;
          font-weight: 800;
          line-height: 1.25;
          text-align: center;
          border-radius: 2px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .receipt-member-info-title {
          font-size: 11px;
          font-weight: 800;
          margin: 0 0 2px 0;
          color: #000;
        }
        .receipt-member-info-line {
          font-size: 10px;
          font-weight: 700;
          line-height: 1.35;
          color: #000;
          word-break: break-word;
        }
        .receipt-member-info-note {
          margin-top: 3px;
          font-size: 8px;
          font-weight: 700;
          line-height: 1.3;
          color: #000;
        }
`

/** 재인쇄·오토프린트용: 주문 포인트 + 회원 검색 결과로 영수증 필드 채움 */
export function memberReceiptFieldsFromMemberRow(
  member: {
    id?: number
    memberNo?: string
    phone?: string
    tierCode?: string
    pointBalance?: number
  } | null | undefined,
  pointEarnedRaw: unknown
): PosReceiptMemberSnapshot | null {
  if (!member && !roundMemberPointsEarn(pointEarnedRaw)) return null
  const pointEarned = roundMemberPointsEarn(pointEarnedRaw)
  const bal = normalizeMemberPoints(member?.pointBalance)
  return {
    ...(member?.id != null && Number(member.id) > 0 ? { memberId: Number(member.id) } : {}),
    ...(String(member?.memberNo ?? '').trim()
      ? { memberNo: String(member?.memberNo).trim() }
      : {}),
    ...(String(member?.phone ?? '').trim() ? { memberPhone: String(member?.phone ?? '').trim() } : {}),
    ...(String(member?.tierCode ?? '').trim()
      ? { memberTierCode: String(member?.tierCode ?? '').trim() }
      : {}),
    memberPointEarned: pointEarned,
    /** 현재 잔액에서 이 빌 적립분을 제외(대략값·재인쇄용) */
    memberPointBalance: Math.max(0, normalizeMemberPoints(bal - pointEarned)),
  }
}

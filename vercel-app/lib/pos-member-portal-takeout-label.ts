import type { LangCode } from '@/lib/lang-context'
import { MEMBER_PORTAL_PAYMENT_PENDING_TAG } from '@/lib/member-portal-payment-pending'
import { formatPosTimeHm24Bangkok } from '@/lib/pos-datetime-locale'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'

export type MemberPortalTakeoutMeta = {
  isMemberPortal: boolean
  memberName: string
  memberNo: string
  pickupAtRaw: string
}

const MEMBER_PORTAL_MEMO_TAG = '[회원주문]'

function pickMemoField(memo: string, key: string): string {
  const re = new RegExp(`${key}:([^·]+)`, 'u')
  const m = re.exec(String(memo || ''))
  return String(m?.[1] ?? '').trim()
}

/** 회원앱 픽업 주문 메모·회원 필드에서 표시용 메타 추출 */
export function resolveMemberPortalTakeoutMeta(params: {
  memo?: string | null
  memberId?: number | null
  memberNo?: string | null
  tableName?: string | null
}): MemberPortalTakeoutMeta {
  const memo = String(params.memo ?? '').trim()
  const memberId = Math.max(0, Math.trunc(Number(params.memberId ?? 0) || 0))
  const memberNoFromDb = String(params.memberNo ?? '').trim()
  const tableName = String(params.tableName ?? '').trim()

  const taggedInMemo =
    memo.includes(MEMBER_PORTAL_MEMO_TAG) ||
    memo.includes('회원 주문입니다') ||
    /픽업희망:/u.test(memo)
  const tableLooksMemberPortal = /^회원(?:주문)?\s*[·•]/u.test(tableName)
  const isMemberPortal =
    memberId > 0 || Boolean(memberNoFromDb) || taggedInMemo || tableLooksMemberPortal

  if (!isMemberPortal) {
    return { isMemberPortal: false, memberName: '', memberNo: '', pickupAtRaw: '' }
  }

  let memberName = pickMemoField(memo, '회원')
  let memberNo = pickMemoField(memo, '번호') || memberNoFromDb
  const pickupAtRaw = pickMemoField(memo, '픽업희망')

  if (!memberName && tableName) {
    const tableMatch = /^회원(?:주문)?\s*[·•]\s*(.+?)(?:\s*[·•]\s*(.+))?$/u.exec(tableName)
    if (tableMatch) {
      memberName = String(tableMatch[1] ?? '').trim()
      if (!memberNo && tableMatch[2]) memberNo = String(tableMatch[2]).trim()
    }
  }

  return {
    isMemberPortal: true,
    memberName,
    memberNo,
    pickupAtRaw,
  }
}

/** pos_orders.table_name 저장용 — 신규 회원앱 픽업 주문 */
export function buildMemberPortalTakeoutTableNameForStorage(memberName: string, memberNo: string): string {
  const name = String(memberName || '').trim()
  const no = String(memberNo || '').trim()
  const parts = ['회원주문']
  if (name) parts.push(name)
  if (no) parts.push(no)
  return parts.join(' · ')
}

type LabelText = {
  memberPortalOrder: string
}

const DEFAULT_LABEL_TEXT: LabelText = {
  memberPortalOrder: '회원주문',
}

export function memberPortalReceiptLabelText(t: (key: string) => string): LabelText {
  const memberPortalOrder =
    String(t('posMemberPortalOrder') ?? '').trim() || DEFAULT_LABEL_TEXT.memberPortalOrder
  return { memberPortalOrder }
}

/** 포장 바·패널·주방 슬립 헤더용 메인 라벨 */
export function buildMemberPortalTakeoutDisplayLabel(
  meta: MemberPortalTakeoutMeta,
  text: Partial<LabelText> = {}
): string {
  if (!meta.isMemberPortal) return ''
  const tag = String(text.memberPortalOrder ?? DEFAULT_LABEL_TEXT.memberPortalOrder).trim() || '회원주문'
  const parts = [tag]
  if (meta.memberName) parts.push(meta.memberName)
  if (meta.memberNo) parts.push(meta.memberNo)
  return parts.length > 1 ? parts.join(' · ') : tag
}

function formatPickupAtForDisplay(pickupAtRaw: string, lang: LangCode): string {
  const raw = String(pickupAtRaw || '').trim()
  if (!raw) return ''
  const normalized = raw.replace(' ', 'T').slice(0, 19)
  const withBangkokTz = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}+07:00`
  const parsed = new Date(withBangkokTz)
  if (Number.isNaN(parsed.getTime())) {
    const hm = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/u.exec(raw)
    return hm?.[2] ?? raw.slice(0, 16)
  }
  return formatPosTimeHm24Bangkok(parsed, lang)
}

/** 포장 주문 바 subLabel — 주문 시각 · 픽업 희망 시각 */
export function buildMemberPortalTakeoutBarSubLabel(params: {
  createdAt?: Date | string | null
  pickupAtRaw?: string | null
  lang: LangCode
  orderTimeLabel?: string
  pickupTimeLabel?: string
}): string {
  const orderTimeLabel = String(params.orderTimeLabel ?? '주문').trim() || '주문'
  const pickupTimeLabel = String(params.pickupTimeLabel ?? '픽업').trim() || '픽업'
  const parts: string[] = []
  if (params.createdAt) {
    const orderHm = formatPosTimeHm24Bangkok(params.createdAt, params.lang)
    if (orderHm && orderHm !== '--:--') parts.push(`${orderTimeLabel} ${orderHm}`)
  }
  const pickupHm = formatPickupAtForDisplay(String(params.pickupAtRaw ?? ''), params.lang)
  if (pickupHm) parts.push(`${pickupTimeLabel} ${pickupHm}`)
  return parts.join(' · ')
}

/** 회원앱 픽업 주문 여부 (pos_orders.type=takeout + 회원 메타) */
export function isMemberPortalTakeoutOrder(order: {
  type?: string | null
  memo?: string | null
  memberId?: number | null
  memberNo?: string | null
  tableName?: string | null
}): boolean {
  const type = String(order.type ?? '').trim().toLowerCase()
  if (type !== 'takeout') return false
  return resolveMemberPortalTakeoutMeta({
    memo: order.memo,
    memberId: order.memberId,
    memberNo: order.memberNo,
    tableName: order.tableName,
  }).isMemberPortal
}

/**
 * 회원앱 선결제·포인트 전액 결제 직후 `paid` — 매장 포장은 아직 필요.
 * POS 「준비중」 목록에 남겨 두기 위한 판별.
 */
export function isMemberPortalTakeoutKitchenOpen(order: {
  type?: string | null
  status?: string | null
  memo?: string | null
  memberId?: number | null
  memberNo?: string | null
  tableName?: string | null
}): boolean {
  if (!isMemberPortalTakeoutOrder(order)) return false
  const st = String(order.status ?? '').trim().toLowerCase()
  return st === 'paid'
}

/** table_name 이 비어 있는 기존 회원앱 주문도 POS에서 동일하게 보이도록 보강 */
export function resolveMemberPortalTakeoutTableDisplay(params: {
  tableName?: string | null
  memo?: string | null
  memberId?: number | null
  memberNo?: string | null
  labelText?: Partial<LabelText>
}): string {
  const tableName = String(params.tableName ?? '').trim()
  if (tableName) return tableName
  const meta = resolveMemberPortalTakeoutMeta(params)
  if (!meta.isMemberPortal) return ''
  return buildMemberPortalTakeoutDisplayLabel(meta, params.labelText)
}

function pickLocalizedLabel(t: (key: string) => string, key: string, fallback: string): string {
  const raw = String(t(key) ?? '').trim()
  if (!raw || raw === key || /^pos[A-Z]/.test(raw)) return fallback
  return raw
}

/** 영수증·주방 슬립 테이블명 — 회원앱 픽업 주문 한글 저장값을 현재 POS 언어로 */
export function translateMemberPortalReceiptTableName(
  tableName: string | undefined | null,
  t: (key: string) => string
): string {
  const s = String(tableName ?? '').trim()
  if (!s) return ''
  const meta = resolveMemberPortalTakeoutMeta({ tableName: s })
  if (!meta.isMemberPortal) return s
  return buildMemberPortalTakeoutDisplayLabel(meta, memberPortalReceiptLabelText(t))
}

/** 영수증·주방 슬립 고객 메모 — 회원앱 픽업 주문 한글 메모를 현재 POS 언어로 */
export function formatMemberPortalReceiptMemo(
  memo: string | undefined | null,
  t: (key: string) => string,
  lang: LangCode
): string {
  const raw = String(memo ?? '').trim()
  if (!raw) return ''
  const meta = resolveMemberPortalTakeoutMeta({ memo: raw })
  if (!meta.isMemberPortal) return raw

  const labels = memberPortalReceiptLabelText(t)
  const parts: string[] = [`[${labels.memberPortalOrder}]`]

  if (raw.includes(MEMBER_PORTAL_PAYMENT_PENDING_TAG)) {
    const pending = pickLocalizedLabel(t, 'posMemberPortalPaymentPending', MEMBER_PORTAL_PAYMENT_PENDING_TAG)
    parts.push(pending.startsWith('[') ? pending : `[${pending}]`)
  }

  const notice = pickLocalizedLabel(t, 'posMemberPortalOrderNotice', '회원 주문입니다')
  parts.push(notice)

  if (meta.pickupAtRaw) {
    const pickupHm = formatPickupAtForDisplay(meta.pickupAtRaw, lang)
    if (pickupHm) {
      parts.push(
        `${pickLocalizedLabel(t, 'posPickupAtShort', '픽업')}:${pickupHm}`
      )
    }
  }
  if (meta.memberName) {
    parts.push(`${pickLocalizedLabel(t, 'posMember', '회원')}:${meta.memberName}`)
  }
  if (meta.memberNo) {
    parts.push(`${pickLocalizedLabel(t, 'posMemberNo', '회원번호')}:${meta.memberNo}`)
  }

  const couponCode = pickMemoField(raw, '쿠폰')
  if (couponCode) {
    parts.push(`${pickLocalizedLabel(t, 'posCoupon', '쿠폰')}:${couponCode}`)
  }
  const pointUsed = pickMemoField(raw, '포인트')
  if (pointUsed) {
    parts.push(`${pickLocalizedLabel(t, 'posPointsShort', '포인트')}:${pointUsed}`)
  }

  return parts.join(' · ')
}

/** parsePosOrderMemo 이후 plainMemo — 회원앱 픽업이면 현재 언어로 재구성 */
export function translatePosCustomerMemoForReceipt(
  memo: string | undefined | null,
  t: (key: string) => string,
  lang: LangCode
): string {
  const plainMemo = String(parsePosOrderMemo(memo).plainMemo ?? '').trim()
  if (!plainMemo) return ''
  return formatMemberPortalReceiptMemo(plainMemo, t, lang)
}

/** 주방 슬립용 `메모: …` 한 줄 */
export function buildPosCustomerMemoLineForPrint(
  memo: string | undefined | null,
  t: (key: string) => string,
  lang: LangCode
): string {
  const text = translatePosCustomerMemoForReceipt(memo, t, lang).trim()
  if (!text) return ''
  const label = pickLocalizedLabel(t, 'posCustomerMemo', '메모')
  return `${label}: ${text}`
}

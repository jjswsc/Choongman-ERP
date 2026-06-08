import type { PosDeliveryApp } from '@/lib/api-client'
import { formatPosOrderNoForPrint } from '@/lib/pos-order-no'
import { escapeHtml } from '@/lib/utils'

export type PosChannelOrderNoPick =
  | { kind: 'hash'; text: string }
  | { kind: 'memo_anchor'; text: string }
  | { kind: 'pos_order'; text: string }

/** POS 주문 행(배달 라벨은 DB `table_name`에 저장되는 경우가 많음)에서 배달앱 표시명 추출 */
export function getPosDeliveryPlatformName(
  order: { tableName?: string; orderNo?: string; memo?: string },
  deliveryApps: PosDeliveryApp[] | undefined
): string {
  const text = [order.tableName ?? '', order.orderNo ?? '', order.memo ?? ''].filter(Boolean).join(' ')
  const raw = text.toLowerCase()
  const apps = deliveryApps ?? []
  if (apps.length) {
    for (const app of apps) {
      const keywords = app.matchKeywords || []
      if (keywords.some((k) => raw.includes(String(k).toLowerCase()))) {
        return String(app.name || '').trim()
      }
    }
  }
  if (raw.includes('grab') || raw.includes('그랩')) return 'Grab'
  if (raw.includes('lineman') || raw.includes('line man') || raw.includes('라인맨')) return 'Line Man'
  if (raw.includes('shopee') || raw.includes('쇼피')) return 'Shopee'
  return ''
}

function tryPickMemoAnchorChannelNo(memo: string): string {
  const m = String(memo || '')
  const grab = /grab_order:([A-Za-z0-9._:-]+)/i.exec(m)?.[1]?.trim()
  if (grab) return grab
  const lm = /lineman_order:([A-Za-z0-9._:-]+)/i.exec(m)?.[1]?.trim()
  if (lm) return lm
  const sp = /shopee_order:([A-Za-z0-9._:-]+)/i.exec(m)?.[1]?.trim()
  if (sp) return sp
  const sf = /sf_order:([A-Za-z0-9._:-]+)/i.exec(m)?.[1]?.trim()
  if (sf) return sf
  return ''
}

/** 웹훅/API로 유입된 배달 주문의 memo 앵커(수동 키잉은 보통 이 패턴 없음) */
export function isApiInboundDeliveryOrderMemo(memo: string): boolean {
  const m = String(memo || '')
  return (
    /grab_order:/i.test(m) ||
    /lineman_order:/i.test(m) ||
    /shopee_order:/i.test(m) ||
    /sf_order:/i.test(m)
  )
}

/** 라벨/주문번호/메모에서 채널 주문번호 우선 추출 (`#…`, memo 앵커), 없으면 POS 주문번호 */
export function pickPosChannelOrderNo(order: {
  tableName?: string
  orderNo?: string
  memo?: string
}): PosChannelOrderNoPick {
  const joined = [order.tableName ?? '', order.orderNo ?? '', order.memo ?? ''].filter(Boolean).join(' ')
  const m = joined.match(/#\s*([A-Za-z0-9-]+)/i)
  if (m?.[1]) {
    const token = m[1].trim()
    if (token) return { kind: 'hash', text: token }
  }
  const memoOnly = String(order.memo ?? '')
  const anchor = tryPickMemoAnchorChannelNo(memoOnly)
  if (anchor) return { kind: 'memo_anchor', text: anchor }
  const fallback = String(order.orderNo ?? '').trim()
  return { kind: 'pos_order', text: fallback }
}

/** @deprecated `pickPosChannelOrderNo` 사용 권장 */
export function getPosChannelOrderNoDisplay(order: {
  tableName?: string
  orderNo?: string
  memo?: string
}): { text: string; usedHash: boolean } {
  const pick = pickPosChannelOrderNo(order)
  if (pick.kind === 'pos_order') return { text: pick.text, usedHash: false }
  return { text: pick.text, usedHash: true }
}

/** 배달·포장 유형 문자열 뒤에 붙이는 번호(예: ` · #A1B2` 또는 ` · POS-001`) */
export function formatPosOrderTypeChannelSuffix(order: {
  tableName?: string
  orderNo?: string
  memo?: string
}): string {
  const pick = pickPosChannelOrderNo(order)
  if (!pick.text) return ''
  if (pick.kind === 'hash' || pick.kind === 'memo_anchor') return ` · #${pick.text}`
  return ` · ${formatPosOrderNoForPrint(pick.text)}`
}

/** table_name/memo 등에 `#채널주문번호`가 있으면 그 문자열, 없으면 POS order_no */
export function resolvePosReceiptOrderNoRaw(args: {
  posOrderNo: string
  tableName?: string
  memo?: string
}): string {
  const pick = pickPosChannelOrderNo({
    tableName: args.tableName,
    orderNo: args.posOrderNo,
    memo: args.memo ?? '',
  })
  if (pick.kind !== 'pos_order' && pick.text.trim()) return pick.text.trim()
  return String(args.posOrderNo ?? '').trim()
}

/** 영수증·간이 출력: 채널 번호 우선 후 formatPosOrderNoForPrint */
export function formatPosReceiptOrderNoDisplay(args: {
  posOrderNo: string
  tableName?: string
  memo?: string
}): string {
  return formatPosOrderNoForPrint(resolvePosReceiptOrderNoRaw(args))
}

/**
 * 채널 주문번호 토큰만 크게(2em). HTML 이스케이프 후 `.receipt-delivery-channel-no` span으로 감쌈.
 * `.receipt-delivery-channel-no`는 `pos-receipt-html` 등 영수증 CSS에 정의.
 */
export function escapeHtmlReceiptEmphasizeChannelToken(token: string): string {
  const rest = String(token ?? '')
    .trim()
    .replace(/\s+$/, '')
  if (!rest || !/^[A-Za-z0-9-]+$/i.test(rest)) return escapeHtml(rest)
  return (
    '<span class="receipt-delivery-channel-no">' +
    escapeHtml(rest) +
    '</span>'
  )
}

/**
 * 테이블 표시(예: `Line Man #0660`)에서 `#` 뒤 채널 주문번호만 크게 보이게 하는 HTML.
 * `.receipt-delivery-channel-no`는 `pos-receipt-html` 등 영수증 CSS에 정의.
 */
export function escapeHtmlReceiptEmphasizeChannelTokenAfterHash(tableLine: string): string {
  const s = String(tableLine ?? '').trimEnd()
  const lastHash = s.lastIndexOf('#')
  if (lastHash < 0) return escapeHtml(s)
  const rest = s
    .slice(lastHash + 1)
    .replace(/^\s+/, '')
    .replace(/\s+$/, '')
  if (!/^[A-Za-z0-9-]+$/i.test(rest)) return escapeHtml(s)
  const head = s.slice(0, lastHash)
  return escapeHtml(head) + escapeHtml('#') + escapeHtmlReceiptEmphasizeChannelToken(rest)
}

/** `pos_orders.delivery_payment_channel` 등에 쓰는 소문자 코드 */
export const POS_DELIVERY_PAYMENT_CHANNEL_CODES = new Set(['grab', 'lineman', 'shopee', 'dine_in'])

const CANON_RECEIPT_DELIVERY_CODES = POS_DELIVERY_PAYMENT_CHANNEL_CODES

export type PosDeliveryPaymentChannelUi = 'grab' | 'lineman' | 'shopee'

export type ReceiptDeliveryChannelContext = {
  deliveryAppCode?: string | null | undefined
  /** 결제 탭에서 저장된 채널 — 주문·메모·코드가 없을 때만 신뢰 */
  deliveryPaymentChannel?: string | null | undefined
  tableName?: string | null | undefined
  memo?: string | null | undefined
  orderNo?: string | null | undefined
  itemDeliveryAppCodes?: Array<string | null | undefined>
}

function normalizeReceiptDeliveryCode(raw: string | null | undefined): string {
  const v = String(raw ?? '').trim().toLowerCase()
  return CANON_RECEIPT_DELIVERY_CODES.has(v) ? v : ''
}

/**
 * 손님 영수증「배달앱 (채널)」표시용: **주문** 기준 채널을 우선하고,
 * `delivery_payment_channel`은 주문에서 유추할 수 없을 때만 사용한다.
 */
export function resolveReceiptDeliveryPaymentChannelCode(ctx: ReceiptDeliveryChannelContext): string {
  const fromOrder = normalizeReceiptDeliveryCode(ctx.deliveryAppCode)
  if (fromOrder) return fromOrder
  for (const it of ctx.itemDeliveryAppCodes ?? []) {
    const v = normalizeReceiptDeliveryCode(it)
    if (v) return v
  }
  const memo = String(ctx.memo ?? '')
  if (/grab_order:/i.test(memo)) return 'grab'
  if (/lineman_order:/i.test(memo)) return 'lineman'
  if (/shopee_order:/i.test(memo)) return 'shopee'
  if (/sf_order:/i.test(memo)) return 'shopee'
  const blob = [ctx.tableName, ctx.memo, ctx.orderNo].filter(Boolean).join(' ').toLowerCase()
  if (blob.includes('shopee') || blob.includes('쇼피')) return 'shopee'
  if (blob.includes('line man') || blob.includes('lineman') || blob.includes('라인맨')) return 'lineman'
  if (blob.includes('grab') || blob.includes('그랩')) return 'grab'
  return normalizeReceiptDeliveryCode(ctx.deliveryPaymentChannel)
}

/** 결제 모달 기본 채널 — 주문·라벨·memo만 보고 (결제 탭 현재값은 무시) */
export function resolveDefaultDeliveryPaymentChannel(
  ctx: Omit<ReceiptDeliveryChannelContext, 'deliveryPaymentChannel'>
): PosDeliveryPaymentChannelUi {
  const resolved = resolveReceiptDeliveryPaymentChannelCode({
    ...ctx,
    deliveryPaymentChannel: undefined,
  })
  if (resolved === 'lineman' || resolved === 'shopee') return resolved
  return 'grab'
}

/** 결제 저장·영수증: 배달앱 결제 채널 — 주문 플랫폼이 결제 UI 기본값보다 우선 */
export function resolveDeliveryPaymentChannelForSave(
  ctx: ReceiptDeliveryChannelContext & { paymentDeliveryApp: number }
): string | null {
  if (ctx.paymentDeliveryApp <= 0.005) return null
  const resolved = resolveReceiptDeliveryPaymentChannelCode(ctx)
  if (CANON_RECEIPT_DELIVERY_CODES.has(resolved)) return resolved
  return 'grab'
}

import type { PosDeliveryApp } from '@/lib/api-client'
import { formatPosOrderNoForPrint } from '@/lib/pos-order-no'

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

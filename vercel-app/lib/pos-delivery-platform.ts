import type { PosDeliveryApp } from '@/lib/api-client'
import { formatPosOrderNoForPrint } from '@/lib/pos-order-no'

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

/** 라벨/주문번호/메모에서 `#ABC123` 형태 번호 추출, 없으면 POS 주문번호 */
export function getPosChannelOrderNoDisplay(order: {
  tableName?: string
  orderNo?: string
  memo?: string
}): { text: string; usedHash: boolean } {
  const joined = [order.tableName ?? '', order.orderNo ?? '', order.memo ?? ''].filter(Boolean).join(' ')
  const m = joined.match(/#\s*([A-Za-z0-9-]+)/i)
  if (m?.[1]) {
    const token = m[1].trim()
    if (token) return { text: token, usedHash: true }
  }
  const fallback = String(order.orderNo ?? '').trim()
  return { text: fallback, usedHash: false }
}

/** 배달·포장 유형 문자열 뒤에 붙이는 번호(예: ` · #A1B2` 또는 ` · POS-001`) */
export function formatPosOrderTypeChannelSuffix(order: {
  tableName?: string
  orderNo?: string
  memo?: string
}): string {
  const { text, usedHash } = getPosChannelOrderNoDisplay(order)
  if (!text) return ''
  return usedHash ? ` · #${text}` : ` · ${text}`
}

/** table_name/memo 등에 `#채널주문번호`가 있으면 그 문자열, 없으면 POS order_no */
export function resolvePosReceiptOrderNoRaw(args: {
  posOrderNo: string
  tableName?: string
  memo?: string
}): string {
  const ch = getPosChannelOrderNoDisplay({
    tableName: args.tableName,
    orderNo: args.posOrderNo,
    memo: args.memo ?? '',
  })
  if (ch.usedHash && ch.text.trim()) return ch.text.trim()
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

import { extractGrabOrderIdFromMemo } from '@/lib/grab-order-memo'

/** 목록·영수증: webhook 건은 Grab orderID 꼬리 표시 */
export function formatGrabDeliveryTableDisplayName(tableName: string, memo: string): string {
  const table = String(tableName ?? '').trim()
  if (!table) return ''
  const grabId = extractGrabOrderIdFromMemo(String(memo ?? ''))
  if (grabId) {
    const suffix = grabId.length > 10 ? grabId.slice(-8) : grabId
    if (suffix && !table.includes(suffix)) return `${table} · ID ${suffix}`
    return table
  }
  return table
}

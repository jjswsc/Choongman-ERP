/** 메인 POS — 원격(손님 QR 등) unpaid→paid 시 배너·홀 PAID 플래시용 */

export const CM_POS_REMOTE_ORDER_PAID = 'cm-pos-remote-order-paid'

export type CmPosRemoteOrderPaidDetail = {
  orderId: number
  tableName?: string
  amount?: number
  source?: 'qr_table' | 'member_portal' | 'remote' | string
}

export function resolveRemoteOrderPaidSource(createdBy: string | null | undefined): CmPosRemoteOrderPaidDetail['source'] {
  const c = String(createdBy || '')
  if (c.startsWith('qr_table:')) return 'qr_table'
  if (c.startsWith('member_portal:')) return 'member_portal'
  return 'remote'
}

export function dispatchPosRemoteOrderPaid(detail: CmPosRemoteOrderPaidDetail): void {
  if (typeof window === 'undefined') return
  const orderId = Math.trunc(Number(detail.orderId) || 0)
  if (!(orderId > 0)) return
  window.dispatchEvent(
    new CustomEvent(CM_POS_REMOTE_ORDER_PAID, {
      detail: {
        orderId,
        tableName: String(detail.tableName || '').trim() || undefined,
        amount: Math.max(0, Number(detail.amount) || 0) || undefined,
        source: detail.source || 'remote',
      } satisfies CmPosRemoteOrderPaidDetail,
    })
  )
}

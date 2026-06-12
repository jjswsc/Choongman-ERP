export type MemberPortalOrderListRow = {
  orderId: number
  orderNo: string
  storeCode: string
  status: string
  total: number
  pointUsed: number
  paymentQr: number
  pickupHint: string
  createdAt: string
  paidAt: string | null
  awaitingPayment: boolean
  paymentExpired: boolean
  paymentExpiresAt: string | null
}

export function memberPortalOrderStatusLabelKey(
  row: Pick<MemberPortalOrderListRow, 'status' | 'awaitingPayment' | 'paymentExpired'>
):
  | 'orderStatusAwaitingPayment'
  | 'orderStatusPaid'
  | 'orderStatusCooking'
  | 'orderStatusReady'
  | 'orderStatusPending'
  | 'orderStatusCompleted'
  | 'orderStatusCancelled'
  | 'orderStatusExpired' {
  if (row.awaitingPayment) return 'orderStatusAwaitingPayment'
  if (row.paymentExpired) return 'orderStatusExpired'
  const s = String(row.status || '').toLowerCase()
  if (s === 'completed') return 'orderStatusCompleted'
  if (s === 'ready') return 'orderStatusReady'
  if (s === 'cooking' || s === 'preparing') return 'orderStatusCooking'
  if (s === 'paid') return 'orderStatusPaid'
  if (s === 'cancelled' || s === 'canceled') return 'orderStatusCancelled'
  return 'orderStatusPending'
}

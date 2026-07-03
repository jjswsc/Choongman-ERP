/** 신규 배달 유입 시 탭 포커스·수락 안내에 쓰는 파라미터 */
export type IncomingDeliveryFocusParams = {
  orderId: number
  orderType?: string
  deliveryAppCode?: string
  status?: string
  createdAt?: string
  storeCode?: string
  memo?: string
}

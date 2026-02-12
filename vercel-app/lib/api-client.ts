/**
 * API 클라이언트 - 로그인 등
 */
export async function getLoginData() {
  const res = await fetch('/api/getLoginData')
  return res.json() as Promise<{ users: Record<string, string[]>; vendors: string[] }>
}

export async function loginCheck(params: {
  store: string
  name: string
  pw: string
  isAdminPage?: boolean
}) {
  const res = await fetch('/api/loginCheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    storeName?: string
    userName?: string
    role?: string
  }>
}

export async function changePassword(params: {
  store: string
  name: string
  oldPw: string
  newPw: string
}) {
  const res = await fetch('/api/changePassword', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface NoticeItem {
  id: number
  date: string
  title: string
  content: string
  sender: string
  status: string
  attachments: unknown[]
}

export async function getMyNotices(params: { store: string; name: string }) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/getMyNotices?${q}`)
  return res.json() as Promise<NoticeItem[]>
}

export interface AppItem {
  code: string
  category: string
  name: string
  spec: string
  price: number
  taxType: string
  safeQty: number
  image?: string
}

export async function getAppData(storeName: string) {
  const res = await fetch(`/api/getAppData?storeName=${encodeURIComponent(storeName)}`)
  const data = await res.json()
  return { items: (data.items || []) as AppItem[], stock: data.stock || {} }
}

export async function processOrder(params: {
  storeName: string
  userName: string
  cart: { code?: string; name: string; price: number; qty: number }[]
}) {
  const res = await fetch('/api/processOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface OrderHistoryItem {
  id: number
  date: string
  deliveryDate: string
  summary: string
  total: number
  status: string
  deliveryStatus?: string
  items: { name?: string; qty?: number; price?: number }[]
}

export async function getMyOrderHistory(params: {
  store: string
  startStr: string
  endStr: string
}) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/getMyOrderHistory?${q}`)
  return res.json() as Promise<OrderHistoryItem[]>
}

export async function processOrderReceive(params: {
  orderRowId: number
  imageUrl?: string
}) {
  const res = await fetch('/api/processOrderReceive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface AdminOrderItem {
  row: number
  orderId: number
  date: string
  store: string
  total: number
  status: string
  deliveryStatus: string
  deliveryDate: string
  items: { code?: string; name?: string; spec?: string; qty?: number; price?: number }[]
  summary: string
}

export async function getAdminOrders(params: { startStr: string; endStr: string }) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/getAdminOrders?${q}`)
  const data = await res.json()
  return (data.list || []) as AdminOrderItem[]
}

export async function updateOrderDeliveryStatus(params: {
  orderId: number
  deliveryStatus: string
}) {
  const res = await fetch('/api/updateOrderDeliveryStatus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateOrderCart(params: {
  orderId: number
  updatedCart: { code?: string; name?: string; spec?: string; price: number; qty: number }[]
  deliveryStatus?: string
}) {
  const res = await fetch('/api/updateOrderCart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

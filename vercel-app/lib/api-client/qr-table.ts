import { apiFetch } from '@/lib/api/fetch'
import type { QrBuffetTier, QrCartLineInput, QrOrderStoreSettings, QrTableSession, QrTableToken } from '@/lib/qr-table-types'

function sessionHeaders(sessionAuth?: string | null): HeadersInit | undefined {
  if (!sessionAuth) return undefined
  return { 'X-QR-Session': sessionAuth }
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T
}

export async function qrTableGetSession(token: string) {
  const res = await fetch(`/api/qr-table/session?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
  return parseJson<{
    success: boolean
    message?: string
    token?: QrTableToken
    settings?: QrOrderStoreSettings
    tiers?: QrBuffetTier[]
    activeSession?: QrTableSession | null
    canGuestOpen?: boolean
  }>(res)
}

export async function qrTableOpenSession(body: {
  token: string
  guestCount: number
  tierId: number
  entryPaymentChoice?: string
  extrasPaymentChoice?: string
}) {
  const res = await fetch('/api/qr-table/session/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<{
    success: boolean
    message?: string
    session?: QrTableSession
    sessionAuth?: string
  }>(res)
}

export async function qrTableClaimSession(token: string) {
  const res = await fetch('/api/qr-table/session/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  return parseJson<{
    success: boolean
    message?: string
    session?: QrTableSession
    sessionAuth?: string
  }>(res)
}

export async function qrTableGetMenus(sessionAuth: string) {
  const res = await fetch('/api/qr-table/menus', {
    cache: 'no-store',
    headers: sessionHeaders(sessionAuth),
  })
  return parseJson<{
    success: boolean
    message?: string
    session?: QrTableSession
    includedMenus?: MenuLike[]
    extraMenus?: MenuLike[]
  }>(res)
}

type MenuLike = {
  menuId: number
  name: string
  price: number
  listPrice: number
  imageUrl: string
  buffetIncluded: boolean
  description: string
  category: string
  categoryMain: string
}

export async function qrTableSubmitCart(sessionAuth: string, lines: QrCartLineInput[]) {
  const res = await fetch('/api/qr-table/cart/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders(sessionAuth) },
    body: JSON.stringify({ lines }),
  })
  return parseJson<{
    success: boolean
    message?: string
    orderId?: number
    addedCount?: number
    order?: {
      total: number
      paymentQr: number
      balanceDue: number
      items: Array<Record<string, unknown>>
    }
  }>(res)
}

export async function qrTableGetOrder(sessionAuth: string) {
  const res = await fetch('/api/qr-table/order', {
    cache: 'no-store',
    headers: sessionHeaders(sessionAuth),
  })
  return parseJson<{
    success: boolean
    message?: string
    session?: QrTableSession
    order?: {
      total: number
      paymentQr: number
      balanceDue: number
      items: Array<Record<string, unknown>>
    }
  }>(res)
}

export async function qrTableIssueEntryQr(sessionAuth: string) {
  const res = await fetch('/api/qr-table/entry/pay/qr', {
    method: 'POST',
    headers: sessionHeaders(sessionAuth),
  })
  return parseJson<{
    success: boolean
    message?: string
    partnerTransactionId?: string
    qrPayload?: string
    qrAmount?: number
  }>(res)
}

export async function qrTablePollEntryPay(sessionAuth: string) {
  const res = await fetch('/api/qr-table/entry/pay/status', {
    cache: 'no-store',
    headers: sessionHeaders(sessionAuth),
  })
  return parseJson<{ success: boolean; entryPaid?: boolean; status?: string; message?: string }>(res)
}

export async function qrTableIssueExtrasQr(sessionAuth: string) {
  const res = await fetch('/api/qr-table/extras/pay/qr', {
    method: 'POST',
    headers: sessionHeaders(sessionAuth),
  })
  return parseJson<{
    success: boolean
    message?: string
    partnerTransactionId?: string
    qrPayload?: string
    qrAmount?: number
  }>(res)
}

export async function qrTablePollExtrasPay(sessionAuth: string) {
  const res = await fetch('/api/qr-table/extras/pay/status', {
    cache: 'no-store',
    headers: sessionHeaders(sessionAuth),
  })
  return parseJson<{ success: boolean; paid?: boolean; message?: string }>(res)
}

export async function qrTableAdminGet(storeCode: string) {
  const res = await apiFetch(`/api/qr-table/admin?storeCode=${encodeURIComponent(storeCode)}`)
  return parseJson<{
    success: boolean
    settings?: QrOrderStoreSettings
    tiers?: QrBuffetTier[]
    tokens?: QrTableToken[]
    message?: string
  }>(res)
}

export async function qrTableAdminSaveSettings(settings: QrOrderStoreSettings) {
  const res = await apiFetch('/api/qr-table/admin', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return parseJson<{ success: boolean; settings?: QrOrderStoreSettings; message?: string }>(res)
}

export async function qrTableAdminAction(body: Record<string, unknown>) {
  const res = await apiFetch('/api/qr-table/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<{ success: boolean; tier?: QrBuffetTier; tokens?: QrTableToken[]; message?: string }>(res)
}

export async function qrTableStaffOpenSession(body: {
  storeCode: string
  tableName: string
  guestCount: number
  tierId: number
  entryPaymentChoice?: string
  extrasPaymentChoice?: string
  token?: string
}) {
  const res = await apiFetch('/api/qr-table/staff/open-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<{ success: boolean; session?: QrTableSession; message?: string }>(res)
}

export async function qrTableStaffConfirmEntry(sessionId: number) {
  const res = await apiFetch('/api/qr-table/staff/confirm-entry-postpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  return parseJson<{ success: boolean; session?: QrTableSession; message?: string }>(res)
}

export async function qrTableStaffSessionByTable(storeCode: string, tableName: string) {
  const res = await apiFetch(
    `/api/qr-table/staff/session-by-table?storeCode=${encodeURIComponent(storeCode)}&tableName=${encodeURIComponent(tableName)}`
  )
  return parseJson<{
    success: boolean
    session?: QrTableSession | null
    orderBalance?: {
      orderId: number | null
      total: number
      paymentQr: number
      balanceDue: number
      status: string
    } | null
    message?: string
  }>(res)
}

export async function qrTableCallStaff(sessionAuth: string, note?: string) {
  const res = await fetch('/api/qr-table/session/call-staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders(sessionAuth) },
    body: JSON.stringify({ note: note || '' }),
  })
  return parseJson<{ success: boolean; session?: QrTableSession; message?: string }>(res)
}

export async function qrTableStaffAckCall(sessionId: number, storeCode: string) {
  const res = await apiFetch('/api/qr-table/staff/ack-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, storeCode }),
  })
  return parseJson<{ success: boolean; session?: QrTableSession; message?: string }>(res)
}

export async function qrTableStaffAdjustGuests(sessionId: number, storeCode: string, guestCount: number) {
  const res = await apiFetch('/api/qr-table/staff/adjust-guests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, storeCode, guestCount }),
  })
  return parseJson<{ success: boolean; session?: QrTableSession; message?: string }>(res)
}

export async function qrTableStaffSessionsMap(storeCode: string) {
  const res = await apiFetch(
    `/api/qr-table/staff/sessions-map?storeCode=${encodeURIComponent(storeCode)}`
  )
  return parseJson<{
    success: boolean
    sessions?: Array<{
      tableName: string
      status: string
      entryPaid: boolean
      staffCallAt: string | null
      posOrderId: number | null
    }>
    message?: string
  }>(res)
}

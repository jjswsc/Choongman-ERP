export type MemberPortalCheckoutDraftLine = {
  menuId: string
  optionId?: string
  code?: string
  name: string
  price: number
  qty: number
}

export type MemberPortalCheckoutDraft = {
  storeCode: string
  pickupAt: string
  cart: MemberPortalCheckoutDraftLine[]
  pointUsed?: number
  couponCode?: string
  orderId?: number
  qrStartedAtMs?: number
}

const KEY = 'cm_member_portal_checkout_draft'

export function saveMemberPortalCheckoutDraft(draft: MemberPortalCheckoutDraft): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

export function readMemberPortalCheckoutDraft(): MemberPortalCheckoutDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MemberPortalCheckoutDraft
    if (!parsed || !Array.isArray(parsed.cart)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearMemberPortalCheckoutDraft(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

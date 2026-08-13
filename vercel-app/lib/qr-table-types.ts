/** Shared types for QR table order + buffet (client + server). */

export type QrOrderMode = 'buffet' | 'a_la_carte' | 'both'
export type QrPaymentMode = 'prepay' | 'postpay' | 'guest_choice'
export type QrResolvedPaymentMode = 'prepay' | 'postpay'
export type QrSessionStatus = 'awaiting_entry' | 'active' | 'closed' | 'expired'
export type QrEntryPaymentChannel = 'qr' | 'pos'

export type QrOrderStoreSettings = {
  storeCode: string
  enabled: boolean
  mode: QrOrderMode
  entryPaymentMode: QrPaymentMode
  extrasPaymentMode: QrPaymentMode
  requireStaffOpen: boolean
  maxOpenMinutes: number
  allowReorderAfterPaid: boolean
  /** Guest-facing print card */
  printLogoUrl?: string
  printBrandColor?: string
  printAccentColor?: string
  printBrandLine?: string
}

export type QrBuffetTier = {
  id: number
  storeCode: string
  code: string
  nameTh: string
  nameEn: string
  nameKo: string
  pricePerPerson: number
  sortOrder: number
  active: boolean
  validFrom?: string | null
  validTo?: string | null
  includedMenuIds?: number[]
  /** Extra 탭 허용 메뉴. 비어 있으면 포함 메뉴를 뺀 전체 */
  extraMenuIds?: number[]
}

export type QrTableToken = {
  id: number
  storeCode: string
  tableName: string
  token: string
  active: boolean
  publicUrl?: string
}

export type QrTableSession = {
  id: number
  storeCode: string
  tableName: string
  tokenId: number | null
  status: QrSessionStatus
  guestCount: number
  tierId: number | null
  tierPriceSnapshot: number
  entryTotal: number
  entryPaymentModeResolved: QrResolvedPaymentMode
  extrasPaymentModeResolved: QrResolvedPaymentMode
  entryPaid: boolean
  entryPaidAt: string | null
  entryPaymentChannel: QrEntryPaymentChannel | null
  posOrderId: number | null
  openedBy: string
  staffCallAt?: string | null
  staffCallNote?: string | null
  createdAt: string
  updatedAt: string
}

export type QrCartLineInput = {
  menuId: number
  qty: number
  note?: string
  optionIds?: number[]
}

export const QR_TABLE_SESSION_COOKIE = 'cm_qr_table_session'
export const QR_TABLE_CREATED_BY_PREFIX = 'qr_table:'

export function isQrTableCreatedBy(createdBy: string | null | undefined): boolean {
  return String(createdBy || '').startsWith(QR_TABLE_CREATED_BY_PREFIX)
}

export function buffetTierDisplayName(
  tier: Pick<QrBuffetTier, 'nameTh' | 'nameEn' | 'nameKo' | 'code'>,
  lang?: string
): string {
  const l = String(lang || '').toLowerCase()
  if (l.startsWith('ko') && tier.nameKo) return tier.nameKo
  if (l.startsWith('en') && tier.nameEn) return tier.nameEn
  if (tier.nameTh) return tier.nameTh
  if (tier.nameEn) return tier.nameEn
  if (tier.nameKo) return tier.nameKo
  return tier.code
}

export function defaultQrOrderStoreSettings(storeCode: string): QrOrderStoreSettings {
  return {
    storeCode: String(storeCode || '').trim(),
    enabled: false,
    mode: 'buffet',
    entryPaymentMode: 'postpay',
    extrasPaymentMode: 'postpay',
    requireStaffOpen: true,
    maxOpenMinutes: 240,
    allowReorderAfterPaid: false,
    printLogoUrl: '',
    printBrandColor: '#b45309',
    printAccentColor: '#faf7f2',
    printBrandLine: '',
  }
}

/** Official POS QR brand assets — served from `public/pos/qr-brands/`. */
export const POS_QR_BRAND = {
  /** Thai_QR_Payment_Logo-01 — full-width header band (913×376). */
  thaiQrHeader: '/pos/qr-brands/thai-qr-header.png',
  /** Thai_QR_Payment_Logo-03 — center of QR (BOT guideline). */
  thaiQrCenterLogo: '/pos/qr-brands/thai-qr-center-logo.png',
  promptpay: '/pos/qr-brands/promptpay.png',
  visa: '/pos/qr-brands/visa.png',
  mastercard: '/pos/qr-brands/mastercard.png',
  unionpay: '/pos/qr-brands/unionpay.png',
} as const

export type PosQrDisplayKind = 'THAI_QR' | 'CREDIT_CARD'

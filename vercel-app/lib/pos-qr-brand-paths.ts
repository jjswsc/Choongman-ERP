/** Official POS QR brand assets — served from `public/pos/qr-brands/`. */
export const POS_QR_BRAND = {
  thaiQrHeader: '/pos/qr-brands/thai-qr-header.png',
  thaiQrIcon: '/pos/qr-brands/thai-qr-icon.png',
  promptpay: '/pos/qr-brands/promptpay.png',
  visa: '/pos/qr-brands/visa.png',
  mastercard: '/pos/qr-brands/mastercard.png',
  unionpay: '/pos/qr-brands/unionpay.png',
} as const

export type PosQrDisplayKind = 'THAI_QR' | 'CREDIT_CARD'

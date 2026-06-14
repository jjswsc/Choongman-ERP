import type { CartPanelPaymentPayload } from '@/components/pos/cart-panel-types'
import { normalizePosPaymentTender } from '@/lib/pos-payment-tender-normalize'

export function buildCustomerDisplayPaymentLines(
  draft: CartPanelPaymentPayload | null,
  t: (k: string) => string
): { label: string; amount: number }[] {
  if (!draft) return []
  const lines: { label: string; amount: number }[] = []
  if (draft.paymentCash > 0) lines.push({ label: t('posPaymentCash') || '현금', amount: draft.paymentCash })
  if (draft.paymentCard > 0) lines.push({ label: t('posPaymentCard') || '카드', amount: draft.paymentCard })
  if (draft.paymentQr > 0) lines.push({ label: t('posPaymentQrCode') || 'QR', amount: draft.paymentQr })
  if (draft.paymentOther > 0) lines.push({ label: t('posPaymentOther') || '기타', amount: draft.paymentOther })
  if ((draft.paymentDeliveryApp || 0) > 0) {
    const ch = draft.deliveryPaymentChannel ? String(draft.deliveryPaymentChannel) : ''
    lines.push({
      label: ch
        ? `${t('posPaymentDeliveryApp') || '배달앱'} (${ch})`
        : t('posPaymentDeliveryApp') || '배달앱',
      amount: draft.paymentDeliveryApp || 0,
    })
  }
  return lines
}

export function resolveCardPaymentAmountForPricing(payment?: CartPanelPaymentPayload | null): number {
  if (!payment) return 0
  return normalizePosPaymentTender({
    paymentCard: payment.paymentCard,
    paymentQr: payment.paymentQr,
    paymentQrType: payment.paymentQrType,
  }).paymentCard
}

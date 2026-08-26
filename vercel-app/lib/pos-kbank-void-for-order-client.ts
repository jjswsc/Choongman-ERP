'use client'

import { appAlert, appConfirm } from '@/lib/app-message'
import { executeKbankVoidForOrder, type KbankVoidForOrderPreview } from '@/lib/api-client'
import { tr as i18nTr, tOr } from '@/lib/i18n'

function formatVoidAmount(amount: number): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '0.00'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function messageForKbankVoidForOrderStatus(
  t: (k: string) => string,
  statusCode: string | null | undefined,
  fallback?: string | null
): string {
  const code = String(statusCode || '').trim()
  switch (code) {
    case 'KBANK_VOID_NEED_MANAGER':
      return tOr(t, 'posKbankVoidNeedManager', 'A manager must Void this KBank payment.')
    case 'KBANK_VOID_NOT_ALLOWED':
      return tOr(t, 'posKbankVoidNotAllowed', 'KBank does not allow Void for this payment.')
    case 'KBANK_VOID_NOT_PAID':
      return tOr(t, 'posKbankVoidNotPaid', 'This payment is not settled yet, so it cannot be voided.')
    case 'KBANK_VOID_NO_PAYMENT_TXN_NO':
      return tOr(
        t,
        'posKbankVoidNoPaymentTxnNo',
        'Payment transaction number was not found. APIC session ids cannot be sent to Void.'
      )
    case 'KBANK_VOID_ALREADY':
      return tOr(t, 'posReceiptPayCorrectKbankVoidAlready', 'This KBank payment was already voided.')
    case 'KBANK_VOID_NO_ATTEMPT':
      return tOr(
        t,
        'posReceiptPayCorrectKbankVoidNoAttempt',
        'No KBank QR transaction was found for this bill.'
      )
    case 'KBANK_VOID_STORE_DENIED':
      return tOr(t, 'posKbankVoidStoreDenied', 'You cannot void a payment for this store.')
    default:
      return String(fallback || '').trim() || tOr(t, 'posKbankVoidFailedAlert', 'Void payment failed.')
  }
}

function confirmText(t: (k: string) => string, preview: KbankVoidForOrderPreview): string {
  return i18nTr(t, 'posKbankVoidForOrderConfirm', {
    orderNo: preview.orderNo || String(preview.orderId || ''),
    amount: formatVoidAmount(preview.amount),
    qrType: preview.qrType || 'THAI_QR',
    txnRef: preview.txnRef || preview.txnNo || '-',
  })
}

export async function runKbankVoidBoundToOrder(params: {
  orderId: number
  t: (k: string) => string
}): Promise<'voided' | 'already' | 'cancelled' | 'blocked'> {
  const orderId = Math.floor(Number(params.orderId) || 0)
  const t = params.t
  if (orderId <= 0) {
    await appAlert(tOr(t, 'posKbankVoidOrderRequired', 'Open a saved bill before Void.'))
    return 'blocked'
  }

  const previewRes = await executeKbankVoidForOrder({ orderId, confirm: false })
  const preview = previewRes.preview
  if (preview?.alreadyVoided || previewRes.alreadyVoided) {
    await appAlert(tOr(t, 'posReceiptPayCorrectKbankVoidAlready', 'This KBank payment was already voided.'))
    return 'already'
  }
  if (!preview?.canVoid) {
    await appAlert(
      messageForKbankVoidForOrderStatus(t, previewRes.statusCode, previewRes.message || previewRes.statusMessage)
    )
    return 'blocked'
  }

  const ok = await appConfirm(confirmText(t, preview))
  if (!ok) return 'cancelled'

  const confirmed = await executeKbankVoidForOrder({ orderId, confirm: true })
  if (confirmed.alreadyVoided && confirmed.success) {
    await appAlert(tOr(t, 'posReceiptPayCorrectKbankVoidAlready', 'This KBank payment was already voided.'))
    return 'already'
  }
  if (!confirmed.success) {
    await appAlert(
      messageForKbankVoidForOrderStatus(t, confirmed.statusCode, confirmed.message || confirmed.statusMessage)
    )
    return 'blocked'
  }
  await appAlert(
    tOr(
      t,
      'posReceiptPayCorrectKbankVoidSuccess',
      'KBank Void succeeded. The bank payment was reversed. Cancel the POS bill if needed.'
    )
  )
  return 'voided'
}

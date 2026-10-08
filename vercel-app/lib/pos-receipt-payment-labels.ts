import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import { getPosPaymentMethodItems } from '@/lib/api-client'
import {
  attachPaymentOtherAdminLabels,
  parsePaymentOtherBreakdown,
} from '@/lib/pos-payment-other-breakdown'

/** 저장된 세부명(adminLabels)이 없으면 매장 결제 라인 이름으로 채운다 */
export async function enrichReceiptModalPaymentLabels(
  data: ReceiptModalData
): Promise<ReceiptModalData> {
  const parsed = parsePaymentOtherBreakdown(data.paymentOtherBreakdown)
  if (!parsed?.admin) return data
  const missing = Object.keys(parsed.admin).some((id) => !String(parsed.adminLabels?.[id] || '').trim())
  if (!missing) return data
  const storeCode = String(data.storeCode || '').trim()
  let items: { id?: string; name?: string }[] = []
  try {
    items = await getPosPaymentMethodItems({ storeCode: storeCode || undefined })
  } catch {
    items = []
  }
  const map: Record<string, string> = {}
  for (const it of items || []) {
    const id = String(it?.id || '').trim()
    const name = String(it?.name || '').trim()
    if (id && name) map[id] = name
  }
  const next = attachPaymentOtherAdminLabels(parsed, map)
  if (!next) return data
  return { ...data, paymentOtherBreakdown: next }
}

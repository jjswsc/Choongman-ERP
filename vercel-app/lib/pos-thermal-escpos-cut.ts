import type { PosPrinterSettings } from '@/lib/api-client'

/**
 * 매장 POS 프린터 설정 기준으로 Windows 하이브리드 셸 ESC/POS 절단 여부.
 * 설정을 불러오지 못한 경우 `undefined` → 셸의 `runtime-config.json`만 따름.
 */
export function resolveEscPosCutOverride(
  settings: PosPrinterSettings | null | undefined,
  opts: { printRole: 'receipt' | 'kitchen'; printReceiptKind?: 'hall_order' | 'payment' }
): boolean | undefined {
  if (!settings) return undefined
  if (opts.printRole === 'kitchen') {
    return settings.escPosCutAfterKitchenHtml !== false
  }
  if (opts.printReceiptKind === 'hall_order') {
    return Boolean(settings.escPosCutAfterHallOrderHtml)
  }
  if (opts.printReceiptKind === 'payment') {
    return Boolean(settings.escPosCutAfterPaymentReceiptHtml)
  }
  return undefined
}

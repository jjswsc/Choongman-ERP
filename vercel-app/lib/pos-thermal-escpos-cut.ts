import type { PosPrinterSettings } from '@/lib/api-client'

/** 미설정은 켬. 명시적 false만 끊음(홀·결제를 Boolean()하면 undefined가 컷 없음이 됨). */
export function isEscPosCutEnabled(value: boolean | undefined | null): boolean {
  return value !== false
}

/**
 * 매장 POS 프린터 설정 기준으로 Windows 하이브리드 셸 ESC/POS 절단 여부.
 * 설정을 불러오지 못한 경우 `undefined` → 셸의 `runtime-config.json`만 따름.
 * QR 손님 전표는 전용 스위치가 없고, 주방=kitchen / หน้าร้าน=hall_order 를 그대로 쓴다.
 */
export function resolveEscPosCutOverride(
  settings: PosPrinterSettings | null | undefined,
  opts: { printRole: 'receipt' | 'kitchen'; printReceiptKind?: 'hall_order' | 'payment' }
): boolean | undefined {
  if (!settings) return undefined
  if (opts.printRole === 'kitchen') {
    return isEscPosCutEnabled(settings.escPosCutAfterKitchenHtml)
  }
  if (opts.printReceiptKind === 'hall_order') {
    return isEscPosCutEnabled(settings.escPosCutAfterHallOrderHtml)
  }
  if (opts.printReceiptKind === 'payment') {
    return isEscPosCutEnabled(settings.escPosCutAfterPaymentReceiptHtml)
  }
  return undefined
}

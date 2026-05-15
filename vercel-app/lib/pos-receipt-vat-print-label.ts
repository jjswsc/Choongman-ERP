import type { PosFeeMode } from '@/lib/pos-pricing'

/** 결제·홀 주문 영수증 인쇄용: VAT 라벨(포함 과금 시 안내 접미) — HTML 이스케이프된 문자열 */
export function buildPosReceiptVatPrintLabelEscaped(params: {
  vatFeeMode?: PosFeeMode
  t: (key: string) => string
  tr: (key: string, fallback: string) => string
  esc: (value: string) => string
}): string {
  const { vatFeeMode, t, tr, esc } = params
  const base = t('posVatLabel') || '부가세'
  const label =
    vatFeeMode === 'included'
      ? `${base}${tr('posVatIncludedInTotalReceiptHint', ' (부가세는 총액에 포함)')}`
      : base
  return esc(label)
}

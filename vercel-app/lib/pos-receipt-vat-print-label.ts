import type { PosFeeMode } from '@/lib/pos-pricing'
import { appendPosReceiptFeeRateLabel } from '@/lib/pos-receipt-totals-print'

/** 결제(손님) 영수증 인쇄용: VAT 라벨(+요율, 포함 과금 시 안내 접미) — HTML 이스케이프된 문자열 */
export function buildPosReceiptVatPrintLabelEscaped(params: {
  vatFeeMode?: PosFeeMode
  vatRate?: number | null
  t: (key: string) => string
  tr: (key: string, fallback: string) => string
  esc: (value: string) => string
}): string {
  const { vatFeeMode, vatRate, tr, esc } = params
  const base = appendPosReceiptFeeRateLabel(tr('posVatReceiptShortLabel', 'VAT'), vatRate)
  const label =
    vatFeeMode === 'included'
      ? `${base}${tr('posVatIncludedInTotalReceiptHint', ' (VAT included)')}`
      : base
  return esc(label)
}

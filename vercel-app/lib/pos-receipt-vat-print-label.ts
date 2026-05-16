import type { PosFeeMode } from '@/lib/pos-pricing'

/** 결제(손님) 영수증 인쇄용: VAT 라벨(포함 과금 시 안내 접미) — HTML 이스케이프된 문자열 */
export function buildPosReceiptVatPrintLabelEscaped(params: {
  vatFeeMode?: PosFeeMode
  t: (key: string) => string
  tr: (key: string, fallback: string) => string
  esc: (value: string) => string
}): string {
  const { vatFeeMode, tr, esc } = params
  const base = tr('posVatReceiptShortLabel', 'VAT')
  const label =
    vatFeeMode === 'included'
      ? `${base}${tr('posVatIncludedInTotalReceiptHint', ' (VAT incl. in total)')}`
      : base
  return esc(label)
}

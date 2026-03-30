/**
 * 영수증 품목 줄 바코드용 텍스트.
 * `id`의 첫 `-` 앞 토큰만 쓰는데, 잘못하면 테이블 번호(예: 4)나 임시 카트 접두어가 바코드로 나간다.
 */

export function posReceiptItemSkuForBarcode(lineItemId: string | undefined | null): string {
  const raw = String(lineItemId ?? '').trim()
  if (!raw) return ''
  const first = raw.split('-')[0]?.trim() ?? ''
  if (!first) return ''
  if (/^cart$/i.test(first)) return ''
  /** 한 자리 숫자만: 메뉴 SKU가 아닌 오탐(테이블 4 등)이 잦음 */
  if (/^\d{1}$/.test(first)) return ''
  return first
}

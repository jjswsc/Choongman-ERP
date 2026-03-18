/**
 * 주방 주문서 HTML 생성 (터미널 .tsx에서 </ 등 파서 혼동 방지)
 */

export function buildKitchenSlipHtml(params: {
  label: string
  orderNo: string
  storeCode: string
  orderTypeLabel: string
  tablePart: string
  dateStr: string
  itemsHtml: string
  memoHtml: string
  paperCss: string
  escapeHtml: (s: string) => string
}): string {
  const { label, orderNo, storeCode, orderTypeLabel, tablePart, dateStr, itemsHtml, memoHtml, paperCss, escapeHtml } = params
  const c = (tag: string) => '\u003c/' + tag + '>'
  return '<!DOCTYPE html><html><head><title>' + escapeHtml(label) + '</title><style>' + paperCss + '.k-header{text-align:center;font-size:22px;font-weight:bold;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:10px;}.k-row{margin:6px 0;font-size:18px;}.k-memo{margin-top:8px;padding:8px;background:#f0f0f0;font-size:16px;}</style>' + c('head') + '<body><div class="k-header">' + escapeHtml(label) + c('div') + '<div class="k-row"><strong>' + escapeHtml(orderNo) + c('strong') + c('div') + '<div class="k-row">' + escapeHtml(storeCode + ' · ' + orderTypeLabel + tablePart) + c('div') + '<div class="k-row">' + dateStr + c('div') + '<hr style="margin:10px 0;" />' + itemsHtml + memoHtml + c('body') + c('html')
}

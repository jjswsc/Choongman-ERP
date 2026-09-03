import { buildReceiptDocumentHtml } from '@/lib/pos-receipt-html'
import { formatAdvanceScheduledAtBangkok } from '@/lib/pos-deposit-domain'

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 선수금 수령 슬립(주방 아님). 방문 시 기존 결제 영수증과 별도. */
export function buildPosDepositReceiveSlipHtml(params: {
  orderNo: string
  storeCode: string
  amount: number
  scheduledAt?: string
  guestPhone?: string
  guestName?: string
  tender?: string
  t: (k: string) => string
  lang?: string
}): string {
  const tr = (k: string, fallback: string) => {
    const v = params.t(k)
    return v && v !== k ? v : fallback
  }
  const amount = Math.max(0, Number(params.amount) || 0)
  const body = `
    <div class="receipt-content">
      <div class="receipt-section-title">${esc(tr('posDepositSlipTitle', 'มัดจำ'))}</div>
      <div class="receipt-row"><span>${esc(tr('posOrderNo', '주문번호'))}</span><span>${esc(params.orderNo || '-')}</span></div>
      <div class="receipt-row"><span>${esc(tr('posStore', '매장'))}</span><span>${esc(params.storeCode || '-')}</span></div>
      ${
        params.scheduledAt
          ? `<div class="receipt-row"><span>${esc(tr('posDepositSlipVisit', '방문'))}</span><span>${esc(formatAdvanceScheduledAtBangkok(params.scheduledAt))}</span></div>`
          : ''
      }
      ${
        params.guestName
          ? `<div class="receipt-row"><span>${esc(tr('posDepositGuestName', '이름'))}</span><span>${esc(params.guestName)}</span></div>`
          : ''
      }
      ${
        params.guestPhone
          ? `<div class="receipt-row"><span>${esc(tr('posDepositPhone', '전화'))}</span><span>${esc(params.guestPhone)}</span></div>`
          : ''
      }
      ${
        params.tender
          ? `<div class="receipt-row"><span>${esc(tr('posDepositTender', '수단'))}</span><span>${esc(params.tender)}</span></div>`
          : ''
      }
      <div class="receipt-divider"></div>
      <div class="receipt-row receipt-total"><span>${esc(tr('posDepositAmount', 'มัดจำ'))}</span><span>${amount.toLocaleString()} ฿</span></div>
    </div>
  `
  return buildReceiptDocumentHtml({
    title: tr('posDepositSlipTitle', 'มัดจำ'),
    bodyContent: body,
    htmlLang: params.lang,
  })
}

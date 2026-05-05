/**
 * 시재(Pay In / Pay Out)·매출 출금 시 열전사용 증빙 슬립 HTML
 */

import type { LangCode } from '@/lib/lang-context'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import { buildReceiptDocumentHtml } from '@/lib/pos-receipt-html'
import { escapeHtml, formatBahtNum } from '@/lib/utils'

function htmlLangAttr(lang: LangCode): string | undefined {
  if (lang === 'th') return 'th'
  if (lang === 'ko') return 'ko'
  if (lang === 'en') return 'en'
  return 'en'
}

function tr(t: (k: string) => string, key: string, fallback: string): string {
  const v = t(key)
  return v && v !== key ? v : fallback
}

export function buildPosTillSlipDocumentHtml(params: {
  t: (k: string) => string
  lang: LangCode
  storeLabel: string
  /** 화면과 동일한 유형 표시명 */
  typeLabel: string
  transType: 'deposit' | 'withdrawal' | 'sales_withdrawal'
  amountBaht: number
  memo?: string
  staffName?: string
  transDate: string
  salesDate?: string
  transactionId?: number
  queued: boolean
  printedAt: Date
}): string {
  const {
    t,
    lang,
    storeLabel,
    typeLabel,
    transType,
    amountBaht,
    memo,
    staffName,
    transDate,
    salesDate,
    transactionId,
    queued,
    printedAt,
  } = params

  const title = tr(t, 'posTillSlipTitle', 'Till receipt')
  const sub = tr(t, 'posTillSlipSubheading', 'Pay In / Pay Out')
  const rows: string[] = []
  rows.push(
    `<div class="receipt-meta-row"><span class="receipt-meta-label">${escapeHtml(tr(t, 'posTillSlipType', 'Type'))}</span><span class="receipt-meta-value">${escapeHtml(typeLabel)}</span></div>`
  )
  rows.push(
    `<div class="receipt-meta-row"><span class="receipt-meta-label">${escapeHtml(tr(t, 'posTillSlipStore', 'Store'))}</span><span class="receipt-meta-value">${escapeHtml(storeLabel)}</span></div>`
  )
  rows.push(
    `<div class="receipt-meta-row"><span class="receipt-meta-label">${escapeHtml(tr(t, 'posTillSlipBookedDate', 'Transaction date'))}</span><span class="receipt-meta-value">${escapeHtml(transDate)}</span></div>`
  )
  if (transType === 'sales_withdrawal' && salesDate) {
    rows.push(
      `<div class="receipt-meta-row"><span class="receipt-meta-label">${escapeHtml(tr(t, 'posTillSlipSalesDate', 'Sales date'))}</span><span class="receipt-meta-value">${escapeHtml(salesDate)}</span></div>`
    )
  }
  if (staffName?.trim()) {
    rows.push(
      `<div class="receipt-meta-row"><span class="receipt-meta-label">${escapeHtml(tr(t, 'posTillSlipStaff', 'Staff'))}</span><span class="receipt-meta-value">${escapeHtml(staffName.trim())}</span></div>`
    )
  }
  rows.push(
    `<div class="receipt-meta-row"><span class="receipt-meta-label">${escapeHtml(tr(t, 'posTillSlipPrintedAt', 'Printed'))}</span><span class="receipt-meta-value">${escapeHtml(formatPosDateTimeMedium(printedAt, lang))}</span></div>`
  )
  if (transactionId != null && Number.isFinite(transactionId)) {
    rows.push(
      `<div class="receipt-meta-row"><span class="receipt-meta-label">${escapeHtml(tr(t, 'posTillSlipRefNo', 'Reference'))}</span><span class="receipt-meta-value">${escapeHtml(String(transactionId))}</span></div>`
    )
  }

  const amtRow = `<div class="receipt-row receipt-total"><span>${escapeHtml(tr(t, 'posTillSlipAmount', 'Amount'))}</span><span>${formatBahtNum(amountBaht)} ฿</span></div>`
  const memoBlock =
    memo && memo.trim()
      ? `<p class="memo"><span class="receipt-muted">${escapeHtml(tr(t, 'posTillSlipNote', 'Note'))}:</span><br/>${escapeHtml(memo.trim())}</p>`
      : ''
  const pending = queued
    ? `<p class="text-xs text-center" style="margin-top:10px">${escapeHtml(tr(t, 'posTillSlipPendingFooter', 'Pending server sync — verify in the ledger when online.'))}</p>`
    : ''

  const body =
    `<div class="receipt-content">` +
    `<div class="receipt-section-title">${escapeHtml(title)}</div>` +
    `<div class="receipt-sub-title">${escapeHtml(sub)}</div>` +
    `<div class="receipt-divider"></div>` +
    rows.join('') +
    `<div class="receipt-divider"></div>` +
    amtRow +
    (memoBlock || pending ? `<div class="receipt-divider"></div>` : '') +
    memoBlock +
    pending +
    `</div>`

  return buildReceiptDocumentHtml({
    title,
    bodyContent: body,
    htmlLang: htmlLangAttr(lang),
  })
}

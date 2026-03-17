'use client'

import { useEffect, useRef } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getPosPrinterSettings } from '@/lib/api-client'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import { escapeHtml } from '@/lib/utils'
import type { PosMenu } from '@/lib/api-client'

export type ReceiptModalData = {
  orderNo: string
  items: { id: string; name: string; price: number; qty: number }[]
  subtotal: number
  discountAmt: number
  deliveryFee?: number
  packagingFee?: number
  total: number
  storeCode: string
  orderType: string
  tableName?: string
  memo?: string
  discountReason?: string
  vatFeeAmt?: number
  vatFeeMode?: 'included' | 'separate'
  serviceFeeAmt?: number
  serviceFeeMode?: 'included' | 'separate'
  cardFeeAmt?: number
  cardFeeMode?: 'included' | 'separate'
  otherFeeAmt?: number
  otherFeeMode?: 'included' | 'separate'
}

const POS_PAPER_WIDTH_MM = 80
const POS_PAPER_SIDE_PADDING_MM = 1
const POS_PAPER_HEIGHT_MM = 200
function getPosPaperBaseCss(fontFamily: string, fontSizePx: number) {
  return `
    @page { size: ${POS_PAPER_WIDTH_MM}mm ${POS_PAPER_HEIGHT_MM}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body {
      width: ${POS_PAPER_WIDTH_MM}mm;
      box-sizing: border-box;
      font-family: ${fontFamily};
      font-size: ${fontSizePx}px;
      padding: ${POS_PAPER_SIDE_PADDING_MM}mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  `
}

interface PosReceiptModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  receiptData: ReceiptModalData | null
  menus: PosMenu[]
  orderTypeLabels: Record<string, string>
  t: (k: string) => string
  autoPrintReceiptOnOrder?: boolean
  autoPrintKitchenSlipOnOrder?: boolean
  receiptBizName?: string
  receiptBizTaxId?: string
  receiptBizOwner?: string
  receiptBizAddress?: string
  receiptBizPhone?: string
  receiptDesignStyle?: 'badge' | 'simple'
  receiptLogoSize?: 'sm' | 'md' | 'lg'
  receiptShowTitle?: boolean
  receiptShowPaidStamp?: boolean
  receiptShowThankYou?: boolean
  receiptShowCustomerCopy?: boolean
}

export function PosReceiptModal({
  open,
  onOpenChange,
  receiptData,
  menus,
  orderTypeLabels,
  t,
  autoPrintReceiptOnOrder = false,
  autoPrintKitchenSlipOnOrder = false,
  receiptBizName = '',
  receiptBizTaxId = '',
  receiptBizOwner = '',
  receiptBizAddress = '',
  receiptBizPhone = '',
  receiptDesignStyle = 'badge',
  receiptLogoSize = 'md',
  receiptShowTitle = true,
  receiptShowPaidStamp = true,
  receiptShowThankYou = true,
  receiptShowCustomerCopy = true,
}: PosReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null)
  const autoPrintedKeyRef = useRef<string>('')
  const tr = (key: string, fallback: string) => {
    const value = t(key)
    return value && value !== key ? value : fallback
  }

  useEffect(() => {
    if (!open) return
    // #region agent log
    const ping = {sessionId:'960801',runId:'run-3',hypothesisId:'H7',location:'pos-receipt-modal.tsx:open',message:'receipt modal opened',data:{hasReceiptData:Boolean(receiptData),orderNoLen:String(receiptData?.orderNo||'').length},timestamp:Date.now()}
    fetch('http://127.0.0.1:7383/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'960801'},body:JSON.stringify(ping)}).catch(()=>{})
    fetch('/api/debugPrintProbe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ping)}).catch(()=>{})
    // #endregion
  }, [open, receiptData])

  const handlePrintReceipt = () => {
    if (!receiptData) return
    const esc = (value: string) => escapeHtml(String(value || ''))
    const parsedMemo = parsePosOrderMemo(receiptData.memo)
    const taxInvoice = parsedMemo.taxInvoice
    const logoUrl = `${window.location.origin}/company-stamp.png`
    const printedAt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date())
    const printContent = `
      <div class="receipt-content">
        <div class="receipt-brand-wrap text-center">
          <img src="${esc(logoUrl)}" alt="Company logo" class="receipt-brand-logo ${esc(receiptLogoSize)}" />
          <div class="receipt-store-name">${esc(receiptData.storeCode)}</div>
        </div>
        <div class="receipt-divider"></div>
        ${
          receiptShowTitle
            ? `<div><div class="receipt-section-title">${esc(tr('posReceipt', '영수증'))}</div><div class="receipt-sub-title">${esc(taxInvoice ? tr('posReceiptTaxInvoice', '세금계산서') : tr('posReceiptSimpleTaxInvoice', '간이 세금계산서'))}</div></div>`
            : ''
        }
        <div class="text-xs">
          <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('posOrderNo', '주문번호'))}</span><span class="receipt-meta-value">${esc(receiptData.orderNo)}</span></div>
          ${
            receiptData.tableName
              ? `<div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('posTable', '테이블'))}</span><span class="receipt-meta-value">${esc(receiptData.tableName)}</span></div>`
              : ''
          }
          <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('date', 'Date'))}</span><span class="receipt-meta-value">${esc(printedAt)}</span></div>
          <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('posOrderType', 'Order Type'))}</span><span class="receipt-meta-value">${esc(orderTypeLabels[receiptData.orderType] || receiptData.orderType)}</span></div>
        </div>
        <div class="receipt-divider"></div>
        ${(receiptBizName || receiptBizTaxId || receiptBizOwner || receiptBizAddress || receiptBizPhone) ? '<div class="text-xs receipt-muted">' : ''}
        ${receiptBizName ? `<div class="receipt-biz" style="color:#111;font-weight:600">${esc(receiptBizName)}</div>` : ''}
        ${receiptBizTaxId ? `<div class="receipt-biz">${esc(tr('posTaxIdLabel', 'Tax ID'))}: ${esc(receiptBizTaxId)}</div>` : ''}
        ${receiptBizOwner ? `<div class="receipt-biz">${esc(tr('posOwner', '대표'))}: ${esc(receiptBizOwner)}</div>` : ''}
        ${receiptBizAddress ? `<div class="receipt-biz">${esc(receiptBizAddress)}</div>` : ''}
        ${receiptBizPhone ? `<div class="receipt-biz">${esc(tr('posTelLabel', 'TEL'))}: ${esc(receiptBizPhone)}</div>` : ''}
        ${(receiptBizName || receiptBizTaxId || receiptBizOwner || receiptBizAddress || receiptBizPhone) ? '</div>' : ''}
        ${
          taxInvoice
            ? `<div class="text-xs" style="border:1px solid #111;padding:6px;margin-top:6px">
                <div style="font-weight:700;margin-bottom:4px">${esc(tr('posReceiptTaxInvoice', '세금계산서'))}</div>
                <div>${esc(tr('posName', '이름'))}: ${esc(taxInvoice.name)}</div>
                <div>${esc(tr('posTaxIdLabel', 'Tax ID'))}: ${esc(taxInvoice.taxId)}</div>
                <div>${esc(tr('posBranchLabel', '지점'))}: ${esc(taxInvoice.branchNo || (taxInvoice.customerType === 'company' ? '00000' : tr('posHeadOffice', '본점')))}</div>
                <div>${esc(tr('posPhone', '전화번호'))}: ${esc(taxInvoice.phone)}</div>
                <div>${esc(tr('email', '이메일'))}: ${esc(taxInvoice.email)}</div>
                <div>${esc(tr('settings_address', '주소'))}: ${esc(taxInvoice.address)}</div>
              </div>`
            : ''
        }
        <div class="receipt-divider-strong"></div>
        <div class="receipt-item-head"><span>${esc(tr('posMenuName', '품목'))}</span><span>${esc(tr('amount', '금액'))}</span></div>
        ${receiptData.items.map((it) => `<div class="receipt-row"><span>${it.qty}x ${esc(it.name)}</span><span>${(it.price * it.qty).toLocaleString()}</span></div>`).join('')}
        <div class="receipt-divider"></div>
        <div class="receipt-row"><span class="receipt-muted">${esc(t('posSubtotal') || '소계')}</span><span>${receiptData.subtotal.toLocaleString()} ฿</span></div>
        ${receiptData.discountAmt > 0 ? `<div class="receipt-row"><span>${esc(t('posDiscount') || '할인')}</span><span>-${receiptData.discountAmt.toLocaleString()} ฿</span></div>` : ''}
        ${(receiptData.deliveryFee ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posDeliveryFee') || '배달 수수료')}</span><span>+${Number(receiptData.deliveryFee || 0).toLocaleString()} ฿</span></div>` : ''}
        ${(receiptData.packagingFee ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posPackagingFee') || '포장 수수료')}</span><span>+${Number(receiptData.packagingFee || 0).toLocaleString()} ฿</span></div>` : ''}
        ${(receiptData.vatFeeAmt ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posVatLabel') || '부가세')}</span><span>${receiptData.vatFeeMode === 'separate' ? '+' : ''}${Number(receiptData.vatFeeAmt || 0).toLocaleString()} ฿</span></div>` : ''}
        ${(receiptData.serviceFeeAmt ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posServiceFee') || '서비스비')}</span><span>${receiptData.serviceFeeMode === 'separate' ? '+' : ''}${Number(receiptData.serviceFeeAmt || 0).toLocaleString()} ฿</span></div>` : ''}
        ${(receiptData.cardFeeAmt ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posCardFee') || '카드비')}</span><span>${receiptData.cardFeeMode === 'separate' ? '+' : ''}${Number(receiptData.cardFeeAmt || 0).toLocaleString()} ฿</span></div>` : ''}
        ${(receiptData.otherFeeAmt ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posOtherFee') || '기타')}</span><span>${receiptData.otherFeeMode === 'separate' ? '+' : ''}${Number(receiptData.otherFeeAmt || 0).toLocaleString()} ฿</span></div>` : ''}
        ${parsedMemo.plainMemo ? `<div class="memo">${esc(tr('posCustomerMemo', '메모'))}: ${esc(parsedMemo.plainMemo)}</div>` : ''}
        <div class="receipt-divider-strong"></div>
        <div class="receipt-row receipt-total"><span>${esc(tr('posTotal', '합계'))}</span><span>${receiptData.total.toLocaleString()} ฿</span></div>
        <div class="receipt-divider"></div>
        ${receiptShowPaidStamp ? `<div class="paid-stamp-wrap"><span class="paid-stamp">${esc(tr('posReceiptPaid', '결제완료'))}</span></div>` : ''}
        ${(receiptShowThankYou || receiptShowCustomerCopy) ? '<div class="text-center text-xs receipt-muted">' : ''}
        ${receiptShowThankYou ? `<div style="font-weight:600;color:#111">${esc(tr('posReceiptThankYou', '감사합니다'))}</div>` : ''}
        ${receiptShowCustomerCopy ? `<div>${esc(tr('posReceiptCustomerCopy', '고객용'))}</div>` : ''}
        ${(receiptShowThankYou || receiptShowCustomerCopy) ? '</div>' : ''}
      </div>
    `
    // #region agent log
    const itemNames = (receiptData.items || []).map((it) => String(it.name || ''))
    const maxItemNameLen = itemNames.reduce((m, n) => Math.max(m, n.length), 0)
    const maxItemTokenLen = itemNames
      .flatMap((n) => n.split(/\s+/))
      .reduce((m, tok) => Math.max(m, tok.length), 0)
    const logH1 = {sessionId:'960801',runId:'run-9',hypothesisId:'H1',location:'pos-receipt-modal.tsx:handlePrintReceipt:entry',message:'modal print entry metrics',data:{orderNoLen:String(receiptData.orderNo||'').length,contentLen:printContent.length,clientWidth:receiptRef.current?.clientWidth ?? -1,scrollWidth:receiptRef.current?.scrollWidth ?? -1,maxItemNameLen,maxItemTokenLen,hasLongToken:maxItemTokenLen>=18,templateSource:'modal-template-v2'},timestamp:Date.now()}
    fetch('http://127.0.0.1:7383/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'960801'},body:JSON.stringify(logH1)}).catch(()=>{});
    fetch('/api/debugPrintProbe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logH1)}).catch(()=>{});
    // #endregion
    // #region agent log
    const logH14 = {sessionId:'960801',runId:'run-13',hypothesisId:'H14',location:'pos-receipt-modal.tsx:handlePrintReceipt:layoutConfig',message:'modal print layout config',data:{bodyPaddingTopMm:0,bodyPaddingLeftMm:0,bodyPaddingRightMm:0.2,bodyPaddingBottomMm:1,receiptWidthMm:73.2,contentPadLeftMm:0,contentPadRightMm:0.8,rowPadRightMm:1.2,metaPadRightMm:1.2,contentMarginTopMm:0,rowTemplate:'minmax(0,1fr)+auto',metaTemplate:'11mm+1fr',contentAlign:'left'},timestamp:Date.now()}
    fetch('http://127.0.0.1:7383/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'960801'},body:JSON.stringify(logH14)}).catch(()=>{});
    fetch('/api/debugPrintProbe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logH14)}).catch(()=>{});
    // #endregion
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert(t('posPrintBlocked') || '팝업이 차단되었습니다. 인쇄를 허용해 주세요.')
      return
    }
    // #region agent log
    const logH20 = {sessionId:'960801',runId:'run-13',hypothesisId:'H20',location:'pos-receipt-modal.tsx:handlePrintReceipt:cssRiskBudget',message:'modal css risk budget',data:{paperWidthMm:80,bodyPaddingLeftMm:0,bodyPaddingRightMm:0.2,receiptWidthMm:73.2,contentPadRightMm:0.8,rowPadRightMm:1.2,horizontalBudgetMm:75.4,contentMarginTopMm:0},timestamp:Date.now()}
    fetch('http://127.0.0.1:7383/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'960801'},body:JSON.stringify(logH20)}).catch(()=>{});
    fetch('/api/debugPrintProbe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logH20)}).catch(()=>{});
    // #endregion
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${t('posReceipt') || '영수증'}</title>
          <style>
            ${getPosPaperBaseCss("'Noto Sans KR', 'Malgun Gothic', Arial, sans-serif", 12)}
            body { font-weight: 600; line-height: 1.42; letter-spacing: 0; color: #000; padding-top: 0; padding-right: 0.2mm; padding-bottom: 1mm; padding-left: 0; }
            .receipt-content { width: 73.2mm; max-width: 73.2mm; margin-left: 0; margin-right: auto; box-sizing: border-box; padding: 0 0.8mm 0 0; }
            .receipt-brand-wrap { text-align: center; }
            .receipt-brand-logo { display: inline-block; width: 120px; height: auto; object-fit: contain; }
            .receipt-brand-logo.sm { width: 84px; }
            .receipt-brand-logo.md { width: 108px; }
            .receipt-brand-logo.lg { width: 132px; }
            .receipt-store-name { margin-top: 4px; font-size: 11px; color: #000; text-align: center; }
            .receipt-brand-badge { display: inline-block; border: 2px solid #111; border-radius: 999px; padding: 4px 12px; font-weight: 700; letter-spacing: 0.08em; }
            .receipt-section-title { text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 2px; }
            .receipt-sub-title { text-align: center; font-size: 11px; color: #000; }
            .receipt-divider { border-top: 1px dashed #000; margin: 8px 0; }
            .receipt-divider-strong { border-top: 2px solid #111; margin: 8px 0; }
            .receipt-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 7px; align-items: start; margin: 4px 0; padding-right: 1.2mm; }
            .receipt-row > span:first-child { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
            .receipt-row > span:last-child { white-space: normal; text-align: right; overflow-wrap: anywhere; word-break: break-word; }
            .receipt-meta-row { display: grid; grid-template-columns: 11mm minmax(0, 1fr); column-gap: 4px; align-items: start; margin: 3px 0; padding-right: 1.2mm; }
            .receipt-meta-label { white-space: nowrap; }
            .receipt-meta-value { min-width: 0; text-align: left; overflow-wrap: anywhere; word-break: break-word; }
            .receipt-item-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 7px; font-size: 11px; font-weight: 700; padding: 0 1.2mm 4px 0; border-bottom: 1px solid #cbd5e1; }
            .receipt-total { margin-top: 8px; padding-top: 4px; font-weight: bold; }
            .receipt-biz { margin: 2px 0; font-size: 11px; }
            .receipt-muted { color: #000; }
            .paid-stamp-wrap { text-align: center; margin: 10px 0; }
            .paid-stamp { display: inline-block; border: 1px solid #111; padding: 2px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; }
            .space-y-2 > * + * { margin-top: 8px; }
            .space-y-1 > * + * { margin-top: 4px; }
            .text-center { text-align: center; }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    // #region agent log
    const logH2 = {sessionId:'960801',runId:'run-2',hypothesisId:'H2',location:'pos-receipt-modal.tsx:handlePrintReceipt:beforePrint',message:'modal print css markers',data:{hasMetaRow:printContent.includes('receipt-meta-row'),hasReceiptRow:printContent.includes('receipt-row'),hasOrderNo:printContent.includes('주문번호')},timestamp:Date.now()}
    fetch('http://127.0.0.1:7383/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'960801'},body:JSON.stringify(logH2)}).catch(()=>{});
    fetch('/api/debugPrintProbe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logH2)}).catch(()=>{});
    // #endregion
    let closed = false
    const safeClose = () => {
      if (closed) return
      closed = true
      printWindow.close()
    }
    printWindow.onafterprint = safeClose
    setTimeout(() => {
      // #region agent log
      fetch('http://127.0.0.1:7383/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'960801'},body:JSON.stringify({sessionId:'960801',runId:'run-1',hypothesisId:'H4',location:'pos-receipt-modal.tsx:handlePrintReceipt:printCall',message:'modal print call timing',data:{closed,onAfterPrintAttached:Boolean(printWindow.onafterprint)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      printWindow.print()
    }, 250)
    setTimeout(safeClose, 30000)
  }

  const handlePrintKitchenSlip = async () => {
    if (!receiptData || !receiptData.storeCode) return
    const win = window.open('', '_blank')
    if (!win) {
      alert(t('posPrintBlocked') || '팝업이 차단되었습니다. 인쇄를 허용해 주세요.')
      return
    }
    try {
      const settings = await getPosPrinterSettings({ storeCode: receiptData.storeCode })
      const categoryByMenuId = Object.fromEntries(menus.map((m) => [String(m.id), m.category]))
      const kitchen1 = settings.kitchen1Categories || []
      const kitchen2 = settings.kitchen2Categories || []
      const mode = settings.kitchenMode || 1

      const toSlips = (): { label: string; items: typeof receiptData.items }[] => {
        if (mode === 1) {
          return [{ label: t('posKitchenOrder') || '주방 주문서', items: receiptData.items }]
        }
        const slip1: typeof receiptData.items = []
        const slip2: typeof receiptData.items = []
        for (const it of receiptData.items) {
          const menuId = String(it.id ?? '').split('-')[0]
          const cat = categoryByMenuId[menuId] ?? ''
          if (kitchen2.includes(cat)) {
            slip2.push(it)
          } else {
            slip1.push(it)
          }
        }
        const result: { label: string; items: typeof receiptData.items }[] = []
        if (slip1.length) result.push({ label: `${t('posKitchen1') || '주방 1'}`, items: slip1 })
        if (slip2.length) result.push({ label: `${t('posKitchen2') || '주방 2'}`, items: slip2 })
        return result.length ? result : [{ label: t('posKitchenOrder') || '주방 주문서', items: receiptData.items }]
      }
      const slips = toSlips()
      const printOne = (idx: number) => {
        if (idx >= slips.length) return
        const slip = slips[idx]
        const w = idx === 0 ? win : window.open('', '_blank')
        if (!w) return
        const kitchenMemo = parsePosOrderMemo(receiptData.memo).plainMemo
        const html = `
          <!DOCTYPE html>
          <html><head><title>${escapeHtml(slip.label)}</title>
          <style>
            ${getPosPaperBaseCss('sans-serif', 18)}
            .k-header { text-align: center; font-size: 22px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
            .k-row { margin: 6px 0; font-size: 18px; }
            .k-memo { margin-top: 8px; padding: 8px; background: #f0f0f0; font-size: 16px; }
          </style></head><body>
          <div class="k-header">${escapeHtml(slip.label)}</div>
          <div class="k-row"><strong>${escapeHtml(receiptData.orderNo)}</strong></div>
          <div class="k-row">${escapeHtml(receiptData.storeCode + ' · ' + (orderTypeLabels[receiptData.orderType] || receiptData.orderType) + (receiptData.tableName ? ` · ${t('posTable') || '테이블'}: ${receiptData.tableName}` : ''))}</div>
          <div class="k-row">${new Date().toLocaleString('ko-KR')}</div>
          <hr style="margin: 10px 0;" />
          ${slip.items.map((it) => `<div class="k-row">${escapeHtml(it.name)} × ${it.qty}</div>`).join('')}
          ${kitchenMemo ? `<div class="k-memo">${escapeHtml((t('posCustomerMemo') || '메모') + ': ' + kitchenMemo)}</div>` : ''}
          </body></html>`
        w.document.write(html)
        w.document.close()
        w.focus()
        let done = false
        const afterPrint = () => {
          if (done) return
          done = true
          w.close()
          if (idx + 1 < slips.length) setTimeout(() => printOne(idx + 1), 400)
        }
        w.onafterprint = afterPrint
        setTimeout(() => w.print(), 250)
        setTimeout(afterPrint, 30000)
      }
      printOne(0)
    } catch (e) {
      win.close()
      alert(String(e))
    }
  }

  useEffect(() => {
    if (!open || !receiptData) return
    if (!autoPrintReceiptOnOrder && !autoPrintKitchenSlipOnOrder) return
    const key = `${receiptData.orderNo}|${receiptData.storeCode}|${receiptData.total}|${receiptData.items.length}`
    if (autoPrintedKeyRef.current === key) return
    autoPrintedKeyRef.current = key

    const timers: ReturnType<typeof setTimeout>[] = []
    if (autoPrintKitchenSlipOnOrder) {
      timers.push(setTimeout(() => {
        void handlePrintKitchenSlip()
      }, 180))
    }
    if (autoPrintReceiptOnOrder) {
      timers.push(setTimeout(() => {
        handlePrintReceipt()
      }, autoPrintKitchenSlipOnOrder ? 780 : 180))
    }
    return () => timers.forEach((id) => clearTimeout(id))
  }, [open, receiptData, autoPrintReceiptOnOrder, autoPrintKitchenSlipOnOrder, handlePrintReceipt, handlePrintKitchenSlip])

  if (!receiptData) return null
  const receiptLogoSrc =
    typeof window !== 'undefined' ? `${window.location.origin}/company-stamp.png` : '/company-stamp.png'
  const issuedAt = new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parsedMemo = parsePosOrderMemo(receiptData.memo)
  const taxInvoice = parsedMemo.taxInvoice

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">
            {t('posOrderSuccess') || '주문 완료'}
          </DialogTitle>
        </DialogHeader>
        <div
          ref={receiptRef}
          className="receipt-content space-y-2 rounded border p-4 text-sm [&_.receipt-row]:grid [&_.receipt-row]:grid-cols-[minmax(0,1fr)_auto] [&_.receipt-row]:gap-x-2 [&_.receipt-row]:items-start [&_.receipt-row>span:first-child]:min-w-0 [&_.receipt-row>span:first-child]:break-words [&_.receipt-row>span:last-child]:text-right [&_.receipt-meta-row]:grid [&_.receipt-meta-row]:grid-cols-[70px_minmax(0,1fr)] [&_.receipt-meta-row]:gap-x-1 [&_.receipt-meta-row]:items-start [&_.receipt-meta-label]:whitespace-nowrap [&_.receipt-meta-value]:min-w-0 [&_.receipt-meta-value]:break-words"
        >
          <div className="receipt-brand-wrap text-center">
            <img
              src={receiptLogoSrc}
              alt="Company logo"
              className={`receipt-brand-logo inline-block ${receiptDesignStyle} ${receiptLogoSize}`}
            />
            <div className="receipt-store-name">{receiptData.storeCode}</div>
          </div>

          <div className="receipt-divider border-t border-dashed border-slate-400 my-2" />

          {receiptShowTitle && (
            <div>
              <div className="receipt-section-title text-center text-sm font-semibold tracking-wide">{tr('posReceipt', '영수증')}</div>
              <div className="receipt-sub-title text-center text-xs text-slate-500">{taxInvoice ? tr('posReceiptTaxInvoice', '세금계산서') : tr('posReceiptSimpleTaxInvoice', '간이 세금계산서')}</div>
            </div>
          )}

          <div className="text-xs">
            <div className="receipt-meta-row"><span className="receipt-meta-label receipt-muted text-slate-500">{tr('posOrderNo', '주문번호')}</span><span className="receipt-meta-value">{receiptData.orderNo}</span></div>
            {receiptData.tableName && (
              <div className="receipt-meta-row"><span className="receipt-meta-label receipt-muted text-slate-500">{tr('posTable', '테이블')}</span><span className="receipt-meta-value">{receiptData.tableName}</span></div>
            )}
            <div className="receipt-meta-row"><span className="receipt-meta-label receipt-muted text-slate-500">{tr('date', 'Date')}</span><span className="receipt-meta-value">{issuedAt}</span></div>
            <div className="receipt-meta-row"><span className="receipt-meta-label receipt-muted text-slate-500">{tr('posOrderType', 'Order Type')}</span><span className="receipt-meta-value">{orderTypeLabels[receiptData.orderType] || receiptData.orderType}</span></div>
          </div>

          <div className="receipt-divider border-t border-dashed border-slate-400 my-2" />

          {(receiptBizName || receiptBizTaxId || receiptBizOwner || receiptBizAddress || receiptBizPhone) && (
            <div className="text-xs receipt-muted text-slate-500">
              {receiptBizName && <div className="receipt-biz" style={{ color: '#111', fontWeight: 600 }}>{receiptBizName}</div>}
              {receiptBizTaxId && <div className="receipt-biz">{tr('posTaxIdLabel', 'Tax ID')}: {receiptBizTaxId}</div>}
              {receiptBizOwner && <div className="receipt-biz">{tr('posOwner', '대표')}: {receiptBizOwner}</div>}
              {receiptBizAddress && <div className="receipt-biz">{receiptBizAddress}</div>}
              {receiptBizPhone && <div className="receipt-biz">{tr('posTelLabel', 'TEL')}: {receiptBizPhone}</div>}
            </div>
          )}
          {taxInvoice && (
            <div className="text-xs border border-black p-1.5">
              <div className="font-semibold mb-1">{tr('posReceiptTaxInvoice', '세금계산서')}</div>
              <div>{tr('posName', '이름')}: {taxInvoice.name}</div>
              <div>{tr('posTaxIdLabel', 'Tax ID')}: {taxInvoice.taxId}</div>
              <div>{tr('posBranchLabel', '지점')}: {taxInvoice.branchNo || (taxInvoice.customerType === 'company' ? '00000' : tr('posHeadOffice', '본점'))}</div>
              <div>{tr('posPhone', '전화번호')}: {taxInvoice.phone}</div>
              <div>{tr('email', '이메일')}: {taxInvoice.email}</div>
              <div>{tr('settings_address', '주소')}: {taxInvoice.address}</div>
            </div>
          )}

          <div className="receipt-divider-strong border-t-2 border-black my-2" />

          <div className="receipt-item-head flex justify-between text-xs font-semibold border-b border-slate-300 pb-1">
            <span>{tr('posMenuName', '품목')}</span>
            <span>{tr('amount', '금액')}</span>
          </div>

          <div className="space-y-1">
            {receiptData.items.map((it) => (
              <div key={it.id} className="text-xs">
                <div className="receipt-row">
                  <span>{it.qty}x {it.name}</span>
                  <span className="tabular-nums">{(it.price * it.qty).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="receipt-divider border-t border-dashed border-slate-400 my-2" />

          <div className="receipt-row flex justify-between text-xs">
            <span className="receipt-muted text-slate-500">{t('posSubtotal') || '소계'}</span>
            <span className="tabular-nums">{receiptData.subtotal.toLocaleString()} ฿</span>
          </div>
          {receiptData.discountAmt > 0 && (
            <div className="receipt-row flex justify-between text-xs text-green-700">
              <span>
                {t('posDiscount') || '할인'}
                {receiptData.discountReason ? ` ${receiptData.discountReason}` : ''}
              </span>
              <span className="tabular-nums">-{receiptData.discountAmt.toLocaleString()} ฿</span>
            </div>
          )}
          {(receiptData.deliveryFee ?? 0) > 0 && (
            <div className="receipt-row flex justify-between text-xs">
              <span>{t('posDeliveryFee') || '배달 수수료'}</span>
              <span className="tabular-nums">+{receiptData.deliveryFee?.toLocaleString()} ฿</span>
            </div>
          )}
          {(receiptData.packagingFee ?? 0) > 0 && (
            <div className="receipt-row flex justify-between text-xs">
              <span>{t('posPackagingFee') || '포장 수수료'}</span>
              <span className="tabular-nums">+{receiptData.packagingFee?.toLocaleString()} ฿</span>
            </div>
          )}
          {(receiptData.vatFeeAmt ?? 0) > 0 && (
            <div className="receipt-row flex justify-between text-xs">
              <span>{t('posVatLabel') || '부가세'}</span>
              <span className="tabular-nums">{receiptData.vatFeeMode === 'included' ? '' : '+'}{receiptData.vatFeeAmt?.toLocaleString()} ฿</span>
            </div>
          )}
          {(receiptData.serviceFeeAmt ?? 0) > 0 && (
            <div className="receipt-row flex justify-between text-xs">
              <span>{t('posServiceFee') || '서비스비'}</span>
              <span className="tabular-nums">{receiptData.serviceFeeMode === 'included' ? '' : '+'}{receiptData.serviceFeeAmt?.toLocaleString()} ฿</span>
            </div>
          )}
          {(receiptData.cardFeeAmt ?? 0) > 0 && (
            <div className="receipt-row flex justify-between text-xs">
              <span>{t('posCardFee') || '카드비'}</span>
              <span className="tabular-nums">{receiptData.cardFeeMode === 'included' ? '' : '+'}{receiptData.cardFeeAmt?.toLocaleString()} ฿</span>
            </div>
          )}
          {(receiptData.otherFeeAmt ?? 0) > 0 && (
            <div className="receipt-row flex justify-between text-xs">
              <span>{t('posOtherFee') || '기타'}</span>
              <span className="tabular-nums">{receiptData.otherFeeMode === 'included' ? '' : '+'}{receiptData.otherFeeAmt?.toLocaleString()} ฿</span>
            </div>
          )}
          {parsedMemo.plainMemo && (
            <div className="text-xs text-muted-foreground">
              {tr('posCustomerMemo', '메모')}: {parsedMemo.plainMemo}
            </div>
          )}
          <div className="receipt-divider-strong border-t-2 border-black my-2" />
          <div className="receipt-total receipt-row">
            <span className="font-bold">{t('posTotal') || '합계'}</span>
            <span className="tabular-nums text-base font-bold">{receiptData.total.toLocaleString()} ฿</span>
          </div>
          <div className="receipt-divider border-t border-dashed border-slate-400 my-2" />
          {receiptShowPaidStamp && (
            <div className="paid-stamp-wrap text-center my-2">
              <span className="paid-stamp inline-block border border-black px-3 py-0.5 text-xs font-semibold tracking-widest">{tr('posReceiptPaid', '결제완료')}</span>
            </div>
          )}
          {(receiptShowThankYou || receiptShowCustomerCopy) && (
            <div className="text-center text-xs receipt-muted text-slate-500">
              {receiptShowThankYou && <div className="font-semibold" style={{ color: '#111' }}>{tr('posReceiptThankYou', '감사합니다')}</div>}
              {receiptShowCustomerCopy && <div>{tr('posReceiptCustomerCopy', '고객용')}</div>}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrintReceipt}>
            <Printer className="h-4 w-4" />
            {t('posPrint') || '인쇄'}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrintKitchenSlip}>
            <Printer className="h-4 w-4" />
            {t('posKitchenSlip') || '주방 주문서'}
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            {t('close') || '닫기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

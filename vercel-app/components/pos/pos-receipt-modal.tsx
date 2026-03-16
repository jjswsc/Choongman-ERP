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
const POS_PAPER_SIDE_PADDING_MM = 3
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

  const handlePrintReceipt = () => {
    if (!receiptRef.current || !receiptData) return
    const printContent = receiptRef.current.innerHTML
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert(t('posPrintBlocked') || '팝업이 차단되었습니다. 인쇄를 허용해 주세요.')
      return
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${t('posReceipt') || '영수증'}</title>
          <style>
            ${getPosPaperBaseCss("'Courier New', monospace", 12)}
            body { font-weight: 600; line-height: 1.4; letter-spacing: 0.01em; color: #000; }
            .receipt-content { width: 72mm; max-width: 72mm; margin: 0 auto; }
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
            .receipt-row { display: flex; justify-content: space-between; margin: 4px 0; }
            .receipt-item-head { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; padding-bottom: 4px; border-bottom: 1px solid #cbd5e1; }
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
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
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
          ${receiptData.memo ? `<div class="k-memo">${escapeHtml((t('posCustomerMemo') || '메모') + ': ' + receiptData.memo)}</div>` : ''}
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
          className="receipt-content space-y-2 rounded border p-4 text-sm"
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
              <div className="receipt-section-title text-center text-sm font-semibold tracking-wide">RECEIPT</div>
              <div className="receipt-sub-title text-center text-xs text-slate-500">Tax Invoice (ABB)</div>
            </div>
          )}

          <div className="text-xs">
            <div className="receipt-row"><span className="receipt-muted text-slate-500">Order #</span><span>{receiptData.orderNo}</span></div>
            {receiptData.tableName && (
              <div className="receipt-row"><span className="receipt-muted text-slate-500">{t('posTable') || '테이블'}</span><span>{receiptData.tableName}</span></div>
            )}
            <div className="receipt-row"><span className="receipt-muted text-slate-500">{t('date') || 'Date'}</span><span>{issuedAt}</span></div>
            <div className="receipt-row"><span className="receipt-muted text-slate-500">{t('posOrderType') || 'Order Type'}</span><span>{orderTypeLabels[receiptData.orderType] || receiptData.orderType}</span></div>
          </div>

          <div className="receipt-divider border-t border-dashed border-slate-400 my-2" />

          {(receiptBizName || receiptBizTaxId || receiptBizOwner || receiptBizAddress || receiptBizPhone) && (
            <div className="text-xs receipt-muted text-slate-500">
              {receiptBizName && <div className="receipt-biz" style={{ color: '#111', fontWeight: 600 }}>{receiptBizName}</div>}
              {receiptBizTaxId && <div className="receipt-biz">Tax ID: {receiptBizTaxId}</div>}
              {receiptBizOwner && <div className="receipt-biz">{t('posOwner') || '대표'}: {receiptBizOwner}</div>}
              {receiptBizAddress && <div className="receipt-biz">{receiptBizAddress}</div>}
              {receiptBizPhone && <div className="receipt-biz">TEL: {receiptBizPhone}</div>}
            </div>
          )}

          <div className="receipt-divider-strong border-t-2 border-black my-2" />

          <div className="receipt-item-head flex justify-between text-xs font-semibold border-b border-slate-300 pb-1">
            <span>ITEM</span>
            <span>AMOUNT</span>
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
          {receiptData.memo && (
            <div className="text-xs text-muted-foreground">
              {t('posCustomerMemo') || '메모'}: {receiptData.memo}
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
              <span className="paid-stamp inline-block border border-black px-3 py-0.5 text-xs font-semibold tracking-widest">PAID</span>
            </div>
          )}
          {(receiptShowThankYou || receiptShowCustomerCopy) && (
            <div className="text-center text-xs receipt-muted text-slate-500">
              {receiptShowThankYou && <div className="font-semibold" style={{ color: '#111' }}>Thank you!</div>}
              {receiptShowCustomerCopy && <div>Customer Copy</div>}
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

'use client'

import { useRef } from 'react'
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
}

const POS_PAPER_WIDTH_MM = 80
const POS_PAPER_SIDE_PADDING_MM = 3
function getPosPaperBaseCss(fontFamily: string, fontSizePx: number) {
  return `
    @page { size: ${POS_PAPER_WIDTH_MM}mm auto; margin: 0; }
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
}

export function PosReceiptModal({
  open,
  onOpenChange,
  receiptData,
  menus,
  orderTypeLabels,
  t,
}: PosReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null)

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
            .receipt-content { }
            .receipt-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
            .receipt-row { display: flex; justify-content: space-between; margin: 4px 0; }
            .receipt-total { border-top: 1px dashed #000; margin-top: 8px; padding-top: 8px; font-weight: bold; }
            .space-y-2 > * + * { margin-top: 8px; }
            .space-y-1 > * + * { margin-top: 4px; }
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

  if (!receiptData) return null

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
          <div className="receipt-header">
            <div className="font-bold">CHOONGMAN</div>
            <div className="text-xs text-muted-foreground">{receiptData.orderNo}</div>
            <div className="text-xs">
              {receiptData.storeCode} · {orderTypeLabels[receiptData.orderType] || receiptData.orderType}
              {receiptData.tableName && ` · ${t('posTable') || '테이블'}: ${receiptData.tableName}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date().toLocaleString('ko-KR')}
            </div>
          </div>
          <div className="space-y-1">
            {receiptData.items.map((it) => (
              <div key={it.id} className="receipt-row flex justify-between">
                <span>
                  {it.name} × {it.qty}
                </span>
                <span className="tabular-nums">
                  {(it.price * it.qty).toLocaleString()} ฿
                </span>
              </div>
            ))}
          </div>
          <div className="receipt-row flex justify-between text-xs border-t pt-2 mt-2">
            <span>{t('posSubtotal') || '소계'}</span>
            <span className="tabular-nums">{receiptData.subtotal.toLocaleString()} ฿</span>
          </div>
          {receiptData.discountAmt > 0 && (
            <div className="receipt-row flex justify-between text-xs text-green-600">
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
          {receiptData.memo && (
            <div className="text-xs text-muted-foreground">
              {t('posCustomerMemo') || '메모'}: {receiptData.memo}
            </div>
          )}
          <div className="receipt-total flex justify-between">
            <span>{t('posInputTotal') || '합계'}</span>
            <span className="tabular-nums">{receiptData.total.toLocaleString()} ฿</span>
          </div>
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

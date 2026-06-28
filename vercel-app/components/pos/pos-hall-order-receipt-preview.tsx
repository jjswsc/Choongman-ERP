'use client'

import type { ReactNode } from 'react'
import { cn, formatBahtNum } from '@/lib/utils'
import {
  formatPosPrintOrderTypeLabel,
  formatPosReceiptOrderNoDisplay,
  pickPosChannelOrderNo,
  resolveReceiptTableForPrint,
} from '@/lib/pos-delivery-platform'
import { formatPosOrderNoDigitsOnly } from '@/lib/pos-order-no'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import { translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'
import type { LangCode } from '@/lib/lang-context'

export type PosHallOrderReceiptPreviewItem = {
  id: string
  name: string
  price: number
  qty: number
  promoLines?: string[]
}

export type PosHallOrderReceiptPreviewProps = {
  storeCode: string
  orderNo: string
  orderType: string
  orderTypeLabels?: Record<string, string>
  tableName?: string
  memo?: string
  items: PosHallOrderReceiptPreviewItem[]
  discountAmt: number
  discountReason?: string
  deliveryFee?: number
  packagingFee?: number
  total: number
  guestCount?: number
  printedAt?: Date
  className?: string
  t: (key: string) => string
  lang: LangCode
}

function ChannelTokenEmphasis({ token }: { token: string }) {
  return <span className="receipt-delivery-channel-no font-bold leading-tight [font-size:2em]">{token}</span>
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="receipt-meta-row grid grid-cols-[22mm_minmax(0,1fr)] gap-x-3 text-xs">
      <span className="font-semibold text-neutral-700">{label}</span>
      <span className="font-semibold text-black">{value}</span>
    </div>
  )
}

export function PosHallOrderReceiptPreview({
  storeCode: _storeCode,
  orderNo,
  orderType,
  orderTypeLabels = {},
  tableName,
  memo,
  items,
  discountAmt,
  discountReason,
  deliveryFee,
  packagingFee,
  total,
  guestCount,
  printedAt,
  className,
  t,
  lang,
}: PosHallOrderReceiptPreviewProps) {
  const tr = (key: string, fallback: string) => {
    const value = t(key)
    return value && value !== key ? value : fallback
  }
  const parsedMemo = parsePosOrderMemo(memo)
  const at = printedAt && !Number.isNaN(printedAt.getTime()) ? printedAt : new Date()
  const orderTypeLabelText = formatPosPrintOrderTypeLabel({
    orderType,
    tableName,
    orderNo,
    memo,
    t: (k) => {
      if (k === 'posOrderTypeDelivery') return orderTypeLabels.delivery || tr('posOrderTypeDelivery', 'Delivery')
      if (k === 'posOrderTypeTakeout') return orderTypeLabels.takeout || tr('posOrderTypeTakeout', 'Takeaway')
      if (k === 'posOrderTypeDineIn') return orderTypeLabels.dine_in || tr('posOrderTypeDineIn', 'Dine In')
      return orderTypeLabels[normalizePosOrderTypeKey(k)] || tr(k, '')
    },
  })
  const channelOrderPick = pickPosChannelOrderNo({ tableName, orderNo, memo })
  const orderNoForPrint = formatPosReceiptOrderNoDisplay({
    posOrderNo: orderNo,
    tableName,
    memo,
  })
  const tableDisplay = tableName
    ? resolveReceiptTableForPrint({
        tableName,
        channelPick: channelOrderPick,
        translate: (raw) => translateReceiptTableDisplayName(raw, t),
      })
    : ''
  const guestN = Math.max(0, Math.min(99, Math.trunc(Number(guestCount ?? 0) || 0)))
  const posOrderNoDigits = formatPosOrderNoDigitsOnly(orderNo)

  return (
    <div className={cn('receipt-content receipt-order-simple space-y-2 text-sm text-black', className)}>
      <div className="receipt-order-header text-center">
        <div className="receipt-order-label text-[11px] font-extrabold leading-snug">
          {tr('posOrderNo', '주문')}{' '}
          {channelOrderPick.kind !== 'pos_order' && channelOrderPick.text.trim() ? (
            <>
              #<ChannelTokenEmphasis token={channelOrderPick.text.trim()} />
            </>
          ) : (
            <>#{orderNoForPrint}</>
          )}
          <span className="receipt-order-type-chip receipt-order-type-chip--inline ml-1 inline-block rounded-full border-[1.4px] border-black bg-white px-2 py-0.5 text-[10px] font-extrabold tracking-wide">
            {orderTypeLabelText}
          </span>
        </div>
      </div>
      <div className="receipt-divider border-t border-dashed border-black" />
      <div className="text-xs">
        {tableDisplay ? <MetaRow label={tr('posTable', '테이블')} value={tableDisplay} /> : null}
        {guestN > 0 ? <MetaRow label={tr('posOrderGuestCount', 'Guests')} value={String(guestN)} /> : null}
        <MetaRow label={tr('date', 'Date')} value={formatPosDateTimeMedium(at, lang)} />
        {posOrderNoDigits ? (
          <MetaRow label={tr('posOrderNo', '주문번호')} value={posOrderNoDigits} />
        ) : null}
      </div>
      <div className="receipt-divider border-t border-dashed border-black" />
      <div className="receipt-item-head grid grid-cols-[1fr_16mm] gap-1 border-b border-black pb-1 text-[11px] font-bold">
        <span>{tr('posMenuName', '품목')}</span>
        <span className="text-right text-[10px]">{tr('amount', '금액')}</span>
      </div>
      <div className="space-y-1">
        {items.map((it) => (
          <div key={it.id}>
            <div className="receipt-row grid grid-cols-[1fr_16mm] gap-1">
              <span>
                {it.qty}x {it.name}
              </span>
              <span className="text-right tabular-nums text-[10px]">{formatBahtNum(it.price * it.qty)}</span>
            </div>
            {Array.isArray(it.promoLines) && it.promoLines.length > 0
              ? it.promoLines.map((line, li) => (
                  <div
                    key={`${it.id}-promo-${li}`}
                    className="receipt-line-note ml-[2.3mm] text-[10px] font-semibold text-neutral-800"
                  >
                    - {line}
                  </div>
                ))
              : null}
          </div>
        ))}
      </div>
      {parsedMemo.taxInvoice ? (
        <div className="text-xs border border-black p-2">
          <div className="mb-1 font-semibold">{tr('posReceiptTaxInvoice', '세금계산서')}</div>
          <div>
            {tr('posTaxCustomerTypeLabel', '구분')}:{' '}
            {parsedMemo.taxInvoice.customerType === 'company'
              ? tr('posTaxCustomerCorporate', '법인')
              : tr('posTaxCustomerIndividual', '개인')}
          </div>
          <div>
            {tr('posName', '이름')}: {parsedMemo.taxInvoice.name}
          </div>
          <div>
            {tr('posTaxIdLabel', 'Tax ID')}: {parsedMemo.taxInvoice.taxId}
          </div>
          <div>
            {tr('posBranchLabel', '지점')}:{' '}
            {parsedMemo.taxInvoice.branchNo ||
              (parsedMemo.taxInvoice.customerType === 'company' ? '00000' : tr('posHeadOffice', '본점'))}
          </div>
          <div>
            {tr('settings_address', '주소')}: {parsedMemo.taxInvoice.address}
          </div>
          <div>
            {tr('posPhone', '전화번호')}: {parsedMemo.taxInvoice.phone}
          </div>
          <div>
            {tr('posTaxEmailLabel', 'E-mail')}: {parsedMemo.taxInvoice.email}
          </div>
        </div>
      ) : null}
      {parsedMemo.plainMemo ? (
        <div className="memo text-xs">
          {tr('posCustomerMemo', '메모')}: {parsedMemo.plainMemo}
        </div>
      ) : null}
      <div className="receipt-divider border-t border-dashed border-black" />
      {discountAmt > 0 ? (
        <div className="receipt-row discount grid grid-cols-[1fr_16mm] gap-1 text-xs font-bold text-green-700">
          <span>
            {tr('posDiscount', '할인')}
            {discountReason ? ` ${discountReason}` : ''}
          </span>
          <span className="text-right tabular-nums">-{formatBahtNum(discountAmt)}</span>
        </div>
      ) : null}
      {(deliveryFee ?? 0) > 0 ? (
        <div className="receipt-row grid grid-cols-[1fr_16mm] gap-1 text-xs">
          <span>{tr('posDeliveryFee', '배달 수수료')}</span>
          <span className="text-right tabular-nums">+{formatBahtNum(deliveryFee)}</span>
        </div>
      ) : null}
      {(packagingFee ?? 0) > 0 ? (
        <div className="receipt-row grid grid-cols-[1fr_16mm] gap-1 text-xs">
          <span>{tr('posPackagingFee', '포장 수수료')}</span>
          <span className="text-right tabular-nums">+{formatBahtNum(packagingFee)}</span>
        </div>
      ) : null}
      <div className="receipt-divider border-t border-dashed border-black" />
      <div className="receipt-row receipt-total grid grid-cols-[1fr_16mm] gap-1 font-bold">
        <span>{tr('posTotal', '합계')}</span>
        <span className="text-right tabular-nums">{formatBahtNum(total)}</span>
      </div>
    </div>
  )
}

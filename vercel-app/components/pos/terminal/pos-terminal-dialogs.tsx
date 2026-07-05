'use client'

import { appAlert } from '@/lib/app-message'
import type { RefObject } from 'react'
import { QrCode as QrCodeIcon } from 'lucide-react'
import { LiveMenuSearchDialog } from '@/components/pos/live-menu-search-dialog'
import { PosKbankPaymentOutcomeDialog } from '@/components/pos/pos-kbank-payment-outcome-dialog'
import { PosPostPaymentCashChangeDialog } from '@/components/pos/pos-post-payment-cash-change-dialog'
import { DeliveryEditOrderNoDialog } from '@/components/pos/delivery-edit-order-no-dialog'
import { PosReceiptModal, type ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import { PosQrGuidelineCard } from '@/components/pos/pos-qr-guideline-card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PosTaxInvoiceData } from '@/lib/pos-tax-invoice'
import {
  PosTaxInvoiceFieldLabel,
  PosTaxInvoiceRequiredLegend,
  PosTaxInvoiceValidationAlert,
} from '@/components/pos/pos-tax-invoice-form-ui'
import { taxInvoiceFromRecipientRow } from '@/lib/pos-terminal-tax-invoice'
import type { PosTaxInvoiceRecipientRow, PosMenu, PosPrinterSettings, PosDeliveryApp } from '@/lib/api-client'
import type { Order } from '@/lib/pos-types'
import type { PosOrderReceiptLineOptions } from '@/lib/pos-payment-receipt-from-order'
import { KBANK_RATE_LIMIT_BACKOFF_MS } from '@/lib/payments/kbank-api-reference'

export type KbankOutcomeState = {
  kind: 'success' | 'cancelled' | 'voided'
  amount: number
  refId: string
  paymentMethod?: string
  cardLabel?: string
  approvalCode?: string
  timeLabel?: string
}

type TaxInvoiceDialogsProps = {
  targetOrder: Order | null
  onDismiss: () => void
  saving: boolean
  searchField: 'taxId' | 'name' | 'phone'
  onSearchFieldChange: (v: 'taxId' | 'name' | 'phone') => void
  searchKeyword: string
  onSearchKeywordChange: (v: string) => void
  searchLoading: boolean
  searchRows: PosTaxInvoiceRecipientRow[]
  searchMessage: string
  onSearch: () => void | Promise<void>
  onApplyProfile: (profile: PosTaxInvoiceData) => void
  branchRequired: boolean
  formErrors: string[]
  customerType: 'person' | 'company'
  onCustomerTypeChange: (v: 'person' | 'company') => void
  memberNo: string
  onMemberNoChange: (v: string) => void
  name: string
  onNameChange: (v: string) => void
  taxId: string
  onTaxIdChange: (v: string) => void
  branchNo: string
  onBranchNoChange: (v: string) => void
  phone: string
  onPhoneChange: (v: string) => void
  email: string
  onEmailChange: (v: string) => void
  address: string
  onAddressChange: (v: string) => void
  onSave: () => void | Promise<void>
}

type KbankStaffMonitorProps = {
  visible: boolean
  tourAttr?: string
  liveQrPayload: string
  callbackState: 'idle' | 'waiting' | 'received' | 'failed'
  effectiveQrAmount: number
  effectiveQrType: 'THAI_QR' | 'CREDIT_CARD'
  qrTypeLabel: string
  sentQrTypeCode: string
  linkposQrBridgeStatus: 'idle' | 'ok' | 'failed'
  generateAuditText: string
  effectiveStaffQrPayload: string
  opsTxnUid: string
  opsOrigTxnUid: string
  opsTxnNo: string
  onOpsTxnNoChange: (v: string) => void
  opsTerminalId: string
  onOpsTerminalIdChange: (v: string) => void
  opsBusy: boolean
  opsLastResult: string
  apiPausedUntilMs: number
  isPilotStore: boolean
  onFollowupAction: (action: 'inquiry' | 'settlement' | 'cancel' | 'void') => void | Promise<void>
  onClearSession: () => void
}

type ReceiptDialogsProps = {
  data: ReceiptModalData | null
  onOpenChange: (open: boolean) => void
  onSuppressDismiss: () => void
  onAutoPrintComplete: () => void
  menus: PosMenu[]
  orderTypeLabels: { dine_in: string; takeout: string; delivery: string }
  autoPrintReceiptOnOrder: boolean
  autoPrintReceiptOnAddOrder: boolean
  autoPrintReceiptOnPayment: boolean
  autoPrintKitchenSlipOnOrder: boolean
  receiptBizName: string
  receiptBizTaxId: string
  receiptBizAbn: string
  receiptBizOwner: string
  receiptBizAddress: string
  receiptBizPhone: string
  receiptDesignStyle: 'badge' | 'simple'
  receiptLogoSize: 'sm' | 'md' | 'lg'
  receiptShowTitle: boolean
  receiptShowPaidStamp: boolean
  receiptShowThankYou: boolean
  receiptShowCustomerCopy: boolean
  receiptFooterPrimaryText: string
  receiptFooterSecondaryText: string
  receiptLogoImageUrl: string
  receiptStampImageUrl: string
  receiptShowStamp: boolean
  receiptStampOnlyTaxInvoice: boolean
  receiptMembershipQrImageUrl: string
  receiptMembershipQrLinkUrl: string
  receiptMembershipQrText: string
  receiptShowMembershipQr: boolean
  signatureLine: boolean
  receiptBarcode: boolean
  itemBarcode: boolean
  printerSettingsRef: RefObject<PosPrinterSettings | null>
  kitchenPromoLineEnrich: PosOrderReceiptLineOptions
  onPaymentVoidClick: () => void | Promise<void>
  paymentVoidEnabled: boolean
  paymentVoidBusy: boolean
}

export type PosTerminalDialogsProps = {
  t: (key: string) => string
  tPrint: (key: string) => string
  isPosDemo: boolean
  taxInvoice: TaxInvoiceDialogsProps
  kbankOutcome: {
    state: KbankOutcomeState | null
    onOpenChange: (open: boolean) => void
    onViewAllOrders: () => void
    onCreateNewQr: () => void
  }
  kbankStaffMonitor: KbankStaffMonitorProps
  liveMenuSearch: {
    open: boolean
    onOpenChange: (open: boolean) => void
    storeCode: string
    onServedUpdated: () => void | Promise<void>
  }
  postPaymentCashChange: {
    amountBaht: number | null
    onDismiss: () => void
  }
  receipt: ReceiptDialogsProps
  deliveryEditOrderNo: {
    open: boolean
    onOpenChange: (open: boolean) => void
    order: Order | null | undefined
    value: string
    onValueChange: (v: string) => void
    onSaved: (newTableName: string) => void | Promise<void>
    deliveryApps: PosDeliveryApp[]
  }
}

export function PosTerminalDialogs({
  t,
  tPrint,
  isPosDemo,
  taxInvoice,
  kbankOutcome,
  kbankStaffMonitor,
  liveMenuSearch,
  postPaymentCashChange,
  receipt,
  deliveryEditOrderNo,
}: PosTerminalDialogsProps) {
  const ti = taxInvoice
  const km = kbankStaffMonitor

  return (
    <>
      <Dialog
        open={ti.targetOrder != null}
        onOpenChange={(open) => {
          if (!open) ti.onDismiss()
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('posReceiptTaxInvoice') || '세금계산서'}</DialogTitle>
            <DialogDescription className="text-left">
              <span className="font-mono text-foreground">{ti.targetOrder?.orderNo || '-'}</span>
              <span className="mt-2 block text-xs text-muted-foreground">
                {t('posTaxInvoicePrePaymentHint') ||
                  '결제 전에도 저장할 수 있습니다. 결제 시 영수증에 반영되며, 메인 포스에서 인쇄됩니다.'}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2">
              <Select value={ti.searchField} onValueChange={(v) => ti.onSearchFieldChange(v as 'taxId' | 'name' | 'phone')}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="taxId">{t('posTaxIdLabel') || 'Tax ID'}</SelectItem>
                  <SelectItem value="name">{t('company_name') || t('posName') || '이름'}</SelectItem>
                  <SelectItem value="phone">{t('posPhone') || '전화번호'}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-9"
                value={ti.searchKeyword}
                onChange={(e) => ti.onSearchKeywordChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void ti.onSearch()
                  }
                }}
                placeholder={t('search') || '검색'}
              />
              <Button type="button" variant="outline" className="h-9" onClick={() => void ti.onSearch()} disabled={ti.searchLoading}>
                {t('search') || '검색'}
              </Button>
            </div>
            {ti.searchRows.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {ti.searchRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="w-full rounded border border-transparent px-2 py-1 text-left text-xs hover:border-border hover:bg-muted/40"
                    onClick={() => ti.onApplyProfile(taxInvoiceFromRecipientRow(row))}
                  >
                    <div className="font-medium">{row.name || '-'}</div>
                    <div className="text-muted-foreground">
                      {row.tax_id || '-'} · {row.phone || '-'}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {ti.searchMessage && <p className="text-xs text-muted-foreground">{ti.searchMessage}</p>}
            <PosTaxInvoiceRequiredLegend t={(key) => t(key)} />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <PosTaxInvoiceFieldLabel>{t('posTaxCustomerTypeLabel') || '구분'}</PosTaxInvoiceFieldLabel>
                <Select
                  value={ti.customerType}
                  onValueChange={(v) => ti.onCustomerTypeChange(v === 'company' ? 'company' : 'person')}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="person">{t('posTaxCustomerIndividual') || '개인'}</SelectItem>
                    <SelectItem value="company">{t('posTaxCustomerCorporate') || '법인'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <PosTaxInvoiceFieldLabel optional optionalText={t('posOptional')}>
                  {t('member_no') || '회원번호'}
                </PosTaxInvoiceFieldLabel>
                <Input className="h-9" value={ti.memberNo} onChange={(e) => ti.onMemberNoChange(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <PosTaxInvoiceFieldLabel required>{t('posName') || '이름'}</PosTaxInvoiceFieldLabel>
              <Input className="h-9" value={ti.name} onChange={(e) => ti.onNameChange(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <PosTaxInvoiceFieldLabel required>{t('posTaxIdLabel') || 'Tax ID'}</PosTaxInvoiceFieldLabel>
                <Input
                  className="h-9"
                  inputMode="numeric"
                  value={ti.taxId}
                  onChange={(e) => ti.onTaxIdChange(e.target.value.replace(/\D/g, '').slice(0, 13))}
                />
              </div>
              <div className="space-y-1">
                <PosTaxInvoiceFieldLabel required={ti.branchRequired}>{t('posBranchLabel') || '지점'}</PosTaxInvoiceFieldLabel>
                <Input
                  className="h-9"
                  inputMode="numeric"
                  value={ti.branchNo}
                  onChange={(e) => ti.onBranchNoChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <PosTaxInvoiceFieldLabel required>{t('posPhone') || '전화번호'}</PosTaxInvoiceFieldLabel>
                <Input
                  className="h-9"
                  inputMode="tel"
                  value={ti.phone}
                  onChange={(e) => ti.onPhoneChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
                />
              </div>
              <div className="space-y-1">
                <PosTaxInvoiceFieldLabel optional optionalText={t('posOptional')}>
                  {t('posTaxEmailLabel') || 'E-mail'}
                </PosTaxInvoiceFieldLabel>
                <Input className="h-9" value={ti.email} onChange={(e) => ti.onEmailChange(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <PosTaxInvoiceFieldLabel required>{t('settings_address') || '주소'}</PosTaxInvoiceFieldLabel>
              <Textarea value={ti.address} onChange={(e) => ti.onAddressChange(e.target.value)} rows={3} />
            </div>
            <PosTaxInvoiceValidationAlert errors={ti.formErrors} t={(key) => t(key)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={ti.onDismiss} disabled={ti.saving}>
              {t('btnClose') || '닫기'}
            </Button>
            <Button type="button" onClick={() => void ti.onSave()} disabled={ti.saving || ti.formErrors.length > 0}>
              {t('save') || '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PosKbankPaymentOutcomeDialog
        open={kbankOutcome.state != null}
        onOpenChange={kbankOutcome.onOpenChange}
        kind={kbankOutcome.state?.kind || 'success'}
        amount={Number(kbankOutcome.state?.amount || 0)}
        refId={String(kbankOutcome.state?.refId || '')}
        paymentMethod={kbankOutcome.state?.paymentMethod}
        cardLabel={kbankOutcome.state?.cardLabel}
        approvalCode={kbankOutcome.state?.approvalCode}
        timeLabel={kbankOutcome.state?.timeLabel}
        onViewAllOrders={kbankOutcome.onViewAllOrders}
        onCreateNewQr={kbankOutcome.onCreateNewQr}
      />
      {km.visible ? (
        <div
          className="pointer-events-auto fixed right-4 top-20 z-[70] flex max-h-[calc(100dvh-5.5rem)] w-[360px] flex-col overflow-y-auto overscroll-y-contain rounded-lg border bg-background/95 p-3 shadow-2xl backdrop-blur"
          data-tour={km.tourAttr}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {t('posPaymentQr') || 'QR 결제'} · {t('posStaffQrMonitor') || '직원 모니터'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {String(km.liveQrPayload || '').trim()
                  ? t('posScanToPayHint') || '고객이 스캔해서 결제할 수 있게 이 화면을 보여주세요.'
                  : t('posDemoBanner') || '데모 — 실제 주문·결제는 실데이터에 반영되지 않습니다.'}
              </p>
            </div>
            {(() => {
              if (isPosDemo && !String(km.liveQrPayload || '').trim()) {
                return (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                    DEMO
                  </div>
                )
              }
              if (km.callbackState === 'received') {
                return (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                    {t('posKbankStatusPaid') || 'PAID'}
                  </div>
                )
              }
              if (km.callbackState === 'failed') {
                return (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700">
                    {t('posKbankStatusCancelled') || 'CANCELLED'}
                  </div>
                )
              }
              return (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                  LIVE
                </div>
              )
            })()}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {`QR ${(t('amount') || '금액')}: ${km.effectiveQrAmount.toFixed(2)} ฿`}
          </p>
          <p
            className={`mt-1 text-xs font-semibold ${
              km.effectiveQrType === 'CREDIT_CARD'
                ? 'text-indigo-800 dark:text-indigo-300'
                : 'text-sky-800 dark:text-sky-300'
            }`}
          >
            {km.qrTypeLabel}
          </p>
          {km.sentQrTypeCode ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {(t('posKbankSentQrTypeCode') || 'Sent qrType')}: {km.sentQrTypeCode}
            </p>
          ) : null}
          {km.linkposQrBridgeStatus === 'ok' ? (
            <p className="mt-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              {t('posLinkposQrDisplayOk') || 'QR shown on EDC terminal'}
            </p>
          ) : km.linkposQrBridgeStatus === 'failed' ? (
            <p className="mt-1 text-[10px] font-medium text-amber-800 dark:text-amber-200">
              {t('posLinkposQrDisplayFailed') || 'EDC QR not shown — use cashier or customer display QR.'}
            </p>
          ) : null}
          {km.generateAuditText ? (
            <div className="mt-2 space-y-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 w-full text-[10px]"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(km.generateAuditText)
                    .then(() => appAlert(t('posKbankAuditCopied') || 'Copied KBank message for support.'))
                    .catch(() => appAlert(t('posTerminalDeviceIdCopyFail') || 'Copy failed'))
                }}
              >
                {t('posKbankCopyAuditMessage') || 'Copy request/response for KBank'}
              </Button>
            </div>
          ) : null}
          <div className="mt-3 shrink-0 rounded-md border bg-white p-2">
            <div className="flex justify-center overflow-hidden rounded-md border bg-white">
              {String(km.effectiveStaffQrPayload || '').trim().startsWith('000201') ? (
                <PosQrGuidelineCard
                  payload={String(km.effectiveStaffQrPayload || '').trim()}
                  kind={km.effectiveQrType}
                  className="border-0"
                />
              ) : String(km.opsTxnUid || '').trim() ? (
                <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
                  <span>
                    {km.callbackState === 'failed'
                      ? t('posKbankStatusCancelled') || 'CANCELLED'
                      : t('posPending') || 'Pending'}
                    {' · '}
                    {t('posKbankInquiry') || 'Inquiry'}
                  </span>
                </div>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
                  <QrCodeIcon className="h-10 w-10 text-emerald-600" aria-hidden />
                  <span>{t('posLoading') || '로딩 중'}</span>
                </div>
              )}
            </div>
          </div>
          {!isPosDemo && km.isPilotStore ? (
            <div className="mt-3 rounded-md border border-border/70 bg-card p-2">
              <p className="text-[11px] font-semibold text-muted-foreground">
                {t('posKbankFollowupTitle') || 'KBank 후속 처리 (현재 POS)'}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {`${t('posKbankPartnerTxnUidLabel') || 'partnerTxnUid'}: ${km.opsTxnUid || '-'}`}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {`Callback: ${
                  km.callbackState === 'received'
                    ? 'received'
                    : km.callbackState === 'failed'
                      ? 'failed'
                      : km.callbackState === 'waiting'
                        ? 'waiting'
                        : 'idle'
                }`}
              </p>
              {km.callbackState === 'waiting' && km.opsTxnUid ? (
                <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-100">
                  {t('posKbankCallbackWaitingHint') ||
                    'If the customer already paid, tap Inquiry to sync approval. Waiting for callback.'}
                </p>
              ) : null}
              {km.apiPausedUntilMs > Date.now() ? (
                <p className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[11px] font-medium text-rose-900 dark:text-rose-100">
                  {String(t('posKbankRateLimitAlert') || '')
                    .replace('{minutes}', String(Math.ceil(KBANK_RATE_LIMIT_BACKOFF_MS / 60_000)))
                    .replace('{label}', 'Inquiry') ||
                    'KBank API rate limit — wait a few minutes, then tap Inquiry once.'}
                </p>
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">{t('posKbankOrigTxnUidLabel') || 'origPartnerTxnUid'}</Label>
                  <Input
                    className="h-8 bg-muted/50 text-xs"
                    readOnly
                    value={km.opsTxnUid || km.opsOrigTxnUid}
                    placeholder={t('posKbankOrigTxnUidHint') || 'QR 요청 TxnUid'}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">{t('posKbankTxnNoLabel') || 'txnNo'}</Label>
                  <Input
                    className="h-8 text-xs"
                    value={km.opsTxnNo}
                    onChange={(e) => km.onOpsTxnNoChange(e.target.value)}
                    placeholder={t('posKbankTxnNoHint') || '결제 txnNo'}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-[11px]">{t('posKbankTerminalIdLabel') || 'terminalId (QR 카드 필수)'}</Label>
                  <Input
                    className="h-8 text-xs"
                    value={km.opsTerminalId}
                    onChange={(e) => km.onOpsTerminalIdChange(e.target.value)}
                    placeholder={t('posKbankTerminalIdHint') || '예: 09000107'}
                  />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={km.opsBusy || km.callbackState === 'received'}
                  onClick={() => void km.onFollowupAction('inquiry')}
                >
                  {t('posKbankInquiry') || 'Inquiry'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={km.opsBusy || km.callbackState === 'received'}
                  onClick={() => void km.onFollowupAction('settlement')}
                >
                  {t('posKbankSettlement') || 'Settlement'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={km.opsBusy || km.callbackState === 'received'}
                  onClick={() => void km.onFollowupAction('cancel')}
                >
                  {t('posKbankCancel') || 'Cancel'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={km.opsBusy || km.callbackState === 'received'}
                  title={
                    !String(km.opsTxnNo || '').trim()
                      ? t('posKbankVoidNeedsTxnNo') || 'Void runs Inquiry first when txnNo is empty.'
                      : undefined
                  }
                  onClick={() => void km.onFollowupAction('void')}
                >
                  {t('posKbankVoid') || 'Void'}
                </Button>
              </div>
              {km.opsLastResult ? (
                <Textarea readOnly value={km.opsLastResult} className="mt-2 h-20 resize-none text-[10px]" />
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2 h-8 w-full text-xs text-muted-foreground"
                disabled={km.opsBusy}
                onClick={km.onClearSession}
              >
                {t('posKbankCloseSession') || 'Close'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <LiveMenuSearchDialog
        open={liveMenuSearch.open}
        onOpenChange={liveMenuSearch.onOpenChange}
        storeCode={liveMenuSearch.storeCode}
        t={t}
        isDemo={isPosDemo}
        onServedUpdated={liveMenuSearch.onServedUpdated}
      />
      <PosPostPaymentCashChangeDialog
        amountBaht={postPaymentCashChange.amountBaht}
        onDismiss={postPaymentCashChange.onDismiss}
        t={t}
      />
      <PosReceiptModal
        onOpenChange={receipt.onOpenChange}
        onSuppressDismiss={receipt.onSuppressDismiss}
        onAutoPrintComplete={receipt.onAutoPrintComplete}
        receiptData={receipt.data}
        menus={receipt.menus}
        orderTypeLabels={receipt.orderTypeLabels}
        t={tPrint}
        autoPrintReceiptOnOrder={receipt.autoPrintReceiptOnOrder}
        autoPrintReceiptOnAddOrder={receipt.autoPrintReceiptOnAddOrder}
        autoPrintReceiptOnPayment={receipt.autoPrintReceiptOnPayment}
        autoPrintKitchenSlipOnOrder={receipt.autoPrintKitchenSlipOnOrder}
        receiptBizName={receipt.receiptBizName}
        receiptBizTaxId={receipt.receiptBizTaxId}
        receiptBizAbn={receipt.receiptBizAbn}
        receiptBizOwner={receipt.receiptBizOwner}
        receiptBizAddress={receipt.receiptBizAddress}
        receiptBizPhone={receipt.receiptBizPhone}
        receiptDesignStyle={receipt.receiptDesignStyle}
        receiptLogoSize={receipt.receiptLogoSize}
        receiptShowTitle={receipt.receiptShowTitle}
        receiptShowPaidStamp={receipt.receiptShowPaidStamp}
        receiptShowThankYou={receipt.receiptShowThankYou}
        receiptShowCustomerCopy={receipt.receiptShowCustomerCopy}
        receiptFooterPrimaryText={receipt.receiptFooterPrimaryText}
        receiptFooterSecondaryText={receipt.receiptFooterSecondaryText}
        receiptLogoImageUrl={receipt.receiptLogoImageUrl}
        receiptStampImageUrl={receipt.receiptStampImageUrl}
        receiptShowStamp={receipt.receiptShowStamp}
        receiptStampOnlyTaxInvoice={receipt.receiptStampOnlyTaxInvoice}
        receiptMembershipQrImageUrl={receipt.receiptMembershipQrImageUrl}
        receiptMembershipQrLinkUrl={receipt.receiptMembershipQrLinkUrl}
        receiptMembershipQrText={receipt.receiptMembershipQrText}
        receiptShowMembershipQr={receipt.receiptShowMembershipQr}
        signatureLine={receipt.signatureLine}
        receiptBarcode={receipt.receiptBarcode && receipt.data?.receiptAutoPrintContext !== 'payment'}
        itemBarcode={receipt.itemBarcode && receipt.data?.receiptAutoPrintContext !== 'payment'}
        printerSettingsRef={receipt.printerSettingsRef}
        kitchenPromoLineEnrich={receipt.kitchenPromoLineEnrich}
        onPaymentVoidClick={() => void receipt.onPaymentVoidClick()}
        paymentVoidEnabled={receipt.paymentVoidEnabled}
        paymentVoidBusy={receipt.paymentVoidBusy}
      />
      <DeliveryEditOrderNoDialog
        open={deliveryEditOrderNo.open}
        onOpenChange={deliveryEditOrderNo.onOpenChange}
        order={deliveryEditOrderNo.order}
        value={deliveryEditOrderNo.value}
        onValueChange={deliveryEditOrderNo.onValueChange}
        onSaved={deliveryEditOrderNo.onSaved}
        t={t}
        deliveryApps={deliveryEditOrderNo.deliveryApps}
      />
    </>
  )
}

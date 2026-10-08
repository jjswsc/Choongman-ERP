'use client'

import { Check, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEffect, useMemo, useState } from 'react'

type KbankOutcomeKind = 'success' | 'cancelled' | 'voided'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: KbankOutcomeKind
  amount: number
  refId: string
  paymentMethod?: string
  cardLabel?: string
  approvalCode?: string
  timeLabel?: string
  /** โต๊ะ / 포장·배달 라벨 — success sticky에 크게 표시 */
  tableLabel?: string
  orderLabel?: string
  /** i18n: t(key) — 없으면 태국어 기본 문구 */
  t?: (key: string) => string
  onViewAllOrders?: () => void
  onCreateNewQr?: () => void
}

function formatBaht(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0
  return `฿ ${n.toFixed(2)}`
}

export function PosKbankPaymentOutcomeDialog({
  open,
  onOpenChange,
  kind,
  amount,
  refId,
  paymentMethod,
  cardLabel,
  approvalCode,
  timeLabel,
  tableLabel,
  orderLabel,
  t,
  onViewAllOrders,
  onCreateNewQr,
}: Props) {
  const isSuccess = kind === 'success'
  const isVoided = kind === 'voided'
  const isCancelled = kind === 'cancelled'
  const [detailMode, setDetailMode] = useState(false)

  const tr = (key: string, fallback: string) => {
    if (!t) return fallback
    const v = t(key)
    return !v || v === key ? fallback : v
  }

  useEffect(() => {
    if (open) setDetailMode(false)
  }, [open])

  const statusLabel = useMemo(() => {
    if (isSuccess) return tr('posKbankPaidStatusSuccess', 'สำเร็จ')
    if (isVoided) return tr('posKbankPaidStatusVoided', 'Void สำเร็จ')
    return tr('posKbankPaidStatusCancelled', 'ยกเลิกแล้ว')
  }, [isSuccess, isVoided, t])

  const headline = useMemo(() => {
    if (isSuccess) return tr('posKbankPaidConfirmTitle', 'ชำระสำเร็จ')
    if (isVoided) return tr('posKbankPaidStatusVoided', 'Void สำเร็จ')
    return tr('posKbankPaidStatusCancelledOk', 'ยกเลิกสำเร็จ')
  }, [isSuccess, isVoided, t])

  const displayPlaceLabel = String(tableLabel || orderLabel || '').trim()
  const methodLabel =
    paymentMethod || (isSuccess ? tr('posKbankPaidMethodQr', 'ชำระด้วย QR') : '-')
  const toneClass = isSuccess ? 'emerald' : isVoided ? 'violet' : 'amber'

  const successDismissGuard = isSuccess
    ? {
        hideCloseButton: true as const,
        onPointerDownOutside: (e: Event) => e.preventDefault(),
        onInteractOutside: (e: Event) => e.preventDefault(),
        onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault(),
      }
    : {}

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSuccess && !next) return
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="max-w-[380px] border-0 bg-transparent p-0 shadow-none"
        {...successDismissGuard}
      >
        {detailMode ? (
          <div className="rounded-2xl border border-[#e8e4d7] bg-[#fffef9] p-4 shadow-2xl">
            <div
              className={cn(
                'rounded-xl px-3 py-4',
                isSuccess && 'bg-[#eef9eb]',
                isVoided && 'bg-[#f3f0ff]',
                isCancelled && 'bg-[#fcf6e8]'
              )}
            >
              <div className="flex items-center justify-center gap-2">
                {isSuccess ? (
                  <Check className="h-5 w-5 text-[#1f6b2e]" aria-hidden />
                ) : (
                  <X
                    className={cn(
                      'h-5 w-5',
                      isVoided ? 'text-[#5b3ea6]' : 'text-[#7a5a17]'
                    )}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    'text-lg font-semibold',
                    isSuccess && 'text-[#1f6b2e]',
                    isVoided && 'text-[#5b3ea6]',
                    isCancelled && 'text-[#6d4f14]'
                  )}
                >
                  {headline}
                </span>
              </div>
              {displayPlaceLabel ? (
                <p
                  className={cn(
                    'mt-2 text-center text-xl font-bold',
                    isSuccess && 'text-[#1f6b2e]',
                    isVoided && 'text-[#5b3ea6]',
                    isCancelled && 'text-[#6d4f14]'
                  )}
                >
                  {displayPlaceLabel}
                </p>
              ) : null}
              <p
                className={cn(
                  'mt-1 text-center text-[44px] font-bold leading-none',
                  isSuccess && 'text-[#1f6b2e]',
                  isVoided && 'text-[#5b3ea6]',
                  isCancelled && 'text-[#6d4f14]'
                )}
              >
                {formatBaht(amount)}
              </p>
            </div>

            <div className="mt-3 space-y-2 border-b border-[#e8e4d7] pb-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{tr('posKbankPaidFieldStatus', 'สถานะ')}</span>
                <span className="font-semibold">{statusLabel}</span>
              </div>
              {displayPlaceLabel ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{tr('posTable', 'โต๊ะ')}</span>
                  <span className="font-semibold">{displayPlaceLabel}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{tr('posKbankPaidFieldMethod', 'วิธีชำระ')}</span>
                <span className="font-semibold">{methodLabel}</span>
              </div>
              {cardLabel ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{tr('posKbankPaidFieldCard', 'บัตร')}</span>
                  <span className="font-semibold">{cardLabel}</span>
                </div>
              ) : null}
              {approvalCode ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {tr('posKbankPaidFieldApproval', 'รหัสอนุมัติ')}
                  </span>
                  <span className="font-semibold">{approvalCode}</span>
                </div>
              ) : null}
              {timeLabel ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{tr('posKbankPaidFieldTime', 'เวลา')}</span>
                  <span className="font-semibold">{timeLabel}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Ref</span>
                <span className="max-w-[180px] truncate font-semibold">{refId || '-'}</span>
              </div>
            </div>

            {isSuccess ? (
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1 rounded-lg border-[#cfc9bb] bg-white text-[15px] font-medium hover:bg-[#f8f6ef]"
                  onClick={() => setDetailMode(false)}
                >
                  {tr('posKbankPaidBack', 'กลับ')}
                </Button>
                <Button
                  type="button"
                  className="h-11 flex-1 rounded-lg bg-[#1f6b2e] text-[15px] font-semibold hover:bg-[#1a5a27]"
                  onClick={() => onOpenChange(false)}
                >
                  {tr('posKbankPaidConfirmReceived', 'รับเงินแล้ว')}
                </Button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-lg border-[#cfc9bb] bg-white text-[15px] font-medium hover:bg-[#f8f6ef]"
                  onClick={() => {
                    if (onViewAllOrders) onViewAllOrders()
                    onOpenChange(false)
                  }}
                >
                  {tr('posKbankPaidViewAllOrders', 'ดูรายการทั้งหมด')}
                </Button>
                <Button
                  type="button"
                  className="h-11 rounded-lg bg-[#111827] text-[15px] font-semibold hover:bg-[#0b1220]"
                  onClick={() => {
                    if (onCreateNewQr) onCreateNewQr()
                    onOpenChange(false)
                  }}
                >
                  {tr('posKbankPaidCreateNewQr', 'สร้าง QR ใหม่')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-5 shadow-2xl">
            <div
              className={cn(
                'mx-auto flex h-14 w-14 items-center justify-center rounded-full',
                toneClass === 'emerald' && 'bg-emerald-50 text-emerald-700',
                toneClass === 'violet' && 'bg-violet-50 text-violet-700',
                toneClass === 'amber' && 'bg-amber-50 text-amber-700'
              )}
            >
              {isSuccess ? <Check className="h-8 w-8" aria-hidden /> : <X className="h-8 w-8" aria-hidden />}
            </div>

            <p
              className={cn(
                'mt-3 text-center text-2xl font-semibold tracking-tight',
                toneClass === 'emerald' && 'text-emerald-800',
                toneClass === 'violet' && 'text-violet-800',
                toneClass === 'amber' && 'text-amber-800'
              )}
            >
              {headline}
            </p>
            {displayPlaceLabel ? (
              <p
                className={cn(
                  'mt-2 text-center text-xl font-bold tracking-tight',
                  toneClass === 'emerald' && 'text-emerald-800',
                  toneClass === 'violet' && 'text-violet-800',
                  toneClass === 'amber' && 'text-amber-800'
                )}
              >
                {displayPlaceLabel}
              </p>
            ) : null}
            <p
              className={cn(
                'mt-1 text-center text-4xl font-bold leading-none',
                toneClass === 'emerald' && 'text-emerald-700',
                toneClass === 'violet' && 'text-violet-700',
                toneClass === 'amber' && 'text-amber-700'
              )}
            >
              {formatBaht(amount)}
            </p>
            {isSuccess ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {tr(
                  'posKbankPaidConfirmHint',
                  'พนักงานกดยืนยันรับเงินก่อนปิดหน้าต่างนี้ครับ'
                )}
              </p>
            ) : null}

            <div className="mt-4 space-y-1.5 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{tr('posKbankPaidFieldStatus', 'สถานะ')}</span>
                <span className="font-semibold">{statusLabel}</span>
              </div>
              {approvalCode ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {tr('posKbankPaidFieldApproval', 'รหัสอนุมัติ')}
                  </span>
                  <span className="font-semibold">{approvalCode}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Ref</span>
                <span className="max-w-[180px] truncate font-semibold">{refId || '-'}</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              {isSuccess ? (
                <>
                  <Button
                    type="button"
                    className="h-12 flex-1 rounded-lg bg-[#1f6b2e] text-[15px] font-semibold hover:bg-[#1a5a27]"
                    onClick={() => onOpenChange(false)}
                  >
                    {tr('posKbankPaidConfirmReceived', 'รับเงินแล้ว')}
                  </Button>
                  <Button
                    type="button"
                    className="h-12 flex-1 rounded-lg border-[#cfc9bb] bg-white text-[15px] font-medium hover:bg-[#f8f6ef]"
                    variant="outline"
                    onClick={() => setDetailMode(true)}
                  >
                    {tr('posKbankPaidViewDetails', 'ดูรายละเอียด')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    className="h-11 flex-1 rounded-lg border-[#cfc9bb] bg-white text-[15px] font-medium hover:bg-[#f8f6ef]"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    {tr('posKbankPaidAck', 'รับทราบ')}
                  </Button>
                  <Button
                    type="button"
                    className="h-11 flex-1 rounded-lg bg-[#111827] text-[15px] font-semibold hover:bg-[#0b1220]"
                    onClick={() => setDetailMode(true)}
                  >
                    {tr('posKbankPaidViewDetails', 'ดูรายละเอียด')}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

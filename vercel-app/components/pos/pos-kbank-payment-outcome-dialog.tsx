'use client'

import { Check, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEffect, useMemo, useState } from 'react'

type KbankOutcomeKind = 'success' | 'cancelled'

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
  onViewAllOrders,
  onCreateNewQr,
}: Props) {
  const isSuccess = kind === 'success'
  const [detailMode, setDetailMode] = useState(false)

  useEffect(() => {
    if (open) setDetailMode(false)
  }, [open])

  const statusLabel = useMemo(() => (isSuccess ? 'สำเร็จ' : 'ยกเลิกแล้ว'), [isSuccess])

  const methodLabel = paymentMethod || (isSuccess ? 'ชำระด้วย QR' : '-')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] border-0 bg-transparent p-0 shadow-none">
        {detailMode ? (
          <div className="rounded-2xl border border-[#e8e4d7] bg-[#fffef9] p-4 shadow-2xl">
            <div
              className={cn(
                'rounded-xl px-3 py-4',
                isSuccess ? 'bg-[#eef9eb]' : 'bg-[#fcf6e8]'
              )}
            >
              <div className="flex items-center justify-center gap-2">
                {isSuccess ? (
                  <Check className="h-5 w-5 text-[#1f6b2e]" aria-hidden />
                ) : (
                  <X className="h-5 w-5 text-[#7a5a17]" aria-hidden />
                )}
                <span
                  className={cn(
                    'text-lg font-semibold',
                    isSuccess ? 'text-[#1f6b2e]' : 'text-[#6d4f14]'
                  )}
                >
                  {isSuccess ? 'ชำระสำเร็จ' : 'ยกเลิกสำเร็จ'}
                </span>
              </div>
              <p
                className={cn(
                  'mt-1 text-center text-[44px] font-bold leading-none',
                  isSuccess ? 'text-[#1f6b2e]' : 'text-[#6d4f14]'
                )}
              >
                {formatBaht(amount)}
              </p>
            </div>

            <div className="mt-3 space-y-2 border-b border-[#e8e4d7] pb-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">สถานะ</span>
                <span className="font-semibold">{statusLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">วิธีชำระ</span>
                <span className="font-semibold">{methodLabel}</span>
              </div>
              {cardLabel ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">บัตร</span>
                  <span className="font-semibold">{cardLabel}</span>
                </div>
              ) : null}
              {approvalCode ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">รหัสอนุมัติ</span>
                  <span className="font-semibold">{approvalCode}</span>
                </div>
              ) : null}
              {timeLabel ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">เวลา</span>
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
                  กลับ
                </Button>
                <Button
                  type="button"
                  className="h-11 flex-1 rounded-lg bg-[#1f6b2e] text-[15px] font-semibold hover:bg-[#1a5a27]"
                  onClick={() => onOpenChange(false)}
                >
                  เรียบร้อย
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
                  ดูรายการทั้งหมด
                </Button>
                <Button
                  type="button"
                  className="h-11 rounded-lg bg-[#111827] text-[15px] font-semibold hover:bg-[#0b1220]"
                  onClick={() => {
                    if (onCreateNewQr) onCreateNewQr()
                    onOpenChange(false)
                  }}
                >
                  สร้าง QR ใหม่
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-5 shadow-2xl">
            <div
              className={cn(
                'mx-auto flex h-14 w-14 items-center justify-center rounded-full',
                isSuccess ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              )}
            >
              {isSuccess ? <Check className="h-8 w-8" aria-hidden /> : <X className="h-8 w-8" aria-hidden />}
            </div>

            <p
              className={cn(
                'mt-3 text-center text-2xl font-semibold tracking-tight',
                isSuccess ? 'text-emerald-800' : 'text-amber-800'
              )}
            >
              {isSuccess ? 'ชำระสำเร็จ' : 'ยกเลิกสำเร็จ'}
            </p>
            <p
              className={cn(
                'mt-1 text-center text-4xl font-bold leading-none',
                isSuccess ? 'text-emerald-700' : 'text-amber-700'
              )}
            >
              {formatBaht(amount)}
            </p>

            <div className="mt-4 space-y-1.5 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">สถานะ</span>
                <span className="font-semibold">{statusLabel}</span>
              </div>
            {approvalCode ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">รหัสอนุมัติ</span>
                  <span className="font-semibold">{approvalCode}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Ref</span>
                <span className="max-w-[180px] truncate font-semibold">{refId || '-'}</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                className="h-11 flex-1 rounded-lg border-[#cfc9bb] bg-white text-[15px] font-medium hover:bg-[#f8f6ef]"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                รับทราบ
              </Button>
              <Button
                type="button"
                className="h-11 flex-1 rounded-lg bg-[#111827] text-[15px] font-semibold hover:bg-[#0b1220]"
                onClick={() => setDetailMode(true)}
              >
                ดูรายละเอียด
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

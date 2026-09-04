'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

export type PosManualEdcConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardAmountBaht: number
  loading?: boolean
  onConfirm: (payload: { approvalCode: string; traceNo: string }) => void | Promise<void>
}

/** EDC에서 이미 승인된 카드 결제를 POS만 마감할 때 승인번호 입력 */
export function PosManualEdcConfirmDialog({
  open,
  onOpenChange,
  cardAmountBaht,
  loading = false,
  onConfirm,
}: PosManualEdcConfirmDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const [approvalCode, setApprovalCode] = React.useState('')
  const [traceNo, setTraceNo] = React.useState('')

  React.useEffect(() => {
    if (!open) {
      setApprovalCode('')
      setTraceNo('')
    }
  }, [open])

  const codeOk = approvalCode.trim().length >= 4

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!codeOk || loading) return
    void onConfirm({
      approvalCode: approvalCode.trim().toUpperCase(),
      traceNo: traceNo.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{tr('posManualEdcTitle', 'EDC에서 결제 완료')}</DialogTitle>
            <DialogDescription className="text-left whitespace-pre-line">
              {tr(
                'posManualEdcBody',
                '이미 EDC 기기에서 승인한 경우에만 사용하세요.\nPOS에서 다시 「결제 완료」를 누르면 카드가 두 번 승인될 수 있습니다.\n전표의 승인번호를 입력한 뒤 마감합니다.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold tabular-nums text-amber-950 dark:text-amber-100">
              {tr('posManualEdcAmount', '카드 금액')}: {cardAmountBaht.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="pos-manual-edc-approval">
                {tr('posManualEdcApprovalCode', '승인번호 (Approval Code)')}
              </Label>
              <Input
                id="pos-manual-edc-approval"
                autoComplete="off"
                autoFocus
                value={approvalCode}
                onChange={(e) => setApprovalCode(e.target.value.replace(/\s/g, '').slice(0, 20))}
                placeholder="123456"
                className="font-mono tracking-wider uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-manual-edc-trace">
                {tr('posManualEdcTraceNo', 'Trace No (선택)')}
              </Label>
              <Input
                id="pos-manual-edc-trace"
                autoComplete="off"
                value={traceNo}
                onChange={(e) => setTraceNo(e.target.value.replace(/\s/g, '').slice(0, 20))}
                placeholder="000001"
                className="font-mono tracking-wider"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              {t('posCancel') || t('cancel') || '취소'}
            </Button>
            <Button type="submit" disabled={loading || !codeOk}>
              {loading
                ? t('posPaymentProcessing') || '처리 중…'
                : tr('posManualEdcConfirm', '승인번호로 마감')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

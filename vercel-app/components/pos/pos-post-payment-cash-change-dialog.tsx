'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatBahtNum } from '@/lib/utils'

type PosPostPaymentCashChangeDialogProps = {
  amountBaht: number | null
  onDismiss: () => void
  t: (key: string) => string
}

/** 결제 후 현금 거스름 — 확인 버튼으로만 닫음(바깥 클릭·ESC 무시) */
export function PosPostPaymentCashChangeDialog({
  amountBaht,
  onDismiss,
  t,
}: PosPostPaymentCashChangeDialogProps) {
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }

  return (
    <Dialog open={amountBaht != null}>
      <DialogContent
        hideCloseButton
        className="max-w-sm gap-5 sm:max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{tr('posCashChangePostPaymentTitle', '거스름돈')}</DialogTitle>
          <DialogDescription>
            {tr('posCashChangePostPaymentBody', '결제가 완료되었습니다. 아래 금액을 거슬러 주세요.')}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-emerald-300/60 bg-emerald-50 px-4 py-5 text-center dark:border-emerald-500/40 dark:bg-emerald-950/35">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            {tr('posCashChangeAmount', '거슬러줄 금액')}
          </p>
          <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300">
            {amountBaht != null ? `${formatBahtNum(amountBaht)} ฿` : ''}
          </p>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button type="button" className="h-12 w-full rounded-xl font-bold sm:max-w-xs" onClick={onDismiss}>
            {t('posConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

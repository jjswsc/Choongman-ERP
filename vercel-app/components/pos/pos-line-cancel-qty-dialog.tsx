'use client'

import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import type { OrderItem } from '@/lib/pos-types'
import {
  orderItemHasPromoOrSet,
  orderItemLineQty,
  wouldLeaveNoItemsAfterLineCancel,
} from '@/lib/pos-order-line-cancel'

export type PosLineCancelQtyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: OrderItem | null
  displayName: string
  allItems: OrderItem[]
  submitting?: boolean
  onConfirm: (cancelQty: number) => void
}

export function PosLineCancelQtyDialog({
  open,
  onOpenChange,
  item,
  displayName,
  allItems,
  submitting = false,
  onConfirm,
}: PosLineCancelQtyDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const lineQty = item ? orderItemLineQty(item) : 1
  const [cancelQty, setCancelQty] = useState(1)

  useEffect(() => {
    if (open) setCancelQty(1)
  }, [open, item?.id])

  const remainQty = Math.max(0, lineQty - cancelQty)
  const blockClearAll = useMemo(() => {
    if (!item) return true
    return wouldLeaveNoItemsAfterLineCancel(allItems, item.id, cancelQty)
  }, [allItems, item, cancelQty])

  const showSetNote = item ? orderItemHasPromoOrSet(item) : false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>{t('posLineCancelQtyTitle') || 'Confirm'}</DialogTitle>
        </DialogHeader>
        {item ? (
          <div className="space-y-4">
            <div>
              <p className="text-base font-semibold leading-snug break-words">{displayName}</p>
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                ×{lineQty} · {Number(item.price ?? 0).toLocaleString()} ฿
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  disabled={submitting || cancelQty <= 1}
                  onClick={() => setCancelQty((q) => Math.max(1, q - 1))}
                  aria-label="-"
                >
                  <Minus className="h-5 w-5" />
                </Button>
                <span className="min-w-[3rem] text-center text-2xl font-bold tabular-nums">{cancelQty}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  disabled={submitting || cancelQty >= lineQty}
                  onClick={() => setCancelQty((q) => Math.min(lineQty, q + 1))}
                  aria-label="+"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{t('posLineCancelQtyLabel') || 'Quantity to cancel'}</p>
            </div>
            <p className="text-center text-sm tabular-nums">
              {i18nTr(t, 'posLineCancelQtyRemainHint', {
                remain: String(remainQty),
                cancel: String(cancelQty),
                total: String(lineQty),
              })}
            </p>
            {showSetNote ? (
              <p className="text-xs text-amber-800 dark:text-amber-200/90 rounded-md bg-amber-50 dark:bg-amber-950/40 px-2 py-1.5">
                {t('posLineCancelQtySetNote')}
              </p>
            ) : null}
            {blockClearAll ? (
              <p className="text-xs text-center text-destructive">
                {t('posLineItemCancelLastHint')}
              </p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {t('posCancel') || t('cancel') || 'Cancel'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11 flex-1"
            disabled={submitting || !item || blockClearAll}
            onClick={() => {
              if (!item) return
              onConfirm(cancelQty)
            }}
          >
            {t('posConfirm') || 'OK'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

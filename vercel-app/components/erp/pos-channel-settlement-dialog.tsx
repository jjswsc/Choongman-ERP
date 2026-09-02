'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PosChannelSettlementPanel } from '@/components/erp/pos-channel-settlement-panel'
import type { PosChannelSettlementChannel } from '@/lib/pos-channel-settlement'

export type PosChannelSettlementDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  t: (key: string) => string
  storeCode: string
  settleDate: string
  initialNet?: number
  bankTransactionId?: number
  initialChannel?: PosChannelSettlementChannel
  onPosted?: () => void
}

export function PosChannelSettlementDialog({
  open,
  onOpenChange,
  t,
  storeCode,
  settleDate,
  initialNet,
  bankTransactionId,
  initialChannel,
  onPosted,
}: PosChannelSettlementDialogProps) {
  const handlePosted = React.useCallback(() => {
    onPosted?.()
    onOpenChange(false)
  }, [onOpenChange, onPosted])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('bankPosChannelSettleDialogTitle') || '채널 정산 (수수료 분개)'}</DialogTitle>
          <DialogDescription className="text-xs leading-snug">
            {t('bankPosChannelSettleDialogDesc') ||
              'NET=이 입금액, FEE=GROSS−NET. 일 마감·CSV 일괄은 POS 결산에서도 가능합니다.'}{' '}
            <Link href="/admin/pos-settlement" className="text-primary underline underline-offset-2">
              {t('bankPosChannelSettlePosLink') || 'POS 결산 →'}
            </Link>
          </DialogDescription>
        </DialogHeader>
        {open && storeCode ? (
          <PosChannelSettlementPanel
            t={t}
            storeCode={storeCode}
            settleDate={settleDate}
            initialNet={initialNet}
            initialChannel={initialChannel}
            bankTransactionId={bankTransactionId}
            hideCsv
            onPosted={handlePosted}
            className="border-0 bg-transparent p-0"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

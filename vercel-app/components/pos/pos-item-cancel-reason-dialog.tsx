'use client'

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => void | Promise<void>
  submitting?: boolean
  t?: (key: string) => string
}

const REASON_OPTIONS = [
  { key: 'wrong_item', labelKo: '오조리(잘못 조리)' },
  { key: 'wrong_serving', labelKo: '오서빙(잘못 전달)' },
  { key: 'customer_change', labelKo: '고객 요청 변경' },
  { key: 'quality_issue', labelKo: '품질 문제' },
  { key: 'other', labelKo: '기타' },
]

export function PosItemCancelReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting = false,
  t = (k) => k,
}: Props) {
  const [selected, setSelected] = useState('wrong_item')
  const [customReason, setCustomReason] = useState('')

  const resolvedReason = useMemo(() => {
    if (selected === 'other') return customReason.trim()
    const picked = REASON_OPTIONS.find((r) => r.key === selected)
    return picked?.labelKo ?? ''
  }, [selected, customReason])

  const canSubmit = resolvedReason.length >= 2

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (submitting) return
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('posCancelReasonPrompt') || '취소 사유를 선택해 주세요'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {REASON_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                selected === opt.key
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:bg-muted/40'
              )}
              onClick={() => setSelected(opt.key)}
              disabled={submitting}
            >
              {opt.labelKo}
            </button>
          ))}
        </div>
        {selected === 'other' && (
          <Textarea
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder={t('posCancelReasonInputPlaceholder') || '취소 사유를 입력하세요'}
            className="min-h-[84px]"
            disabled={submitting}
          />
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('posCancel') || '취소'}
          </Button>
          <Button
            type="button"
            onClick={() => void onConfirm(resolvedReason)}
            disabled={submitting || !canSubmit}
          >
            {submitting ? '...' : (t('confirm') || '확인')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

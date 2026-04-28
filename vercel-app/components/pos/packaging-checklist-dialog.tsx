'use client'

import * as React from 'react'
import { appConfirm } from '@/lib/app-message'
import type { PosOrderPackagingChecklistGroup } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

type ChecklistItem = PosOrderPackagingChecklistGroup['checks'][number]

export function PackagingChecklistDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: PosOrderPackagingChecklistGroup[]
  submitting?: boolean
  t?: (key: string) => string
  onConfirm: (payload: {
    checkedItemIds: string[]
    uncheckedRequiredCount: number
    totalRequiredCount: number
  }) => Promise<void> | void
}) {
  const {
    open,
    onOpenChange,
    groups,
    submitting = false,
    t = (k) => k,
    onConfirm,
  } = props

  const [checkedMap, setCheckedMap] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    if (!open) return
    const next: Record<string, boolean> = {}
    for (const group of groups) {
      for (const item of group.checks) next[item.id] = false
    }
    setCheckedMap(next)
  }, [open, groups])

  const allItems = React.useMemo<ChecklistItem[]>(() => {
    const out: ChecklistItem[] = []
    for (const group of groups) out.push(...group.checks)
    return out
  }, [groups])

  const totalRequiredCount = React.useMemo(
    () => allItems.filter((it) => it.isRequired).length,
    [allItems]
  )
  const uncheckedRequiredCount = React.useMemo(
    () => allItems.filter((it) => it.isRequired && !checkedMap[it.id]).length,
    [allItems, checkedMap]
  )

  const handleConfirm = async () => {
    if (uncheckedRequiredCount > 0) {
      const go = await appConfirm(
        (
          t('posPackagingChecklistUncheckedWarn') ||
          '필수 체크 항목이 {{n}}개 남아 있습니다. 그래도 포장 완료를 진행할까요?'
        ).replace('{{n}}', String(uncheckedRequiredCount))
      )
      if (!go) return
    }
    const checkedItemIds = Object.entries(checkedMap)
      .filter(([, v]) => v)
      .map(([id]) => id)
    await onConfirm({
      checkedItemIds,
      uncheckedRequiredCount,
      totalRequiredCount,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('posPackagingChecklistTitle') || '포장 체크리스트'}</DialogTitle>
          <DialogDescription>
            {t('posPackagingChecklistDesc') || '포장 전에 누락하기 쉬운 항목을 확인해 주세요.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] rounded-md border">
          <div className="space-y-3 p-3">
            {groups.map((group) => (
              <section key={group.orderItemId} className="rounded-lg border bg-muted/20 p-3">
                <h4 className="text-sm font-semibold">
                  {group.itemName}
                  {group.optionName ? (
                    <span className="ml-1 text-xs text-muted-foreground">({group.optionName})</span>
                  ) : null}
                </h4>
                <div className="mt-2 space-y-2">
                  {group.checks.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-2"
                    >
                      <Checkbox
                        checked={Boolean(checkedMap[item.id])}
                        onCheckedChange={(v) => {
                          const next = v === true
                          setCheckedMap((prev) => ({ ...prev, [item.id]: next }))
                        }}
                      />
                      <span className="text-sm">{item.itemName}</span>
                      {item.isRequired ? (
                        <span className="ml-auto text-[11px] font-medium text-amber-700">
                          {t('posRequired') || '필수'}
                        </span>
                      ) : (
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {t('posOptional') || '선택'}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel') || '취소'}
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={submitting}>
            {t('posDeliveryPackagingComplete') || '포장 완료'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

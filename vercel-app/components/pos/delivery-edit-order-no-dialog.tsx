'use client'
import { appAlert } from "@/lib/app-message"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updatePosOrder, type PosDeliveryApp } from '@/lib/api-client'
import { useLang } from '@/lib/lang-context'
import { localizeApiMessage } from '@/lib/translate-api-message'
import type { Order } from '@/lib/pos-types'

function detectDeliveryApp(text: string, apps: PosDeliveryApp[]): PosDeliveryApp | null {
  const raw = text.toLowerCase()
  for (const app of apps) {
    const keywords = app.matchKeywords || []
    if (keywords.some((k) => raw.includes(String(k).toLowerCase()))) return app
  }
  if (apps.length === 0) {
    if (raw.includes('grab') || raw.includes('그랩')) return { id: 0, code: 'grab', name: 'Grab', matchKeywords: ['grab'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'lime', storeCode: null }
    if (raw.includes('lineman') || raw.includes('line man') || raw.includes('라인맨')) return { id: 0, code: 'lineman', name: 'Line Man', matchKeywords: ['lineman'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'sky', storeCode: null }
    if (raw.includes('shopee') || raw.includes('쇼피')) return { id: 0, code: 'shopee', name: 'Shopee', matchKeywords: ['shopee'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'amber', storeCode: null }
  }
  return null
}

export function DeliveryEditOrderNoDialog({
  open,
  onOpenChange,
  order,
  value,
  onValueChange,
  onSaved,
  t,
  deliveryApps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: Order | null | undefined
  value: string
  onValueChange: (v: string) => void
  onSaved: (newTableName: string) => void | Promise<void>
  t: (key: string) => string
  deliveryApps: PosDeliveryApp[]
}) {
  const { lang } = useLang()
  if (!order) return null
  const label = String(order.customerName || '').trim() || ''
  const app = detectDeliveryApp(label, deliveryApps)
  const appLabelEn = app ? app.name : (t('posOrderTypeDelivery') || '배달')

  return (
    <Dialog open={open} modal={false} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" forceOverlay>
        <DialogHeader>
          <DialogTitle>{t('posEditOrderNoDialogTitle') || '주문번호 수정'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground shrink-0">{appLabelEn}</span>
            <span className="text-muted-foreground">#</span>
            <Input
              type="text"
              placeholder={t('posDeliveryOrderNoPh') || '주문번호'}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              className="flex-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel') || '취소'}
            </Button>
            <Button
              onClick={async () => {
                const newTableName = [appLabelEn, value.trim() ? '#' + value.trim() : ''].filter(Boolean).join(' ')
                try {
                  const res = await updatePosOrder({
                    id: Number(order.id),
                    items: order.items.map((i) => ({
                      id: i.id,
                      name: i.name,
                      price: i.price,
                      qty: i.quantity || 1,
                      ...(i.note?.trim() ? { note: i.note.trim() } : {}),
                    })),
                    tableName: newTableName || appLabelEn,
                    memo: order.memo,
                  })
                  if (!(res as { success?: boolean }).success) {
                    await appAlert(
                      localizeApiMessage(
                        (res as { message?: string }).message,
                        t,
                        t('posOrderSaveFailed') || '저장에 실패했습니다.',
                        lang
                      )
                    )
                    return
                  }
                  onOpenChange(false)
                  await onSaved(newTableName || appLabelEn)
                } catch (e) {
                  await appAlert(String(e))
                }
              }}
            >
              {t('posSave') || '저장'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

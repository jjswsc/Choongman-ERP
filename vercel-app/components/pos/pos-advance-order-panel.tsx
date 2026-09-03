'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getPosDepositHistory, type PosDepositHistoryRow } from '@/lib/api-client'

const KIND_KEY: Record<string, string> = {
  receive: 'posDepositKindReceive',
  apply: 'posDepositKindApply',
  refund: 'posDepositKindRefund',
  forfeit: 'posDepositKindForfeit',
}

export function PosAdvanceOrderPanel(props: {
  t: (k: string) => string
  lang?: string
  storeCode?: string
  busy?: boolean
  onReceive: () => void
  onRefund?: (holder: { memberId?: number; phone: string }) => void | Promise<void>
}) {
  const { t, storeCode, busy, onReceive, onRefund } = props
  const [phoneQuery, setPhoneQuery] = useState('')
  const [historyRows, setHistoryRows] = useState<PosDepositHistoryRow[]>([])
  const [held, setHeld] = useState(0)
  const [historyBusy, setHistoryBusy] = useState(false)

  return (
    <Card className="border-amber-200/80 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20">
      <CardHeader className="flex flex-row items-center justify-between gap-2 py-3 px-3 space-y-0">
        <CardTitle className="text-sm font-semibold">{t('posDepositQueueTitle') || 'จอง / มัดจำ'}</CardTitle>
        <Button type="button" size="sm" className="h-8" disabled={busy} onClick={() => onReceive()}>
          {t('posDepositButton') || 'มัดจำ'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <p className="text-xs text-muted-foreground">
          {t('posDepositUseLaterHint') ||
            '메뉴 없이 예약금만 걸어 둡니다. 방문 때 회원 선택 또는 같은 전화로 결제하면 차감됩니다.'}
        </p>
        <div className="flex gap-2">
          <Input
            value={phoneQuery}
            onChange={(e) => setPhoneQuery(e.target.value)}
            placeholder={t('posDepositHistoryPhonePh') || '전화로 이력 조회'}
            className="h-9"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={historyBusy || phoneQuery.replace(/\D/g, '').length < 8}
            onClick={() => {
              setHistoryBusy(true)
              void getPosDepositHistory({ storeCode, phone: phoneQuery, limit: 50 })
                .then((res) => {
                  setHistoryRows(res.rows)
                  setHeld(res.heldBalance)
                })
                .finally(() => setHistoryBusy(false))
            }}
          >
            {t('posDepositHistorySearch') || '조회'}
          </Button>
        </div>
        {historyRows.length > 0 && (
          <div className="rounded-md border bg-background p-2 text-xs space-y-1 max-h-36 overflow-auto">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">
                {(t('posDepositHeld') || '보유')} {held.toLocaleString()} ฿
              </p>
              {held > 0.005 && onRefund && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={busy}
                  onClick={() => {
                    const memberId = historyRows.find((r) => Number(r.memberId) > 0)?.memberId
                    void onRefund({ memberId, phone: phoneQuery })
                  }}
                >
                  {t('posDepositRefund') || '환불'}
                </Button>
              )}
            </div>
            {historyRows.slice(0, 10).map((row) => (
              <div key={row.id} className="flex justify-between gap-2 text-muted-foreground">
                <span>
                  {(KIND_KEY[row.kind] ? t(KIND_KEY[row.kind] as string) : row.kind) || row.kind}
                  {row.guestName ? ` · ${row.guestName}` : ''}
                </span>
                <span className="tabular-nums">{Number(row.amount).toLocaleString()} ฿</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

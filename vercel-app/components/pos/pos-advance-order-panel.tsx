'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  getPosDepositHistory,
  type PosDepositHeldHolder,
  type PosDepositHistoryRow,
} from '@/lib/api-client'

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
  reloadToken?: number
  onReceive: () => void
  onRefund?: (holder: { memberId?: number; phone: string }) => void | Promise<void>
}) {
  const { t, storeCode, busy, reloadToken, onReceive, onRefund } = props
  const [open, setOpen] = useState(false)
  const [phoneQuery, setPhoneQuery] = useState('')
  const [historyRows, setHistoryRows] = useState<PosDepositHistoryRow[]>([])
  const [held, setHeld] = useState(0)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [heldHolders, setHeldHolders] = useState<PosDepositHeldHolder[]>([])
  const [heldBusy, setHeldBusy] = useState(false)

  const loadHeld = useCallback(() => {
    if (!storeCode) {
      setHeldHolders([])
      return
    }
    setHeldBusy(true)
    void getPosDepositHistory({ storeCode, limit: 5000 })
      .then((res) => {
        setHeldHolders(res.heldHolders)
      })
      .finally(() => setHeldBusy(false))
  }, [storeCode])

  useEffect(() => {
    loadHeld()
  }, [loadHeld, reloadToken])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-amber-200/80 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20">
        <CardHeader className="flex flex-row items-center justify-between gap-2 py-2 px-3 space-y-0">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <CardTitle className="text-sm font-semibold">
                {t('posDepositQueueTitle') || 'จอง / มัดจำ'}
                {heldHolders.length > 0 ? (
                  <span className="ml-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                    {heldHolders.length}
                  </span>
                ) : null}
              </CardTitle>
            </button>
          </CollapsibleTrigger>
          <Button type="button" size="sm" className="h-8 shrink-0" disabled={busy} onClick={() => onReceive()}>
            {t('posDepositButton') || 'มัดจำ'}
          </Button>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3 px-3 pb-3 pt-0">
            <p className="text-xs text-muted-foreground">
              {t('posDepositUseLaterHint') ||
                '메뉴 없이 예약금만 걸어 둡니다. 방문 때 회원 선택 또는 같은 전화로 결제하면 차감됩니다.'}
            </p>
            {heldBusy && heldHolders.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('loading') || '…'}</p>
            ) : heldHolders.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('posDepositQueueEmpty') || '아직 걸어 둔 예약금이 없습니다.'}
              </p>
            ) : (
              <div className="rounded-md border bg-background p-2 text-xs space-y-1.5 max-h-44 overflow-auto">
                {heldHolders.map((holder) => (
                  <div
                    key={`${holder.memberId || 0}-${holder.guestPhone}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {holder.guestName || holder.guestPhone || (t('posDepositHeld') || 'มัดจำ')}
                      </p>
                      {holder.guestPhone ? (
                        <p className="truncate tabular-nums text-muted-foreground">{holder.guestPhone}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="tabular-nums font-semibold">{holder.held.toLocaleString()} ฿</span>
                      {onRefund && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={busy}
                          onClick={() => {
                            void Promise.resolve(
                              onRefund({ memberId: holder.memberId, phone: holder.guestPhone })
                            ).then(() => loadHeld())
                          }}
                        >
                          {t('posDepositRefund') || '환불'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                        void Promise.resolve(onRefund({ memberId, phone: phoneQuery })).then(() => loadHeld())
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
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

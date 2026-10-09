'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

/** 상단 툴바 버튼 — 누르면 예약금(จอง / มัดจำ) 팝업 */
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

  const title = t('posDepositQueueTitle') || 'จอง / มัดจำ'

  /** 환불·받기는 별도 확인/입력 모달을 띄우므로 이 팝업을 먼저 닫는다 */
  const runRefund = (holder: { memberId?: number; phone: string }) => {
    if (!onRefund) return
    setOpen(false)
    void Promise.resolve(onRefund(holder)).then(() => loadHeld())
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="relative h-9 shrink-0 gap-1 px-2.5 touch-manipulation min-[640px]:h-8"
        title={title}
        aria-label={title}
        onClick={() => {
          setOpen(true)
          loadHeld()
        }}
      >
        <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden min-[880px]:inline">{title}</span>
        {heldHolders.length > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white">
            {heldHolders.length > 9 ? '9+' : heldHolders.length}
          </span>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              type="button"
              className="h-11 w-full text-base font-semibold"
              disabled={busy}
              onClick={() => {
                setOpen(false)
                onReceive()
              }}
            >
              {t('posDepositButton') || 'มัดจำ'}
            </Button>
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
              <div className="max-h-72 space-y-1.5 overflow-auto rounded-md border bg-background p-2 text-sm">
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
                        <p className="truncate text-xs tabular-nums text-muted-foreground">{holder.guestPhone}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="font-semibold tabular-nums">{holder.held.toLocaleString()} ฿</span>
                      {onRefund && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={busy}
                          onClick={() => runRefund({ memberId: holder.memberId, phone: holder.guestPhone })}
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
                className="h-9"
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
              <div className="max-h-48 space-y-1 overflow-auto rounded-md border bg-background p-2 text-xs">
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
                        runRefund({ memberId, phone: phoneQuery })
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
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

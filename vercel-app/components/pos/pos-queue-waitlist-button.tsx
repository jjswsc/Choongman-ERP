'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listPosQueueTickets } from '@/lib/api-client/pos-queue-tickets'
import { tOr } from '@/lib/i18n'
import { isPosQueueTicketActive } from '@/lib/pos-queue-ticket'
import { useVisiblePolling } from '@/lib/use-visible-polling'

const PosQueueWaitlistDialog = dynamic(
  () => import('@/components/pos/pos-queue-waitlist-dialog').then((m) => m.PosQueueWaitlistDialog),
  { ssr: false }
)

const BADGE_POLL_MS = 60_000

/** 매장 설정(pos_queue_store_codes)으로 켜진 매장에서만 보인다 */
export function PosQueueWaitlistButton(props: {
  storeCode: string
  t: (key: string) => string
}) {
  const { storeCode, t } = props
  const [enabled, setEnabled] = React.useState(false)
  const [waitingCount, setWaitingCount] = React.useState(0)
  const [open, setOpen] = React.useState(false)

  const refreshBadge = React.useCallback(async () => {
    const code = String(storeCode || '').trim()
    if (!code || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
    try {
      const res = await listPosQueueTickets(code)
      setEnabled(res.enabled)
      setWaitingCount(res.tickets.filter((x) => isPosQueueTicketActive(x.status)).length)
    } catch {
      /* 배지는 실패해도 무시 */
    }
  }, [storeCode])

  React.useEffect(() => {
    setEnabled(false)
    setWaitingCount(0)
    void refreshBadge()
  }, [refreshBadge])

  useVisiblePolling(refreshBadge, BADGE_POLL_MS, { enabled: enabled && !open })

  if (!enabled) return null
  const label = tOr(t, 'posQueueButton', '대기')
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={waitingCount > 0 ? 'default' : 'outline'}
        className="h-9 min-[640px]:h-8 gap-1.5 px-2 min-[640px]:px-3 touch-manipulation shrink-0 rounded-md"
        onClick={() => setOpen(true)}
        title={tOr(t, 'posQueueTitle', '자리 대기 번호표')}
      >
        <Users className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden min-[500px]:inline">{label}</span>
        {waitingCount > 0 ? <span className="tabular-nums">{waitingCount}</span> : null}
      </Button>
      {open ? (
        <PosQueueWaitlistDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) void refreshBadge()
          }}
          storeCode={storeCode}
          t={t}
          onWaitingCountChange={setWaitingCount}
        />
      ) : null}
    </>
  )
}

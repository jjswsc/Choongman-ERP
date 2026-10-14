'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { appAlert } from '@/lib/app-message'
import type { PosPrinterSettings } from '@/lib/api-client'
import {
  issuePosQueueTicketRequest,
  listPosQueueTickets,
  postPosQueueTicketAction,
} from '@/lib/api-client/pos-queue-tickets'
import { tOr, tr } from '@/lib/i18n'
import { shouldQueueTableQrPrintToMainPos } from '@/lib/print-qr-table-thermal-slip'
import { printPosQueueTicketSlip, resolvePosQueuePublicUrl } from '@/lib/print-pos-queue-ticket-slip'
import {
  countPosQueueTeamsAhead,
  formatPosQueueNo,
  isPosQueueTicketActive,
  type PosQueueTicket,
  type PosQueueTicketAction,
  type PosQueueTicketStatus,
} from '@/lib/pos-queue-ticket'
import { useVisiblePolling } from '@/lib/use-visible-polling'
import { cn } from '@/lib/utils'

const LIST_POLL_MS = 10_000
const PARTY_QUICK = [1, 2, 3, 4, 5, 6] as const

type RowAction = PosQueueTicketAction | 'reprint'

const STATUS_KEY: Record<PosQueueTicketStatus, [string, string]> = {
  waiting: ['posQueueStatusWaiting', '대기'],
  called: ['posQueueStatusCalled', '호출됨'],
  seated: ['posQueueStatusSeated', '착석'],
  cancelled: ['posQueueStatusCancelled', '취소'],
  no_show: ['posQueueStatusNoShow', '노쇼'],
}

function waitedMinutes(createdAt: string, nowMs: number): number {
  const ms = Date.parse(createdAt)
  if (!Number.isFinite(ms)) return 0
  return Math.max(0, Math.floor((nowMs - ms) / 60_000))
}

function phoneTail(phone: string | null): string {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length >= 4 ? `…${digits.slice(-4)}` : ''
}

export function PosQueueWaitlistDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeCode: string
  t: (key: string) => string
  getPrinterSettings: (storeCode: string) => Promise<PosPrinterSettings>
  onWaitingCountChange?: (count: number) => void
}) {
  const { open, onOpenChange, storeCode, t, getPrinterSettings, onWaitingCountChange } = props
  const [tickets, setTickets] = React.useState<PosQueueTicket[]>([])
  const [nowMs, setNowMs] = React.useState(0)
  const [partySize, setPartySize] = React.useState(2)
  const [phone, setPhone] = React.useState('')
  const [issuing, setIssuing] = React.useState(false)
  const [busyId, setBusyId] = React.useState<number | null>(null)
  const [showClosed, setShowClosed] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      const res = await listPosQueueTickets(storeCode)
      setTickets(res.tickets)
      setNowMs(Date.now())
      onWaitingCountChange?.(res.tickets.filter((x) => isPosQueueTicketActive(x.status)).length)
    } catch {
      /* 다음 폴링에서 재시도 */
    }
  }, [storeCode, onWaitingCountChange])

  React.useEffect(() => {
    if (open) void load()
  }, [open, load])

  useVisiblePolling(load, LIST_POLL_MS, { enabled: open })

  const printLocal = React.useCallback(
    async (ticket: PosQueueTicket, teamsAhead: number) => {
      const printerSettings = await getPrinterSettings(storeCode).catch(() => null)
      await printPosQueueTicketSlip({
        queueNo: ticket.queueNo,
        partySize: ticket.partySize,
        teamsAhead,
        issuedAt: ticket.createdAt,
        url: resolvePosQueuePublicUrl(ticket.publicToken),
        storeLabel: storeCode.replace(/^CM\s+/i, '').trim() || storeCode,
        printerSettings,
      })
    },
    [getPrinterSettings, storeCode]
  )

  const onIssue = async () => {
    if (issuing) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await appAlert(tOr(t, 'posQueueOnlineOnly', '대기 번호표는 인터넷 연결 시에만 사용할 수 있습니다.'))
      return
    }
    setIssuing(true)
    setNotice('')
    try {
      const printRemote = shouldQueueTableQrPrintToMainPos()
      const res = await issuePosQueueTicketRequest({
        storeCode,
        partySize,
        guestPhone: phone.trim(),
        printRemote,
      })
      setPhone('')
      setPartySize(2)
      if (printRemote) {
        setNotice(
          res.remotePrintQueued
            ? tOr(t, 'qrTablePrintQueuedMain', '메인 POS 영수증 프린터로 인쇄 요청을 보냈습니다.')
            : tOr(t, 'posQueuePrintFailed', '번호표 출력에 실패했습니다. 재출력을 눌러 주세요.')
        )
      } else {
        try {
          await printLocal(res.ticket, res.teamsAhead)
        } catch (e) {
          console.warn('queue ticket print failed', e)
          setNotice(tOr(t, 'posQueuePrintFailed', '번호표 출력에 실패했습니다. 재출력을 눌러 주세요.'))
        }
      }
      await load()
    } catch (e) {
      console.warn('queue ticket issue failed', e)
      await appAlert(tOr(t, 'posQueueIssueFailed', '번호표를 발급하지 못했습니다.'))
    } finally {
      setIssuing(false)
    }
  }

  const onRowAction = async (ticket: PosQueueTicket, action: RowAction) => {
    if (busyId != null) return
    setBusyId(ticket.id)
    setNotice('')
    try {
      if (action === 'reprint') {
        if (shouldQueueTableQrPrintToMainPos()) {
          const res = await postPosQueueTicketAction(ticket.id, 'reprint')
          setNotice(
            res.ok
              ? tOr(t, 'qrTablePrintQueuedMain', '메인 POS 영수증 프린터로 인쇄 요청을 보냈습니다.')
              : tOr(t, 'posQueuePrintFailed', '번호표 출력에 실패했습니다. 재출력을 눌러 주세요.')
          )
        } else {
          await printLocal(ticket, countPosQueueTeamsAhead(tickets, ticket.queueNo)).catch((e) => {
            console.warn('queue ticket reprint failed', e)
            setNotice(tOr(t, 'posQueuePrintFailed', '번호표 출력에 실패했습니다. 재출력을 눌러 주세요.'))
          })
        }
        return
      }
      const res = await postPosQueueTicketAction(ticket.id, action)
      if (!res.ok) {
        if (res.conflict) setNotice(tOr(t, 'posQueueConflict', '다른 기기에서 먼저 변경했습니다. 목록을 새로고침했습니다.'))
        else await appAlert(res.message)
        await load()
        return
      }
      if (action === 'call') {
        setNotice(
          res.lineSent
            ? `${formatPosQueueNo(ticket.queueNo)} · ${tOr(t, 'posQueueLineSent', 'LINE 호출 메시지를 보냈습니다.')}`
            : `${formatPosQueueNo(ticket.queueNo)} · ${tOr(t, 'posQueueLineNotSent', 'LINE 메시지는 보내지 않았습니다. 번호를 직접 불러 주세요.')}`
        )
      }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const active = tickets.filter((x) => isPosQueueTicketActive(x.status))
  const closed = tickets.filter((x) => !isPosQueueTicketActive(x.status)).reverse()

  const renderRow = (ticket: PosQueueTicket) => {
    const isActive = isPosQueueTicketActive(ticket.status)
    const [statusKey, statusFallback] = STATUS_KEY[ticket.status]
    const busy = busyId === ticket.id
    const actionBtn = (action: RowAction, label: string, variant: 'default' | 'outline' | 'secondary' = 'outline') => (
      <Button
        key={action}
        type="button"
        size="sm"
        variant={variant}
        className="h-9 px-3 touch-manipulation"
        disabled={busy || busyId != null}
        onClick={() => void onRowAction(ticket, action)}
      >
        {label}
      </Button>
    )
    return (
      <li
        key={ticket.id}
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2',
          ticket.status === 'called' && 'border-emerald-500 bg-emerald-50',
          !isActive && 'opacity-70'
        )}
      >
        <span className="w-14 text-2xl font-black tabular-nums">{formatPosQueueNo(ticket.queueNo)}</span>
        <span className="text-sm font-semibold tabular-nums">{ticket.partySize} 👤</span>
        <Badge variant={ticket.status === 'called' ? 'default' : 'secondary'}>{tOr(t, statusKey, statusFallback)}</Badge>
        {ticket.memberId ? <Badge variant="outline">{tOr(t, 'posQueueMember', '회원')}</Badge> : null}
        {ticket.callCount > 0 ? (
          <span className="text-xs text-muted-foreground">{tr(t, 'posQueueCalledCount', { count: ticket.callCount })}</span>
        ) : null}
        <span className="text-xs text-muted-foreground">{phoneTail(ticket.guestPhone)}</span>
        {isActive ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {tr(t, 'posQueueWaitedMin', { min: waitedMinutes(ticket.createdAt, nowMs) })}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {isActive ? (
            <>
              {actionBtn(
                'call',
                ticket.callCount > 0 ? tOr(t, 'posQueueActionRecall', '재호출') : tOr(t, 'posQueueActionCall', '호출'),
                'default'
              )}
              {actionBtn('seat', tOr(t, 'posQueueActionSeat', '착석'), 'secondary')}
              {actionBtn('no_show', tOr(t, 'posQueueActionNoShow', '노쇼'))}
              {actionBtn('cancel', tOr(t, 'posQueueActionCancel', '취소'))}
              {actionBtn('reprint', tOr(t, 'posQueueActionReprint', '재출력'))}
            </>
          ) : (
            actionBtn('restore', tOr(t, 'posQueueActionRestore', '대기로 되돌리기'))
          )}
        </div>
      </li>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[min(96vw,720px)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tOr(t, 'posQueueTitle', '자리 대기 번호표')}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {tr(t, 'posQueueWaitingCount', { count: active.length })}
            </span>
          </DialogTitle>
        </DialogHeader>

        <section className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{tOr(t, 'posQueuePartySize', '인원')}</span>
            {PARTY_QUICK.map((n) => (
              <Button
                key={n}
                type="button"
                size="sm"
                variant={partySize === n ? 'default' : 'outline'}
                className="h-10 w-10 touch-manipulation text-base"
                onClick={() => setPartySize(n)}
              >
                {n}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-10 w-10 touch-manipulation text-base"
              onClick={() => setPartySize((n) => Math.max(1, n - 1))}
            >
              −
            </Button>
            <span className="w-8 text-center text-lg font-bold tabular-nums">{partySize}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-10 w-10 touch-manipulation text-base"
              onClick={() => setPartySize((n) => Math.min(50, n + 1))}
            >
              +
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={tOr(t, 'posQueuePhoneOptional', '전화번호 (선택 · 회원이면 LINE으로 호출)')}
              className="h-10 min-w-[200px] flex-1"
              maxLength={20}
            />
            <Button
              type="button"
              className="h-10 touch-manipulation px-4 font-bold"
              disabled={issuing}
              onClick={() => void onIssue()}
            >
              {tOr(t, 'posQueueIssue', '번호표 발급·출력')}
            </Button>
          </div>
          {notice ? <p className="text-sm font-medium text-amber-700">{notice}</p> : null}
        </section>

        <section className="space-y-2">
          {active.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{tOr(t, 'posQueueEmpty', '대기 중인 팀이 없습니다.')}</p>
          ) : (
            <ul className="space-y-2">{active.map(renderRow)}</ul>
          )}
          {closed.length > 0 ? (
            <div className="pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowClosed((v) => !v)}>
                {showClosed
                  ? tOr(t, 'posQueueHideClosed', '완료·취소 숨기기')
                  : tr(t, 'posQueueShowClosed', { count: closed.length })}
              </Button>
              {showClosed ? <ul className="mt-2 space-y-2">{closed.map(renderRow)}</ul> : null}
            </div>
          ) : null}
        </section>
      </DialogContent>
    </Dialog>
  )
}

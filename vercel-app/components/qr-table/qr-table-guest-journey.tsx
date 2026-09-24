'use client'

import * as React from 'react'
import { QrTableGuestSwipeSheet } from '@/components/qr-table/qr-table-guest-swipe-sheet'
import {
  buildQrGuestOrderTimeline,
  formatQrGuestOrderClock,
  groupQrGuestHistoryRounds,
  resolveQrGuestOrderPhase,
  type QrGuestHistoryRound,
  type QrGuestSentLineInput,
  type QrGuestTimelineStepId,
} from '@/lib/qr-table-guest-menu'

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.15" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12.2l2.4 2.4L16.2 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function timelineLabel(g: (k: string) => string, id: QrGuestTimelineStepId): string {
  if (id === 'received') return g('statusReceived')
  if (id === 'cooking') return g('statusCooking')
  if (id === 'ready') return g('statusReady')
  return g('statusServed')
}

/** 5 — 주문 완료 전면 화면 */
export function QrTableGuestOrderDoneScreen(props: {
  open: boolean
  tableName: string
  orderId: number | null
  timeLabel: string
  balanceDue?: number
  g: (key: string) => string
  brandBtn: string
  onViewStatus: () => void
  onMoreMenu: () => void
  onPayBill?: () => void
}) {
  const {
    open,
    tableName,
    orderId,
    timeLabel,
    balanceDue = 0,
    g,
    brandBtn,
    onViewStatus,
    onMoreMenu,
    onPayBill,
  } = props
  if (!open) return null
  const canPay = balanceDue >= 1 && onPayBill
  return (
    <div className="fixed inset-0 z-[45] flex flex-col bg-[var(--qr-accent,#faf7f2)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6.5 12.5l3.5 3.5 7.5-8"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-stone-900">{g('orderDoneTitle')}</h2>
          <p className="mt-1.5 text-sm text-stone-600">{g('orderDoneHint')}</p>

          <div className="mt-6 w-full space-y-2.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-stone-500">{g('tableNo')}</span>
              <span className="rounded-lg bg-[var(--qr-brand,#b45309)] px-2.5 py-0.5 text-sm font-bold text-white">
                {tableName || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-stone-500">{g('orderNo')}</span>
              <span className="font-semibold tabular-nums text-stone-900">
                {orderId ? `#${orderId}` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-stone-500">{g('timeLabel')}</span>
              <span className="font-semibold tabular-nums text-stone-900">{timeLabel || '—'}</span>
            </div>
            {canPay ? (
              <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-2.5 text-sm">
                <span className="text-stone-500">{g('balance')}</span>
                <span className="font-bold tabular-nums text-[var(--qr-brand,#b45309)]">
                  ฿{Math.round(balanceDue).toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-4 w-full rounded-2xl bg-emerald-50 px-4 py-3 text-left text-sm text-emerald-800 ring-1 ring-emerald-100">
            <p className="font-semibold">{g('statusCookingBanner')}</p>
            <p className="mt-0.5 text-xs text-emerald-700/90">{g('statusCookingSub')}</p>
          </div>
        </div>

        <div className="mt-6 space-y-2.5">
          {canPay ? (
            <button type="button" className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold ${brandBtn}`} onClick={onPayBill}>
              {g('payBill')}
              {` · ฿${Math.round(balanceDue).toLocaleString()}`}
            </button>
          ) : null}
          <button
            type="button"
            className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold ${canPay ? 'border-2 border-[var(--qr-brand,#b45309)] bg-white text-[var(--qr-brand,#b45309)]' : brandBtn}`}
            onClick={onViewStatus}
          >
            {g('viewOrderStatus')}
          </button>
          <button
            type="button"
            className="w-full rounded-2xl border-2 border-stone-200 bg-white py-3.5 text-[15px] font-semibold text-stone-800"
            onClick={onMoreMenu}
          >
            {g('moreMenu')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 6 — 주문 상태 타임라인 */
export function QrTableGuestOrderStatusSheet(props: {
  open: boolean
  onClose: () => void
  items: QrGuestSentLineInput[]
  orderId: number | null
  timeLabel: string
  g: (key: string) => string
  brandBtn: string
  onMoreMenu: () => void
}) {
  const { open, onClose, items, orderId, timeLabel, g, brandBtn, onMoreMenu } = props
  const phase = resolveQrGuestOrderPhase(items)
  const steps = buildQrGuestOrderTimeline(phase)

  return (
    <QrTableGuestSwipeSheet
      open={open}
      onClose={onClose}
      zClass="z-[46]"
      initialSnap="full"
      ariaLabel={g('orderStatusTitle')}
      header={
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-semibold">{g('orderStatusTitle')}</p>
            <button
              type="button"
              className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-semibold"
              onClick={onClose}
            >
              {g('close')}
            </button>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {orderId ? `#${orderId}` : ''}
            {orderId && timeLabel ? ' · ' : ''}
            {timeLabel}
          </p>
        </div>
      }
      footer={
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold ${brandBtn}`}
            onClick={onMoreMenu}
          >
            {g('moreMenu')}
          </button>
        </div>
      }
    >
      <ol className="space-y-0 px-4 py-2">
        {steps.map((step, i) => {
          const current = step.state === 'current'
          const done = step.state === 'done'
          return (
            <li key={step.id} className="flex gap-3">
              <div className="flex w-8 flex-col items-center">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    current
                      ? 'bg-[var(--qr-brand,#b45309)] text-white'
                      : done
                        ? 'bg-emerald-500 text-white'
                        : 'bg-stone-200 text-stone-500'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                {i < steps.length - 1 ? (
                  <span className={`w-0.5 flex-1 min-h-[1.25rem] ${done || current ? 'bg-[var(--qr-brand,#b45309)]/40' : 'bg-stone-200'}`} />
                ) : null}
              </div>
              <div
                className={`mb-3 min-w-0 flex-1 rounded-2xl px-3 py-2.5 ${
                  current
                    ? 'bg-[var(--qr-brand,#b45309)]/10 ring-1 ring-[var(--qr-brand,#b45309)]/25'
                    : 'bg-stone-50'
                }`}
              >
                <p className={`text-sm font-semibold ${current ? 'text-[var(--qr-brand,#b45309)]' : 'text-stone-800'}`}>
                  {timelineLabel(g, step.id)}
                </p>
                {current && step.id === 'cooking' ? (
                  <p className="mt-0.5 text-xs text-stone-600">{g('statusCookingSub')}</p>
                ) : null}
                {done && step.id === 'served' ? (
                  <p className="mt-0.5 text-xs text-stone-600">{g('statusCompleteSub')}</p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </QrTableGuestSwipeSheet>
  )
}

function OrderRoundCard(props: {
  round: QrGuestHistoryRound
  tableName: string
  orderId: number | null
  roundIndex: number
  isCurrent: boolean
  g: (key: string) => string
  labelFor: (raw: string) => string
  onAddMenu?: () => void
  onViewStatus?: () => void
}) {
  const { round, tableName, orderId, roundIndex, isCurrent, g, labelFor, onAddMenu, onViewStatus } = props
  // 이전 라운드도 미서빙이면 조리 중 — isCurrent만 보면 "เสร็จแล้ว"로 오해됨
  const cooking = !round.allServed
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-3 py-2.5 text-xs">
        <span className="rounded-md bg-[var(--qr-brand,#b45309)] px-2 py-0.5 font-bold text-white">{tableName || '—'}</span>
        {orderId ? <span className="font-semibold tabular-nums text-stone-700">#{orderId}</span> : null}
        <span className="tabular-nums text-stone-500">{round.timeLabel || g('orderHistoryNoTime')}</span>
        <span className="ml-auto text-stone-400">
          {g('orderRound').replace('{n}', String(roundIndex))}
        </span>
      </div>
      <div
        className={`mx-3 mt-2.5 flex items-start gap-2 rounded-xl px-3 py-2.5 ${
          cooking ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600'
        }`}
      >
        <CheckCircle className={`mt-0.5 h-5 w-5 shrink-0 ${cooking ? 'text-emerald-600' : 'text-stone-400'}`} />
        <div>
          <p className="text-sm font-semibold">{cooking ? g('statusCooking') : g('statusServed')}</p>
          <p className="text-[11px] opacity-90">{cooking ? g('statusCookingSub') : g('statusCompleteSub')}</p>
        </div>
      </div>
      <ul className="px-3 py-2">
        {round.lines.map((line, i) => (
          <li key={`${round.key}-${line.name}-${i}`} className="flex items-center gap-2.5 py-2">
            {line.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={line.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover bg-stone-100" />
            ) : (
              <div className="h-11 w-11 shrink-0 rounded-lg bg-stone-200/70" />
            )}
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{labelFor(line.name)}</p>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-700">x{line.qty}</span>
          </li>
        ))}
      </ul>
      {isCurrent && onAddMenu ? (
        <div className="px-3 pb-3">
          <button
            type="button"
            className="w-full rounded-xl border-2 border-[var(--qr-brand,#b45309)] py-2.5 text-sm font-semibold text-[var(--qr-brand,#b45309)]"
            onClick={onAddMenu}
          >
            {g('addMoreMenu')}
          </button>
        </div>
      ) : onViewStatus ? (
        <div className="px-3 pb-3">
          <button
            type="button"
            className="w-full rounded-xl bg-stone-100 py-2.5 text-sm font-semibold text-stone-700"
            onClick={onViewStatus}
          >
            {g('viewDetails')}
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** 7 — 주문 내역 (현재 / 이전) */
export function QrTableGuestOrderHistorySheet(props: {
  open: boolean
  onClose: () => void
  items: QrGuestSentLineInput[]
  sessionCreatedAt?: string | null
  tableName: string
  orderId: number | null
  balanceDue?: number
  g: (key: string) => string
  labelFor: (raw: string) => string
  onAddMenu: () => void
  onViewStatus: () => void
  onPayBill?: () => void
}) {
  const {
    open,
    onClose,
    items,
    sessionCreatedAt,
    tableName,
    orderId,
    balanceDue = 0,
    g,
    labelFor,
    onAddMenu,
    onViewStatus,
    onPayBill,
  } = props
  const [tab, setTab] = React.useState<'current' | 'past'>('current')
  const rounds = React.useMemo(
    () => groupQrGuestHistoryRounds(items, sessionCreatedAt),
    [items, sessionCreatedAt]
  )
  // groups are oldest→newest; current = last
  const current = rounds.length > 0 ? rounds[rounds.length - 1] : null
  const past = rounds.length > 1 ? rounds.slice(0, -1).reverse() : []
  const canPay = balanceDue >= 1 && onPayBill

  React.useEffect(() => {
    if (open) setTab('current')
  }, [open])

  return (
    <QrTableGuestSwipeSheet
      open={open}
      onClose={onClose}
      zClass="z-40"
      initialSnap="full"
      ariaLabel={g('orderHistory')}
      header={
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-semibold">{g('orderHistory')}</p>
            <button
              type="button"
              className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-semibold"
              onClick={onClose}
            >
              {g('close')}
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl bg-stone-100 p-1">
            <button
              type="button"
              className={`rounded-lg py-2 text-sm font-semibold ${
                tab === 'current' ? 'bg-[var(--qr-brand,#b45309)] text-white shadow-sm' : 'text-stone-600'
              }`}
              onClick={() => setTab('current')}
            >
              {g('currentOrderTab')}
            </button>
            <button
              type="button"
              className={`rounded-lg py-2 text-sm font-semibold ${
                tab === 'past' ? 'bg-[var(--qr-brand,#b45309)] text-white shadow-sm' : 'text-stone-600'
              }`}
              onClick={() => setTab('past')}
            >
              {g('pastOrderTab')}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 px-4 py-2 pb-6">
        {canPay ? (
          <div className="rounded-2xl border border-[var(--qr-brand,#b45309)]/25 bg-[var(--qr-brand,#b45309)]/10 px-4 py-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-stone-600">{g('balance')}</span>
              <span className="font-bold tabular-nums text-[var(--qr-brand,#b45309)]">
                ฿{Math.round(balanceDue).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-600">{g('payBillReceiptHint')}</p>
            <button
              type="button"
              className="mt-2.5 w-full rounded-xl bg-[var(--qr-brand,#b45309)] py-2.5 text-sm font-semibold text-white"
              onClick={onPayBill}
            >
              {g('payBill')}
              {` · ฿${Math.round(balanceDue).toLocaleString()}`}
            </button>
          </div>
        ) : null}
        {tab === 'current' ? (
          current ? (
            <OrderRoundCard
              round={current}
              tableName={tableName}
              orderId={orderId}
              roundIndex={rounds.length}
              isCurrent
              g={g}
              labelFor={labelFor}
              onAddMenu={() => {
                onClose()
                onAddMenu()
              }}
            />
          ) : (
            <p className="py-12 text-center text-sm text-stone-500">{g('orderHistoryEmpty')}</p>
          )
        ) : past.length > 0 ? (
          past.map((round, i) => (
            <OrderRoundCard
              key={round.key}
              round={round}
              tableName={tableName}
              orderId={orderId}
              roundIndex={rounds.length - 1 - i}
              isCurrent={false}
              g={g}
              labelFor={labelFor}
              onViewStatus={() => {
                onClose()
                onViewStatus()
              }}
            />
          ))
        ) : (
          <p className="py-12 text-center text-sm text-stone-500">{g('orderHistoryEmpty')}</p>
        )}
      </div>
    </QrTableGuestSwipeSheet>
  )
}

export function latestOrderTimeLabel(
  items: QrGuestSentLineInput[],
  sessionCreatedAt?: string | null
): string {
  const rounds = groupQrGuestHistoryRounds(items, sessionCreatedAt)
  const last = rounds[rounds.length - 1]
  if (last?.timeLabel) return last.timeLabel
  return formatQrGuestOrderClock(sessionCreatedAt || null) || ''
}

/** 8 — 테이블 PromptPay 잔액 결제 */
export function QrTableGuestBillPaySheet(props: {
  open: boolean
  onClose: () => void
  amount: number
  qrPayload: string
  busy?: boolean
  g: (key: string) => string
  renderQr: (payload: string) => React.ReactNode
}) {
  const { open, onClose, amount, qrPayload, busy, g, renderQr } = props
  return (
    <QrTableGuestSwipeSheet
      open={open}
      onClose={onClose}
      zClass="z-[48]"
      initialSnap="full"
      ariaLabel={g('payBillTitle')}
      header={
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-semibold">{g('payBillTitle')}</p>
            <button
              type="button"
              className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-semibold"
              onClick={onClose}
            >
              {g('close')}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 px-4 pb-6 pt-1">
        <div className="rounded-2xl bg-[var(--qr-brand,#b45309)]/10 px-4 py-3 text-sm text-stone-800 ring-1 ring-[var(--qr-brand,#b45309)]/20">
          <p className="font-semibold">{g('payBillHint')}</p>
          <p className="mt-1 text-xs text-stone-600">{g('payBillReceiptHint')}</p>
        </div>
        <p className="text-center text-sm text-stone-600">{g('amount')}</p>
        <p className="text-center text-3xl font-bold tabular-nums text-[var(--qr-brand,#b45309)]">
          ฿{Math.round(amount).toLocaleString()}
        </p>
        {qrPayload ? (
          <div className="flex justify-center py-2">{renderQr(qrPayload)}</div>
        ) : (
          <p className="py-10 text-center text-sm text-stone-500">{busy ? g('loading') : g('showQr')}</p>
        )}
        <p className="text-center text-sm font-medium text-stone-600">{g('payBillWaiting')}</p>
      </div>
    </QrTableGuestSwipeSheet>
  )
}

/** 결제 완료 안내 (영수증은 카운터) */
export function QrTableGuestBillPaidScreen(props: {
  open: boolean
  g: (key: string) => string
  brandBtn: string
  onClose: () => void
}) {
  const { open, g, brandBtn, onClose } = props
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[49] flex flex-col bg-[var(--qr-accent,#faf7f2)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
          <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6.5 12.5l3.5 3.5 7.5-8"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-stone-900">{g('payBillDoneTitle')}</h2>
        <p className="mt-2 text-sm text-stone-600">{g('payBillDoneHint')}</p>
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950">
          <p className="font-semibold">{g('payBillReceiptHint')}</p>
        </div>
        <button type="button" className={`mt-8 w-full rounded-2xl py-3.5 text-[15px] font-semibold ${brandBtn}`} onClick={onClose}>
          {g('close')}
        </button>
      </div>
    </div>
  )
}

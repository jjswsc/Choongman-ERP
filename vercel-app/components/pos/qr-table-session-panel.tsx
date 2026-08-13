'use client'

import * as React from 'react'
import { Printer, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  qrTableAdminAction,
  qrTableAdminGet,
  qrTableStaffAckCall,
  qrTableStaffAdjustGuests,
  qrTableStaffConfirmEntry,
  qrTableStaffOpenSession,
  qrTableStaffSessionByTable,
} from '@/lib/api-client/qr-table'
import { printQrTableThermalSlip } from '@/lib/print-qr-table-thermal-slip'
import { pickQrTokenForTable, resolveQrTableGuestUrl } from '@/lib/qr-table-thermal-slip-html'
import type { QrBuffetTier, QrOrderStoreSettings, QrTableSession, QrTableToken } from '@/lib/qr-table-types'
import { buffetTierDisplayName, defaultQrOrderStoreSettings } from '@/lib/qr-table-types'
import { appAlert } from '@/lib/app-message'
import { useLang } from '@/lib/lang-context'
import { useT, tOr } from '@/lib/i18n'

type OrderBalance = {
  orderId: number | null
  total: number
  paymentQr: number
  balanceDue: number
  status: string
}

function playCallBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.value = 0.08
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    window.setTimeout(() => {
      o.stop()
      void ctx.close()
    }, 180)
  } catch {
    /* ignore */
  }
}

export function QrTableSessionPanel(props: {
  storeCode: string
  tableName: string
  /** 슬립 상단 매장명. 없으면 storeCode */
  storeLabel?: string
  onChanged?: () => void
}) {
  const { storeCode, tableName, storeLabel, onChanged } = props
  const { lang } = useLang()
  const t = useT(lang)
  const tr = (k: string, fb: string) => tOr(t, k, fb)
  const [session, setSession] = React.useState<QrTableSession | null>(null)
  const [orderBalance, setOrderBalance] = React.useState<OrderBalance | null>(null)
  const [tiers, setTiers] = React.useState<QrBuffetTier[]>([])
  const [settings, setSettings] = React.useState<QrOrderStoreSettings>(defaultQrOrderStoreSettings(''))
  const [guestCount, setGuestCount] = React.useState(2)
  const [tierId, setTierId] = React.useState('')
  const [tokens, setTokens] = React.useState<QrTableToken[]>([])
  const [busy, setBusy] = React.useState(false)
  const [printing, setPrinting] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const lastCallAtRef = React.useRef<string | null>(null)

  const isAlaCarte = settings.mode === 'a_la_carte'

  const reload = React.useCallback(async () => {
    if (!storeCode || !tableName) return
    const [sessRes, adminRes] = await Promise.all([
      qrTableStaffSessionByTable(storeCode, tableName),
      qrTableAdminGet(storeCode),
    ])
    const next = sessRes.session || null
    const callAt = next?.staffCallAt || null
    if (callAt && callAt !== lastCallAtRef.current) {
      playCallBeep()
    }
    lastCallAtRef.current = callAt
    setSession(next)
    setOrderBalance(sessRes.orderBalance || null)
    if (adminRes.settings) setSettings(adminRes.settings)
    setTiers((adminRes.tiers || []).filter((x) => x.active))
    setTokens(adminRes.tokens || [])
    setLoaded(true)
  }, [storeCode, tableName])

  React.useEffect(() => {
    setLoaded(false)
    void reload()
  }, [reload])

  React.useEffect(() => {
    if (!session) return
    /** 5s는 Fluid CPU·요청 폭증 — 홀 배지(15s)와 맞춤 */
    const id = window.setInterval(() => void reload(), 15_000)
    return () => window.clearInterval(id)
  }, [session, reload])

  async function openSession() {
    setBusy(true)
    try {
      const res = await qrTableStaffOpenSession({
        storeCode,
        tableName,
        guestCount,
        tierId: isAlaCarte ? 0 : Number(tierId || 0),
        entryPaymentChoice: 'postpay',
        extrasPaymentChoice: 'postpay',
      })
      if (!res.success) {
        await appAlert(res.message || 'open_failed')
        return
      }
      setSession(res.session || null)
      await reload()
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  async function changeGuests(delta: number) {
    if (!session?.id) return
    const next = Math.min(99, Math.max(1, session.guestCount + delta))
    if (next === session.guestCount) return
    setBusy(true)
    try {
      const res = await qrTableStaffAdjustGuests(session.id, storeCode, next)
      if (!res.success) {
        await appAlert(res.message || 'adjust_failed')
        return
      }
      setSession(res.session || null)
      await reload()
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  async function confirmEntry() {
    if (!session?.id) return
    setBusy(true)
    try {
      const res = await qrTableStaffConfirmEntry(session.id)
      if (!res.success) {
        await appAlert(res.message || 'confirm_failed')
        return
      }
      setSession(res.session || null)
      await reload()
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  async function ackCall() {
    if (!session?.id) return
    setBusy(true)
    try {
      const res = await qrTableStaffAckCall(session.id, storeCode)
      if (!res.success) {
        await appAlert(res.message || 'ack_failed')
        return
      }
      setSession(res.session || null)
      lastCallAtRef.current = null
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function printTableQr() {
    if (printing) return
    setPrinting(true)
    try {
      let token = pickQrTokenForTable(tokens, tableName)
      if (!token) {
        const gen = await qrTableAdminAction({
          action: 'generateTokens',
          storeCode,
          tableNames: [tableName],
        })
        if (gen.success && gen.tokens?.length) {
          setTokens(gen.tokens)
          token = pickQrTokenForTable(gen.tokens, tableName)
        }
      }
      if (!token?.token) {
        await appAlert(tr('qrTablePrintNoToken', '이 테이블 QR이 없습니다. 관리자 화면에서 레이아웃 기준 생성을 먼저 해 주세요.'))
        return
      }
      await printQrTableThermalSlip({
        tableName,
        url: resolveQrTableGuestUrl(token),
        storeLabel: String(storeLabel || '').trim() || storeCode,
        scanTh: tr('qrTableScanTh', 'สแกนเพื่อสั่งอาหาร'),
        scanEn: tr('qrTableScanEn', 'Scan to order from your phone'),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      await appAlert(msg && msg !== 'qr_print_required' ? msg : tr('qrTablePrintFailed', 'QR 인쇄에 실패했습니다.'))
    } finally {
      setPrinting(false)
    }
  }

  const printQrLabel = tr('qrTableSessionPrintQr', 'QR 인쇄')
  const printQrHint = tr('qrTableSessionPrintQrHint', '영수증 프린터로 테이블 QR을 출력합니다. 손님이 스캔해 주문합니다.')
  const printBusy = busy || printing

  const badge =
    !session
      ? null
      : session.staffCallAt
        ? { label: tr('qrTableSessionStaffCall', '손님 호출'), className: 'bg-rose-100 text-rose-800 animate-pulse' }
        : session.status === 'active' && session.entryPaid
          ? { label: tr('qrTableSessionOrdering', 'QR 주문중'), className: 'bg-emerald-100 text-emerald-800' }
          : session.entryPaymentModeResolved === 'prepay' && !session.entryPaid
            ? {
                label: tr('qrTableSessionAwaitPrepay', '입장 선결제 대기'),
                className: 'bg-amber-100 text-amber-900',
              }
            : {
                label: tr('qrTableSessionAwaitConfirm', '입장 후불 확정 필요'),
                className: 'bg-orange-100 text-orange-900',
              }

  // 매장 QR 미사용이면 숨김. 세션이 이미 있으면 종료·잔액 확인용으로 유지
  if (!loaded) return null
  if (!settings.enabled && !session) return null

  const shellClass =
    session?.staffCallAt
      ? 'border-rose-300/80 bg-gradient-to-r from-rose-50 to-white shadow-sm shadow-rose-100/60'
      : session
        ? 'border-emerald-200/80 bg-gradient-to-r from-emerald-50/80 to-white shadow-sm shadow-emerald-100/40'
        : 'border-slate-200/90 bg-gradient-to-r from-slate-50/90 via-white to-amber-50/40 shadow-sm shadow-slate-100/50'

  return (
    <div className={`overflow-hidden rounded-xl border ${shellClass}`}>
      {/* 한 줄 툴바 */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 rounded-lg text-left transition hover:opacity-90 disabled:opacity-50"
            disabled={printBusy}
            title={printQrHint}
            aria-label={printQrLabel}
            onClick={() => void printTableQr()}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <QrCode className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="truncate text-xs font-semibold tracking-tight text-slate-800">
              {tr('qrTableSessionTitle', 'QR 테이블오더')}
            </span>
          </button>
          {badge ? (
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          ) : null}
        </div>

        <div className="mx-0.5 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />

        {session ? (
          <>
            <div className="flex items-center gap-1 text-xs text-slate-700">
              <span className="text-[11px] text-slate-500">{tr('qrTableSessionGuests', '인원')}</span>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                disabled={busy}
                onClick={() => void changeGuests(-1)}
                aria-label="−"
              >
                −
              </button>
              <span className="min-w-[1.25rem] text-center text-sm font-semibold tabular-nums">{session.guestCount}</span>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                disabled={busy}
                onClick={() => void changeGuests(1)}
                aria-label="+"
              >
                +
              </button>
            </div>

            <span className="text-xs font-semibold tabular-nums text-slate-800">
              ฿{session.entryTotal.toLocaleString()}
            </span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                session.entryPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {session.entryPaid
                ? tr('qrTableSessionEntryConfirmed', '입장확정')
                : tr('qrTableSessionEntryPending', '미확정')}
            </span>

            {orderBalance && orderBalance.orderId ? (
              <span className="hidden items-center gap-1.5 text-[11px] text-slate-600 md:inline-flex">
                <span>
                  {tr('qrTableSessionOrderTotal', '주문 합계')} ฿
                  {Number(orderBalance.total || 0).toLocaleString()}
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  {tr('qrTableSessionPaidQr', 'QR 입금')} ฿
                  {Number(orderBalance.paymentQr || 0).toLocaleString()}
                </span>
                <span className="text-slate-300">·</span>
                <span className="font-semibold text-amber-900">
                  {tr('qrTableSessionBalanceDue', '잔액')} ฿
                  {Number(orderBalance.balanceDue || 0).toLocaleString()}
                </span>
              </span>
            ) : null}

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs"
                disabled={printBusy}
                title={printQrHint}
                onClick={() => void printTableQr()}
              >
                <Printer className="mr-1 h-3.5 w-3.5" aria-hidden />
                {printQrLabel}
              </Button>
              {session.staffCallAt ? (
                <Button size="sm" variant="destructive" className="h-8 px-3 text-xs" disabled={busy} onClick={() => void ackCall()}>
                  {tr('qrTableSessionAckCall', '호출 확인')}
                </Button>
              ) : null}
              {session.status === 'awaiting_entry' && !session.entryPaid ? (
                <Button size="sm" className="h-8 px-3 text-xs" disabled={busy} onClick={() => void confirmEntry()}>
                  {tr('qrTableSessionConfirmEntry', '입장 후불 확정')}
                </Button>
              ) : null}
              {session.posOrderId ? (
                <span className="text-[10px] text-slate-400">
                  {tr('qrTableSessionOrderNo', '주문 #{id}').replace('{id}', String(session.posOrderId))}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="shrink-0 text-[11px] font-medium text-slate-500">
                {tr('qrTableSessionGuests', '인원')}
              </span>
              <Input
                type="number"
                min={1}
                max={99}
                value={guestCount}
                onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value || 1)))}
                className="h-8 w-14 border-slate-200 bg-white px-2 text-center text-sm tabular-nums shadow-sm"
              />
            </label>

            <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-[220px]">
              <span className="shrink-0 text-[11px] font-medium text-slate-500">
                {tr('qrTableSessionTier', '패키지')}
              </span>
              {isAlaCarte ? (
                <span className="h-8 flex-1 truncate rounded-md border border-slate-200 bg-white px-2.5 text-xs leading-8 text-slate-500 shadow-sm">
                  {tr('qrTableSessionAlaCarte', '메뉴별 주문')}
                </span>
              ) : (
                <Select value={tierId} onValueChange={setTierId}>
                  <SelectTrigger className="h-8 flex-1 border-slate-200 bg-white text-xs shadow-sm">
                    <SelectValue placeholder={tr('qrTableSessionSelectTier', '선택')} />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers.map((tier) => (
                      <SelectItem key={tier.id} value={String(tier.id)}>
                        {buffetTierDisplayName(tier, lang)} (฿{tier.pricePerPerson})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs font-semibold"
                disabled={printBusy}
                title={printQrHint}
                onClick={() => void printTableQr()}
              >
                <Printer className="mr-1 h-3.5 w-3.5" aria-hidden />
                {printQrLabel}
              </Button>
              <Button
                size="sm"
                className="h-8 bg-slate-900 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
                disabled={busy || (!isAlaCarte && !tierId)}
                onClick={() => void openSession()}
              >
                {tr('qrTableSessionOpen', 'QR 세션 오픈')}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* 호출 메모·좁은 화면 잔액·힌트만 필요 시 한 줄 더 */}
      {session?.staffCallAt && session.staffCallNote ? (
        <p className="border-t border-rose-200/70 bg-rose-50/60 px-2.5 py-1.5 text-[11px] text-rose-800">
          {session.staffCallNote}
        </p>
      ) : null}
      {session && orderBalance && orderBalance.orderId ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-slate-100 px-2.5 py-1 text-[11px] text-slate-600 md:hidden">
          <span>
            {tr('qrTableSessionOrderTotal', '주문 합계')} ฿
            {Number(orderBalance.total || 0).toLocaleString()}
          </span>
          <span>
            {tr('qrTableSessionPaidQr', 'QR 입금')} ฿
            {Number(orderBalance.paymentQr || 0).toLocaleString()}
          </span>
          <span className="font-semibold text-amber-900">
            {tr('qrTableSessionBalanceDue', '잔액')} ฿
            {Number(orderBalance.balanceDue || 0).toLocaleString()}
          </span>
        </div>
      ) : null}
    </div>
  )
}

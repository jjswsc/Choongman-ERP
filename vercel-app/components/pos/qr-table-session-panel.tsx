'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  qrTableAdminGet,
  qrTableStaffAckCall,
  qrTableStaffAdjustGuests,
  qrTableStaffConfirmEntry,
  qrTableStaffOpenSession,
  qrTableStaffSessionByTable,
} from '@/lib/api-client/qr-table'
import type { QrBuffetTier, QrOrderStoreSettings, QrTableSession } from '@/lib/qr-table-types'
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
  onChanged?: () => void
}) {
  const { storeCode, tableName, onChanged } = props
  const { lang } = useLang()
  const t = useT(lang)
  const tr = (k: string, fb: string) => tOr(t, k, fb)
  const [session, setSession] = React.useState<QrTableSession | null>(null)
  const [orderBalance, setOrderBalance] = React.useState<OrderBalance | null>(null)
  const [tiers, setTiers] = React.useState<QrBuffetTier[]>([])
  const [settings, setSettings] = React.useState<QrOrderStoreSettings>(defaultQrOrderStoreSettings(''))
  const [guestCount, setGuestCount] = React.useState(2)
  const [tierId, setTierId] = React.useState('')
  const [busy, setBusy] = React.useState(false)
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
    setLoaded(true)
  }, [storeCode, tableName])

  React.useEffect(() => {
    setLoaded(false)
    void reload()
  }, [reload])

  React.useEffect(() => {
    if (!session) return
    const id = window.setInterval(() => void reload(), 5000)
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

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{tr('qrTableSessionTitle', 'QR 테이블오더')}</p>
        {badge ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
        ) : null}
      </div>

      {session?.staffCallAt ? (
        <div className="space-y-2 rounded-md border border-rose-300 bg-rose-50 px-2.5 py-2 text-sm">
          <p className="font-semibold text-rose-900">{tr('qrTableSessionStaffCall', '손님 호출')}</p>
          {session.staffCallNote ? <p className="text-xs text-rose-800">{session.staffCallNote}</p> : null}
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => void ackCall()}>
            {tr('qrTableSessionAckCall', '호출 확인')}
          </Button>
        </div>
      ) : null}

      {session ? (
        <div className="space-y-2 text-sm">
          <p>
            {tr('qrTableSessionGuests', '인원')}{' '}
            <button type="button" className="mx-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-sm" disabled={busy} onClick={() => void changeGuests(-1)}>
              −
            </button>
            <span className="font-semibold tabular-nums">{session.guestCount}</span>
            <button type="button" className="mx-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-sm" disabled={busy} onClick={() => void changeGuests(1)}>
              +
            </button>
            · ฿{session.entryTotal.toLocaleString()} ·{' '}
            {session.entryPaid
              ? tr('qrTableSessionEntryConfirmed', '입장확정')
              : tr('qrTableSessionEntryPending', '미확정')}
          </p>
          {orderBalance && orderBalance.orderId ? (
            <div className="rounded-md border border-amber-200/80 bg-white/70 px-2.5 py-2 text-xs space-y-0.5">
              <p>
                {tr('qrTableSessionOrderTotal', '주문 합계')} ฿
                {Number(orderBalance.total || 0).toLocaleString()}
              </p>
              <p>
                {tr('qrTableSessionPaidQr', 'QR 입금')} ฿
                {Number(orderBalance.paymentQr || 0).toLocaleString()}
              </p>
              <p className="font-semibold text-amber-950">
                {tr('qrTableSessionBalanceDue', '잔액')} ฿
                {Number(orderBalance.balanceDue || 0).toLocaleString()}
              </p>
            </div>
          ) : null}
          {session.status === 'awaiting_entry' && !session.entryPaid ? (
            <Button size="sm" disabled={busy} onClick={() => void confirmEntry()}>
              {tr('qrTableSessionConfirmEntry', '입장 후불 확정 (메뉴 오픈)')}
            </Button>
          ) : null}
          {session.posOrderId ? (
            <p className="text-xs text-muted-foreground">
              {tr('qrTableSessionOrderNo', '주문 #{id}').replace('{id}', String(session.posOrderId))}
            </p>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            {tr('qrTableSessionCloseHint', 'POS에서 결제·취소하면 QR 세션이 자동 종료됩니다.')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{tr('qrTableSessionGuests', '인원')}</Label>
              <Input
                type="number"
                min={1}
                max={99}
                value={guestCount}
                onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value || 1)))}
              />
            </div>
            <div>
              <Label className="text-xs">{tr('qrTableSessionTier', '티어')}</Label>
              {isAlaCarte ? (
                <p className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                  {tr('qrTableSessionAlaCarte', '일반 메뉴 모드')}
                </p>
              ) : (
                <Select value={tierId} onValueChange={setTierId}>
                  <SelectTrigger>
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
          </div>
          <Button size="sm" disabled={busy || (!isAlaCarte && !tierId)} onClick={() => void openSession()}>
            {tr('qrTableSessionOpen', 'QR 세션 오픈')}
          </Button>
        </div>
      )}
    </div>
  )
}

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
  qrTableStaffConfirmEntry,
  qrTableStaffOpenSession,
  qrTableStaffSessionByTable,
} from '@/lib/api-client/qr-table'
import type { QrBuffetTier, QrTableSession } from '@/lib/qr-table-types'
import { buffetTierDisplayName } from '@/lib/qr-table-types'
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

export function QrTableSessionPanel(props: {
  storeCode: string
  tableName: string
  onChanged?: () => void
}) {
  const { storeCode, tableName, onChanged } = props
  const { lang } = useLang()
  const t = useT(lang)
  const tr = React.useCallback((k: string, fb: string) => tOr(t, k, fb), [t])
  const [enabled, setEnabled] = React.useState(false)
  const [ready, setReady] = React.useState(false)
  const [session, setSession] = React.useState<QrTableSession | null>(null)
  const [orderBalance, setOrderBalance] = React.useState<OrderBalance | null>(null)
  const [tiers, setTiers] = React.useState<QrBuffetTier[]>([])
  const [guestCount, setGuestCount] = React.useState(2)
  const [tierId, setTierId] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const reload = React.useCallback(async () => {
    if (!storeCode || !tableName) return
    try {
      const adminRes = await qrTableAdminGet(storeCode)
      const on = Boolean(adminRes.settings?.enabled)
      setEnabled(on)
      if (!on) {
        setSession(null)
        setOrderBalance(null)
        setTiers([])
        return
      }
      const sessRes = await qrTableStaffSessionByTable(storeCode, tableName)
      setSession(sessRes.session || null)
      setOrderBalance(sessRes.orderBalance || null)
      setTiers((adminRes.tiers || []).filter((x) => x.active))
    } catch {
      setEnabled(false)
      setSession(null)
      setOrderBalance(null)
    } finally {
      setReady(true)
    }
  }, [storeCode, tableName])

  React.useEffect(() => {
    void reload()
  }, [reload])

  async function openSession() {
    setBusy(true)
    try {
      const res = await qrTableStaffOpenSession({
        storeCode,
        tableName,
        guestCount,
        tierId: Number(tierId || 0),
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

  if (!ready || !enabled) return null

  const badge =
    !session
      ? null
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

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{tr('qrTableSessionTitle', 'QR 테이블오더')}</p>
        {badge ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
        ) : null}
      </div>

      {session ? (
        <div className="space-y-2 text-sm">
          <p>
            {tr('qrTableSessionGuests', '인원')} {session.guestCount} · ฿{session.entryTotal.toLocaleString()} ·{' '}
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
            </div>
          </div>
          <Button size="sm" disabled={busy || !tierId} onClick={() => void openSession()}>
            {tr('qrTableSessionOpen', 'QR 세션 오픈')}
          </Button>
        </div>
      )}
    </div>
  )
}

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

export function QrTableSessionPanel(props: {
  storeCode: string
  tableName: string
  onChanged?: () => void
}) {
  const { storeCode, tableName, onChanged } = props
  const [enabled, setEnabled] = React.useState(false)
  const [ready, setReady] = React.useState(false)
  const [session, setSession] = React.useState<QrTableSession | null>(null)
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
        setTiers([])
        return
      }
      const sessRes = await qrTableStaffSessionByTable(storeCode, tableName)
      setSession(sessRes.session || null)
      setTiers((adminRes.tiers || []).filter((t) => t.active))
    } catch {
      setEnabled(false)
      setSession(null)
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
        ? { label: 'QR 주문중', className: 'bg-emerald-100 text-emerald-800' }
        : session.entryPaymentModeResolved === 'prepay' && !session.entryPaid
          ? { label: '입장 선결제 대기', className: 'bg-amber-100 text-amber-900' }
          : { label: '입장 후불 확정 필요', className: 'bg-orange-100 text-orange-900' }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">QR 테이블오더</p>
        {badge ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
        ) : null}
      </div>

      {session ? (
        <div className="space-y-2 text-sm">
          <p>
            인원 {session.guestCount} · 입장 ฿{session.entryTotal.toLocaleString()} ·{' '}
            {session.entryPaid ? '입장확정' : '미확정'}
          </p>
          {session.status === 'awaiting_entry' && !session.entryPaid ? (
            <Button size="sm" disabled={busy} onClick={() => void confirmEntry()}>
              입장 후불 확정 (메뉴 오픈)
            </Button>
          ) : null}
          {session.posOrderId ? (
            <p className="text-xs text-muted-foreground">주문 #{session.posOrderId}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">인원</Label>
              <Input
                type="number"
                min={1}
                max={99}
                value={guestCount}
                onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value || 1)))}
              />
            </div>
            <div>
              <Label className="text-xs">티어</Label>
              <Select value={tierId} onValueChange={setTierId}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {buffetTierDisplayName(t)} (฿{t.pricePerPerson})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button size="sm" disabled={busy || !tierId} onClick={() => void openSession()}>
            QR 세션 오픈
          </Button>
        </div>
      )}
    </div>
  )
}

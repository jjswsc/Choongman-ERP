'use client'

import * as React from 'react'
import { QrTableGuestSwipeSheet } from '@/components/qr-table/qr-table-guest-swipe-sheet'
import {
  composeBirthDateFromParts,
  normalizeMemberPhone,
  splitBirthDateParts,
} from '@/lib/member-phone-lookup'

export type QrGuestMemberInfo = {
  id: number
  memberNo: string
  name: string
  pointBalance?: number
}

export function QrTableGuestMemberLoginSheet(props: {
  open: boolean
  onClose: () => void
  g: (key: string) => string
  brandBtn: string
  busy?: boolean
  error?: string
  onSubmit: (phone: string, birthDate: string) => void | Promise<void>
}) {
  const { open, onClose, g, brandBtn, busy, error, onSubmit } = props
  const [phone, setPhone] = React.useState('')
  const [birthDate, setBirthDate] = React.useState('')
  const parts = React.useMemo(() => splitBirthDateParts(birthDate), [birthDate])
  const years = React.useMemo(() => {
    const now = new Date().getFullYear()
    const out: number[] = []
    for (let y = now; y >= 1940; y -= 1) out.push(y)
    return out
  }, [])

  React.useEffect(() => {
    if (!open) return
    setPhone('')
    setBirthDate('')
  }, [open])

  function setPart(next: { day?: string; month?: string; year?: string }) {
    const day = next.day ?? parts.day
    const month = next.month ?? parts.month
    const year = next.year ?? parts.year
    setBirthDate(composeBirthDateFromParts(day, month, year))
  }

  return (
    <QrTableGuestSwipeSheet
      open={open}
      onClose={onClose}
      zClass="z-[46]"
      initialSnap="full"
      ariaLabel={g('memberLoginTitle')}
      header={
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-semibold">{g('memberLoginTitle')}</p>
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
      <div className="space-y-3 px-4 pb-8 pt-1">
        <p className="text-sm text-stone-600">{g('memberLoginHint')}</p>
        <label className="block text-sm font-medium text-stone-800">
          {g('memberPhone')}
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[15px]"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08x-xxx-xxxx"
          />
        </label>
        <div>
          <p className="text-sm font-medium text-stone-800">{g('memberBirthDate')}</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <select
              className="rounded-xl border border-stone-200 bg-white px-2 py-2.5 text-sm"
              value={parts.day}
              onChange={(e) => setPart({ day: e.target.value })}
            >
              <option value="">{g('memberDay')}</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-stone-200 bg-white px-2 py-2.5 text-sm"
              value={parts.month}
              onChange={(e) => setPart({ month: e.target.value })}
            >
              <option value="">{g('memberMonth')}</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={String(m)}>
                  {m}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-stone-200 bg-white px-2 py-2.5 text-sm"
              value={parts.year}
              onChange={(e) => setPart({ year: e.target.value })}
            >
              <option value="">{g('memberYear')}</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="button"
          disabled={busy}
          className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold disabled:opacity-60 ${brandBtn}`}
          onClick={() => void onSubmit(normalizeMemberPhone(phone), birthDate)}
        >
          {busy ? g('memberLoginBusy') : g('memberLoginSubmit')}
        </button>
      </div>
    </QrTableGuestSwipeSheet>
  )
}

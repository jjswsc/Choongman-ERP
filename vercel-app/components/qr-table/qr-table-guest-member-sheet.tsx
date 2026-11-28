'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { QrTableGuestSwipeSheet } from '@/components/qr-table/qr-table-guest-swipe-sheet'
import { composeBirthDateFromParts, normalizeMemberPhone } from '@/lib/member-phone-lookup'

export type QrGuestMemberInfo = {
  id: number
  memberNo: string
  name: string
  pointBalance?: number
}

type BirthPart = 'day' | 'month' | 'year'

/**
 * 네이티브 `<select>`는 iOS Safari에서 transform·overflow 조상(바텀시트) 안이면
 * 탭해도 피커가 열리지 않는다. 버튼 + body 포탈 목록으로 일/월/년을 고른다.
 */
function BirthPartPicker(props: {
  part: BirthPart
  label: string
  value: string
  options: string[]
  open: boolean
  disabled?: boolean
  onOpen: () => void
  onClose: () => void
  onChange: (value: string) => void
}) {
  const { part, label, value, options, open, disabled, onOpen, onClose, onChange } = props
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  const [box, setBox] = React.useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  const place = React.useCallback(() => {
    const el = btnRef.current
    if (!el || typeof window === 'undefined') return
    const rect = el.getBoundingClientRect()
    const margin = 8
    const width = Math.max(rect.width, 112)
    let left = rect.left
    if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - margin - width)
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
    const maxHeight = Math.max(120, Math.min(280, (openUp ? spaceAbove : spaceBelow) - 6))
    const top = openUp ? Math.max(margin, rect.top - 6 - maxHeight) : rect.bottom + 6
    setBox({ top, left, width, maxHeight })
  }, [])

  React.useLayoutEffect(() => {
    if (!open) return
    place()
    const onReflow = () => place()
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, place])

  React.useEffect(() => {
    if (!open) return
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    selected?.scrollIntoView?.({ block: 'center' })
  }, [open, box])

  const list =
    open && box && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[90]"
            role="presentation"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ul
              ref={listRef}
              id={`qr-birth-${part}`}
              role="listbox"
              aria-label={label}
              data-birth-menu={part}
              className="fixed overflow-y-auto overscroll-contain rounded-xl border border-stone-200 bg-white py-1 shadow-xl touch-pan-y"
              style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
              onClick={(e) => e.stopPropagation()}
            >
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ''}
                  className="min-h-11 w-full px-3 text-left text-[15px] text-stone-400 touch-manipulation"
                  onClick={() => {
                    onChange('')
                    onClose()
                  }}
                >
                  {label}
                </button>
              </li>
              {options.map((opt) => (
                <li key={opt}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === opt}
                    className={`min-h-11 w-full px-3 text-left text-[15px] touch-manipulation ${
                      value === opt ? 'bg-amber-50 font-semibold text-stone-900' : 'text-stone-800'
                    }`}
                    onClick={() => {
                      onChange(opt)
                      onClose()
                    }}
                  >
                    {opt}
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-birth-part={part}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `qr-birth-${part}` : undefined}
        className="flex min-h-11 w-full items-center justify-between gap-1 rounded-xl border border-stone-200 bg-white px-2 py-2.5 text-left text-[15px] touch-manipulation disabled:opacity-60"
        onClick={() => (open ? onClose() : onOpen())}
      >
        <span className={value ? 'text-stone-900' : 'text-stone-400'}>{value || label}</span>
        <svg className="h-4 w-4 shrink-0 text-stone-400" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {list}
    </>
  )
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
  const [day, setDay] = React.useState('')
  const [month, setMonth] = React.useState('')
  const [year, setYear] = React.useState('')
  const [openPart, setOpenPart] = React.useState<BirthPart | null>(null)
  const birthDate = React.useMemo(() => composeBirthDateFromParts(day, month, year), [day, month, year])
  const years = React.useMemo(() => {
    const now = new Date().getFullYear()
    const out: string[] = []
    for (let y = now; y >= 1940; y -= 1) out.push(String(y))
    return out
  }, [])
  const days = React.useMemo(() => Array.from({ length: 31 }, (_, i) => String(i + 1)), [])
  const months = React.useMemo(() => Array.from({ length: 12 }, (_, i) => String(i + 1)), [])

  React.useEffect(() => {
    if (!open) return
    setPhone('')
    setDay('')
    setMonth('')
    setYear('')
    setOpenPart(null)
  }, [open])

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
            <BirthPartPicker
              part="day"
              label={g('memberDay')}
              value={day}
              options={days}
              open={openPart === 'day'}
              disabled={busy}
              onOpen={() => setOpenPart('day')}
              onClose={() => setOpenPart(null)}
              onChange={setDay}
            />
            <BirthPartPicker
              part="month"
              label={g('memberMonth')}
              value={month}
              options={months}
              open={openPart === 'month'}
              disabled={busy}
              onOpen={() => setOpenPart('month')}
              onClose={() => setOpenPart(null)}
              onChange={setMonth}
            />
            <BirthPartPicker
              part="year"
              label={g('memberYear')}
              value={year}
              options={years}
              open={openPart === 'year'}
              disabled={busy}
              onOpen={() => setOpenPart('year')}
              onClose={() => setOpenPart(null)}
              onChange={setYear}
            />
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

'use client'

import * as React from 'react'
import {
  qrTableCallStaff,
  qrTableClaimSession,
  qrTableGetMenus,
  qrTableGetOrder,
  qrTableGetSession,
  qrTableIssueEntryQr,
  qrTableIssueExtrasQr,
  qrTableOpenSession,
  qrTablePollEntryPay,
  qrTablePollExtrasPay,
  qrTableSubmitCart,
} from '@/lib/api-client/qr-table'
import type { QrBuffetTier, QrOrderStoreSettings, QrTableSession } from '@/lib/qr-table-types'
import { buffetTierDisplayName } from '@/lib/qr-table-types'
import { aggregateQrGuestSentLines, groupQrGuestSentLinesByTime } from '@/lib/qr-table-guest-menu'
import { normalizeQrGuestLang, qrGuestT, type QrGuestLang } from '@/lib/i18n-qr-table-guest'

type MenuItem = {
  menuId: number
  name: string
  price: number
  listPrice: number
  imageUrl: string
  soldOut?: boolean
  buffetIncluded: boolean
  description: string
  category: string
  categoryMain: string
}

type OrderSummaryItem = {
  id?: string
  name?: string
  qty?: number
  quantity?: number
  price?: number
  buffetIncluded?: boolean
  cancelled?: boolean
  addedAt?: string
  isBuffetEntry?: boolean
}

type OrderSummaryState = {
  total: number
  paymentQr: number
  balanceDue: number
  items: OrderSummaryItem[]
}

function toOrderSummary(order: {
  total?: number
  paymentQr?: number
  balanceDue?: number
  items?: unknown
}): OrderSummaryState {
  return {
    total: Number(order.total || 0),
    paymentQr: Number(order.paymentQr || 0),
    balanceDue: Number(order.balanceDue || 0),
    items: (Array.isArray(order.items) ? order.items : []) as OrderSummaryItem[],
  }
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 7.75V12l3 1.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type Step = 'boot' | 'tier' | 'pay_entry' | 'wait_staff' | 'menu' | 'error'

const AUTH_KEY = 'cm_qr_table_session_auth'
const LANG_KEY = 'cm_qr_table_guest_lang'

function brandCss(settings: QrOrderStoreSettings | null): React.CSSProperties {
  const brand = String(settings?.printBrandColor || '').trim() || '#b45309'
  const accent = String(settings?.printAccentColor || '').trim() || '#faf7f2'
  return {
    ['--qr-brand' as string]: brand,
    ['--qr-accent' as string]: accent,
  }
}

export function QrTableGuestApp({ token }: { token: string }) {
  const [step, setStep] = React.useState<Step>('boot')
  const [error, setError] = React.useState('')
  const [toast, setToast] = React.useState('')
  const [settings, setSettings] = React.useState<QrOrderStoreSettings | null>(null)
  const [tiers, setTiers] = React.useState<QrBuffetTier[]>([])
  const [tableName, setTableName] = React.useState('')
  const [storeCode, setStoreCode] = React.useState('')
  const [guestCount, setGuestCount] = React.useState(2)
  const [tierId, setTierId] = React.useState<number>(0)
  const [entryChoice, setEntryChoice] = React.useState<'prepay' | 'postpay'>('postpay')
  const [extrasChoice, setExtrasChoice] = React.useState<'prepay' | 'postpay'>('postpay')
  const [sessionAuth, setSessionAuth] = React.useState('')
  const [session, setSession] = React.useState<QrTableSession | null>(null)
  const [includedMenus, setIncludedMenus] = React.useState<MenuItem[]>([])
  const [extraMenus, setExtraMenus] = React.useState<MenuItem[]>([])
  const [cart, setCart] = React.useState<Record<number, number>>({})
  const [tab, setTab] = React.useState<'included' | 'extras'>('included')
  const [mainCategory, setMainCategory] = React.useState('')
  const [subCategory, setSubCategory] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [qrPayload, setQrPayload] = React.useState('')
  const [qrAmount, setQrAmount] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [callOpen, setCallOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [orderSummary, setOrderSummary] = React.useState<OrderSummaryState | null>(null)
  const [lang, setLang] = React.useState<QrGuestLang>('th')
  const extrasPayPollRef = React.useRef<number | null>(null)

  const clearExtrasPayPoll = React.useCallback(() => {
    if (extrasPayPollRef.current != null) {
      window.clearInterval(extrasPayPollRef.current)
      extrasPayPollRef.current = null
    }
  }, [])

  React.useEffect(() => () => clearExtrasPayPoll(), [clearExtrasPayPoll])

  const g = React.useCallback((key: string) => qrGuestT(lang, key), [lang])

  function humanizeApiError(raw: string): string {
    const msg = String(raw || '').trim()
    if (!msg) return g('cannotOpen')
    if (msg === 'store_disabled') return g('storeDisabled')
    if (msg === 'staff_open_required') return g('staffOpenRequired')
    if (msg === 'session_expired' || msg === 'session_closed' || msg.includes('expired')) return g('sessionExpired')
    if (msg === 'invalid_token') return g('invalidToken')
    return msg
  }

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2800)
  }

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    setLang(normalizeQrGuestLang(sessionStorage.getItem(LANG_KEY) || navigator.language?.slice(0, 2)))
  }, [])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await qrTableGetSession(token)
        if (cancelled) return
        if (!data.success) {
          setError(humanizeApiError(data.message || 'invalid'))
          setStep('error')
          return
        }
        setSettings(data.settings || null)
        setTiers(data.tiers || [])
        setTableName(data.token?.tableName || '')
        setStoreCode(data.token?.storeCode || '')
        if (data.settings?.entryPaymentMode === 'prepay') setEntryChoice('prepay')
        if (data.settings?.extrasPaymentMode === 'prepay') setExtrasChoice('prepay')
        const saved = typeof window !== 'undefined' ? sessionStorage.getItem(AUTH_KEY) : null
        if (data.activeSession) {
          const claimed = await qrTableClaimSession(token)
          if (claimed.success && claimed.sessionAuth && claimed.session) {
            sessionStorage.setItem(AUTH_KEY, claimed.sessionAuth)
            setSessionAuth(claimed.sessionAuth)
            setSession(claimed.session)
            if (claimed.session.status === 'active' && claimed.session.entryPaid) {
              setStep('menu')
              return
            }
            if (claimed.session.entryPaymentModeResolved === 'prepay' && !claimed.session.entryPaid) {
              setStep('pay_entry')
              return
            }
            setStep('wait_staff')
            return
          }
        }
        if (saved) setSessionAuth(saved)
        if (data.settings?.requireStaffOpen && !data.activeSession) {
          setError(g('staffOpenRequired'))
        }
        setStep('tier')
      } catch (e) {
        if (!cancelled) {
          setError(humanizeApiError(e instanceof Error ? e.message : 'boot_failed'))
          setStep('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once per token
  }, [token])

  React.useEffect(() => {
    if (step !== 'menu' || !sessionAuth) return
    let cancelled = false
    ;(async () => {
      const menus = await qrTableGetMenus(sessionAuth)
      if (cancelled || !menus?.success) {
        if (menus?.message === 'session_expired') {
          setError(g('sessionExpired'))
          setStep('error')
        }
        return
      }
      setIncludedMenus((menus.includedMenus || []) as MenuItem[])
      setExtraMenus((menus.extraMenus || []) as MenuItem[])
      setSession(menus.session || null)
      if (!(menus.includedMenus || []).length) setTab('extras')
      const order = await qrTableGetOrder(sessionAuth)
      if (order?.success && order.order) {
        setOrderSummary(toOrderSummary(order.order))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [step, sessionAuth, g])

  React.useEffect(() => {
    if (!historyOpen || !sessionAuth) return
    let cancelled = false
    ;(async () => {
      const order = await qrTableGetOrder(sessionAuth)
      if (cancelled || !order?.success || !order.order) return
      setOrderSummary(toOrderSummary(order.order))
    })()
    return () => {
      cancelled = true
    }
  }, [historyOpen, sessionAuth])

  React.useEffect(() => {
    if (step !== 'pay_entry' || !sessionAuth || !qrPayload) return
    const t = window.setInterval(async () => {
      const st = await qrTablePollEntryPay(sessionAuth)
      if (st?.entryPaid) {
        setQrPayload('')
        setStep('menu')
      }
    }, 3000)
    return () => window.clearInterval(t)
  }, [step, sessionAuth, qrPayload])

  function changeLang(next: QrGuestLang) {
    setLang(next)
    try {
      sessionStorage.setItem(LANG_KEY, next)
    } catch {
      /* ignore */
    }
  }

  async function handleOpen(forceAlaCarte = false) {
    const useAla =
      forceAlaCarte ||
      settings?.mode === 'a_la_carte' ||
      (settings?.mode === 'both' && !tierId)
    if (!useAla && !tierId) {
      setError(g('selectTier'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await qrTableOpenSession({
        token,
        guestCount,
        tierId: useAla ? 0 : tierId,
        entryPaymentChoice: entryChoice,
        extrasPaymentChoice: extrasChoice,
      })
      if (!res.success || !res.session || !res.sessionAuth) {
        const msg = String(res.message || 'open_failed')
        setError(msg === 'staff_open_required' ? g('staffOpenRequired') : msg)
        return
      }
      sessionStorage.setItem(AUTH_KEY, res.sessionAuth)
      setSessionAuth(res.sessionAuth)
      setSession(res.session)
      if (res.session.entryPaymentModeResolved === 'prepay' && !res.session.entryPaid) {
        setStep('pay_entry')
      } else if (res.session.status === 'active' && res.session.entryPaid) {
        setStep('menu')
      } else {
        setStep('wait_staff')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleEntryQr() {
    setBusy(true)
    try {
      const res = await qrTableIssueEntryQr(sessionAuth)
      if (!res.success) {
        setError(res.message || 'qr_failed')
        return
      }
      setQrPayload(String(res.qrPayload || ''))
      setQrAmount(Number(res.qrAmount || 0))
    } finally {
      setBusy(false)
    }
  }

  function bumpCart(menuId: number, delta: number, soldOut?: boolean) {
    if (soldOut && delta > 0) return
    setCart((prev) => {
      const next = { ...prev }
      const v = Math.max(0, (next[menuId] || 0) + delta)
      if (v <= 0) delete next[menuId]
      else next[menuId] = v
      return next
    })
  }

  async function handleSubmit() {
    const lines = Object.entries(cart).map(([menuId, qty]) => ({
      menuId: Number(menuId),
      qty: Number(qty),
    }))
    if (!lines.length) return
    setBusy(true)
    setError('')
    try {
      const res = await qrTableSubmitCart(sessionAuth, lines)
      if (!res.success) {
        setError(res.message || 'submit_failed')
        return
      }
      setCart({})
      showToast(g('sentKitchen'))
      if (res.order) {
        setOrderSummary(toOrderSummary(res.order))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'submit_failed')
      return
    } finally {
      setBusy(false)
    }
    if (session?.extrasPaymentModeResolved === 'prepay' || extrasChoice === 'prepay') {
      const extrasTotal = lines.reduce((sum, l) => {
        const m = extraMenus.find((x) => x.menuId === l.menuId)
        return sum + (m ? m.listPrice * l.qty : 0)
      }, 0)
      if (extrasTotal >= 1) {
        try {
          const qr = await qrTableIssueExtrasQr(sessionAuth)
          if (qr?.success) {
            setQrPayload(String(qr.qrPayload || ''))
            setQrAmount(Number(qr.qrAmount || 0))
            clearExtrasPayPoll()
            extrasPayPollRef.current = window.setInterval(async () => {
              const st = await qrTablePollExtrasPay(sessionAuth)
              if (st?.paid) {
                clearExtrasPayPoll()
                setQrPayload('')
                const order = await qrTableGetOrder(sessionAuth)
                if (order?.success && order.order) {
                  setOrderSummary(toOrderSummary(order.order))
                }
              }
            }, 3000)
          }
        } catch {
          /* extras QR is not on the kitchen-send path */
        }
      }
    }
  }

  async function handleCall(note: string) {
    if (!sessionAuth) return
    setBusy(true)
    try {
      const res = await qrTableCallStaff(sessionAuth, note)
      if (!res.success) {
        setError(res.message || 'call_failed')
        return
      }
      setSession(res.session || null)
      setCallOpen(false)
      showToast(g('callStaffDone'))
    } finally {
      setBusy(false)
    }
  }

  const selectedTier = tiers.filter((t) => t.active !== false)
  const listRaw = tab === 'included' ? includedMenus : extraMenus
  const uncategorizedLabel = g('uncategorized')
  const sentLines = React.useMemo(
    () => aggregateQrGuestSentLines(orderSummary?.items),
    [orderSummary]
  )
  const sentGroups = React.useMemo(
    () => groupQrGuestSentLinesByTime(orderSummary?.items, session?.createdAt),
    [orderSummary, session?.createdAt]
  )

  const mainCategories = React.useMemo(() => {
    const set = new Set<string>()
    let hasEmpty = false
    for (const m of listRaw) {
      const main = String(m.categoryMain || '').trim()
      if (main) set.add(main)
      else hasEmpty = true
    }
    const list = [...set].sort((a, b) => a.localeCompare(b))
    if (hasEmpty) list.push(uncategorizedLabel)
    return list
  }, [listRaw, uncategorizedLabel])

  const subCategories = React.useMemo(() => {
    if (!mainCategory) return [] as string[]
    const set = new Set<string>()
    for (const m of listRaw) {
      const main = String(m.categoryMain || '').trim() || uncategorizedLabel
      if (main !== mainCategory) continue
      const sub = String(m.category || '').trim()
      if (sub) set.add(sub)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [listRaw, mainCategory, uncategorizedLabel])

  React.useEffect(() => {
    if (!mainCategories.length) {
      setMainCategory('')
      setSubCategory('')
      return
    }
    if (!mainCategories.includes(mainCategory)) {
      setMainCategory(mainCategories[0])
      setSubCategory('')
      return
    }
    if (subCategories.length === 0) {
      if (subCategory) setSubCategory('')
      return
    }
    // 빈 값 = 카테고리 전체 허용. 잘못된 값만 첫 카테고리로 교정
    if (subCategory && !subCategories.includes(subCategory)) {
      setSubCategory(subCategories[0])
    }
  }, [mainCategories, mainCategory, subCategories, subCategory])

  const q = search.trim().toLowerCase()
  const list = listRaw.filter((m) => {
    const main = String(m.categoryMain || '').trim() || uncategorizedLabel
    if (mainCategory && main !== mainCategory) return false
    if (subCategory) {
      const sub = String(m.category || '').trim()
      if (sub !== subCategory) return false
    }
    if (!q) return true
    return (
      m.name.toLowerCase().includes(q) ||
      String(m.category || '').toLowerCase().includes(q) ||
      String(m.categoryMain || '').toLowerCase().includes(q)
    )
  })

  function switchTab(next: 'included' | 'extras') {
    setTab(next)
    setMainCategory('')
    setSubCategory('')
    setSearch('')
  }

  if (step === 'boot') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--qr-accent,#faf7f2)] text-stone-600" style={brandCss(settings)}>
        {g('loading')}
      </div>
    )
  }
  if (step === 'error') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-stone-50 p-6 text-center">
        <p className="text-lg font-semibold text-stone-900">{g('cannotOpen')}</p>
        <p className="text-sm text-stone-600">{error}</p>
      </div>
    )
  }

  const brandBtn = 'bg-[var(--qr-brand,#b45309)] text-white'

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-[var(--qr-accent,#faf7f2)] text-stone-900" style={brandCss(settings)}>
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">{storeCode}</p>
            <h1 className="text-lg font-semibold">
              {g('table')} {tableName}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {step === 'menu' && sessionAuth ? (
              <button
                type="button"
                className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold"
                onClick={() => setHistoryOpen(true)}
              >
                {g('orderHistory')}
                {sentLines.length > 0 ? ` (${sentLines.reduce((n, l) => n + l.qty, 0)})` : ''}
              </button>
            ) : null}
            {(step === 'menu' || step === 'wait_staff' || step === 'pay_entry') && sessionAuth ? (
              <button
                type="button"
                className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold"
                onClick={() => setCallOpen((v) => !v)}
              >
                {g('callStaff')}
              </button>
            ) : null}
            <select
              className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
              value={lang}
              onChange={(e) => changeLang(normalizeQrGuestLang(e.target.value))}
            >
              <option value="th">ไทย</option>
              <option value="en">EN</option>
              <option value="ko">한국어</option>
            </select>
          </div>
        </div>
        {callOpen ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button type="button" disabled={busy} className="rounded-lg bg-stone-100 py-2 text-xs font-medium" onClick={() => void handleCall(g('callWater'))}>
              {g('callWater')}
            </button>
            <button type="button" disabled={busy} className="rounded-lg bg-stone-100 py-2 text-xs font-medium" onClick={() => void handleCall(g('callBill'))}>
              {g('callBill')}
            </button>
            <button type="button" disabled={busy} className="rounded-lg bg-stone-100 py-2 text-xs font-medium" onClick={() => void handleCall(g('callHelp'))}>
              {g('callHelp')}
            </button>
          </div>
        ) : null}
      </header>

      {toast ? (
        <div className="fixed left-1/2 top-16 z-20 -translate-x-1/2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {historyOpen ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/45" onClick={() => setHistoryOpen(false)}>
          <div
            className="flex max-h-[82dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-10 rounded-full bg-stone-200" />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-1">
              <div>
                <p className="text-base font-semibold">{g('orderHistory')}</p>
                {sentLines.length > 0 ? (
                  <p className="text-xs text-stone-500">
                    {g('orderHistoryItemCount').replace(
                      '{n}',
                      String(sentLines.reduce((n, l) => n + l.qty, 0))
                    )}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-700"
                onClick={() => setHistoryOpen(false)}
              >
                {g('close')}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
              {sentGroups.length === 0 ? (
                <p className="py-10 text-center text-sm text-stone-500">{g('orderHistoryEmpty')}</p>
              ) : (
                <div className="space-y-3">
                  {sentGroups.map((group, gi) => {
                    const timedIndex = sentGroups.slice(0, gi + 1).filter((x) => x.timeLabel).length
                    const itemCount = group.lines.reduce((n, l) => n + l.qty, 0)
                    return (
                      <section
                        key={group.key}
                        className="overflow-hidden rounded-2xl border border-stone-100 bg-stone-50/90"
                      >
                        <div className="flex items-center gap-2 border-b border-stone-100 bg-white/90 px-3 py-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--qr-brand,#b45309)]/10 text-[var(--qr-brand,#b45309)]">
                            <ClockIcon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold tabular-nums tracking-wide text-stone-800">
                              {group.timeLabel || g('orderHistoryNoTime')}
                            </p>
                            <p className="text-[11px] text-stone-500">
                              {group.timeLabel
                                ? `${g('orderRound').replace('{n}', String(timedIndex))} · `
                                : ''}
                              {g('orderHistoryItemCount').replace('{n}', String(itemCount))}
                            </p>
                          </div>
                        </div>
                        <ul>
                          {group.lines.map((line, li) => (
                            <li
                              key={`${group.key}-${line.buffetIncluded ? 'in' : 'ex'}-${line.name}-${line.price}-${li}`}
                              className={`flex items-start justify-between gap-3 px-3 py-2.5 ${
                                li > 0 ? 'border-t border-stone-100' : ''
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="font-medium leading-snug">{line.name}</p>
                                <p className="mt-0.5 text-xs text-stone-500">
                                  {line.buffetIncluded ? g('included') : `฿${line.price.toLocaleString()}`}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-sm font-semibold tabular-nums text-stone-800 shadow-sm ring-1 ring-stone-200">
                                ×{line.qty}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )
                  })}
                </div>
              )}
            </div>
            {orderSummary && sentGroups.length > 0 ? (
              <div className="border-t border-stone-200 bg-white px-4 py-3">
                <p className="flex items-center justify-between text-sm font-semibold">
                  <span>{g('total')}</span>
                  <span className="tabular-nums">฿{Number(orderSummary.total || 0).toLocaleString()}</span>
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="mx-4 mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {step === 'tier' ? (
        <section className="space-y-4 p-4">
          <div>
            <label className="text-sm font-medium">{g('guests')}</label>
            <div className="mt-1 flex items-center gap-3">
              <button type="button" className="h-11 w-11 rounded-full bg-white text-xl shadow-sm" onClick={() => setGuestCount((n) => Math.max(1, n - 1))}>
                −
              </button>
              <span className="text-xl font-semibold">{guestCount}</span>
              <button type="button" className="h-11 w-11 rounded-full bg-white text-xl shadow-sm" onClick={() => setGuestCount((n) => Math.min(99, n + 1))}>
                +
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{g('buffetTier')}</p>
            {settings?.mode === 'a_la_carte' ? (
              <p className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
                {g('alaCarteOnly')}
              </p>
            ) : (
              <>
                {selectedTier.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTierId(t.id)}
                    className={`w-full rounded-2xl border px-4 py-3.5 text-left shadow-sm ${
                      tierId === t.id ? 'border-[var(--qr-brand,#b45309)] bg-white ring-2 ring-[var(--qr-brand,#b45309)]/30' : 'border-stone-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{buffetTierDisplayName(t, lang)}</span>
                      <span className="font-semibold">
                        ฿{t.pricePerPerson.toLocaleString()}
                        {g('perPax')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      {g('includedMenusCount').replace('{n}', String((t.includedMenuIds || []).length))}
                    </p>
                  </button>
                ))}
                {settings?.mode === 'both' ? (
                  <button
                    type="button"
                    onClick={() => setTierId(0)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                      tierId === 0 ? 'border-[var(--qr-brand)] bg-white' : 'border-dashed border-stone-300 bg-white/70'
                    }`}
                  >
                    {g('alaCarteOnly')}
                  </button>
                ) : null}
              </>
            )}
          </div>

          {settings?.entryPaymentMode === 'guest_choice' ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{g('entryPayment')}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={`rounded-xl border px-3 py-2.5 ${entryChoice === 'prepay' ? 'border-[var(--qr-brand)] bg-white' : 'bg-white/70'}`} onClick={() => setEntryChoice('prepay')}>
                  {g('payNow')}
                </button>
                <button type="button" className={`rounded-xl border px-3 py-2.5 ${entryChoice === 'postpay' ? 'border-[var(--qr-brand)] bg-white' : 'bg-white/70'}`} onClick={() => setEntryChoice('postpay')}>
                  {g('payLater')}
                </button>
              </div>
            </div>
          ) : null}

          {settings?.extrasPaymentMode === 'guest_choice' ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{g('extrasPayment')}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={`rounded-xl border px-3 py-2.5 ${extrasChoice === 'prepay' ? 'border-[var(--qr-brand)] bg-white' : 'bg-white/70'}`} onClick={() => setExtrasChoice('prepay')}>
                  {g('payNow')}
                </button>
                <button type="button" className={`rounded-xl border px-3 py-2.5 ${extrasChoice === 'postpay' ? 'border-[var(--qr-brand)] bg-white' : 'bg-white/70'}`} onClick={() => setExtrasChoice('postpay')}>
                  {g('payLater')}
                </button>
              </div>
            </div>
          ) : null}

          <button type="button" disabled={busy || Boolean(settings?.requireStaffOpen && !session)} onClick={() => void handleOpen(false)} className={`w-full rounded-2xl py-3.5 font-semibold disabled:opacity-60 ${brandBtn}`}>
            {busy ? g('opening') : g('continue')}
          </button>
          {settings?.requireStaffOpen ? <p className="text-xs text-stone-500">{g('staffOpenHint')}</p> : null}
        </section>
      ) : null}

      {step === 'pay_entry' ? (
        <section className="space-y-4 p-4">
          <p className="text-sm text-stone-600">{g('payEntryHint')}</p>
          <p className="text-2xl font-semibold">฿{(session?.entryTotal || 0).toLocaleString()}</p>
          {!qrPayload ? (
            <button type="button" disabled={busy} onClick={handleEntryQr} className={`w-full rounded-2xl py-3.5 font-semibold ${brandBtn}`}>
              {g('showQr')}
            </button>
          ) : (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center shadow-sm">
              <p className="mb-2 text-sm">
                {g('amount')} ฿{qrAmount.toLocaleString()}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="PromptPay QR"
                className="mx-auto h-56 w-56 object-contain"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrPayload)}`}
              />
              <p className="mt-2 text-xs text-stone-500">{g('waitingPay')}</p>
            </div>
          )}
        </section>
      ) : null}

      {step === 'wait_staff' ? (
        <section className="space-y-3 p-4 text-center">
          <p className="text-lg font-semibold">{g('waitStaffTitle')}</p>
          <p className="text-sm text-stone-600">{g('waitStaffBody')}</p>
          <button type="button" className="rounded-2xl bg-stone-800 px-4 py-2.5 text-white" onClick={() => window.location.reload()}>
            {g('refresh')}
          </button>
        </section>
      ) : null}

      {step === 'menu' ? (
        <section className="pb-28">
          <div className="sticky top-[57px] z-10 space-y-2 border-b border-stone-200/80 bg-white/95 px-4 py-2 backdrop-blur">
            <div className="flex gap-2">
              {includedMenus.length > 0 ? (
                <button type="button" className={`flex-1 rounded-xl py-2.5 text-sm font-medium ${tab === 'included' ? 'bg-[var(--qr-brand)]/15 text-[var(--qr-brand)]' : 'bg-stone-100'}`} onClick={() => switchTab('included')}>
                  {g('included')}
                </button>
              ) : null}
              <button type="button" className={`flex-1 rounded-xl py-2.5 text-sm font-medium ${tab === 'extras' ? 'bg-[var(--qr-brand)]/15 text-[var(--qr-brand)]' : 'bg-stone-100'}`} onClick={() => switchTab('extras')}>
                {includedMenus.length > 0 ? g('extras') : g('menuTab')}
              </button>
            </div>
            <input
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm"
              placeholder={g('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {mainCategories.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{g('mainCategory')}</p>
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  {mainCategories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                        mainCategory === c ? 'bg-[var(--qr-brand,#b45309)] text-white' : 'bg-stone-100 text-stone-800'
                      }`}
                      onClick={() => {
                        setMainCategory(c)
                        setSubCategory('')
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {subCategories.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{g('subCategory')}</p>
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                      !subCategory ? 'bg-stone-900 text-white' : 'bg-stone-100'
                    }`}
                    onClick={() => setSubCategory('')}
                  >
                    {g('allCategories')}
                  </button>
                  {subCategories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                        subCategory === c ? 'bg-stone-900 text-white' : 'bg-stone-100'
                      }`}
                      onClick={() => setSubCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <ul className="divide-y divide-stone-100/80">
            {list.map((m) => (
              <li key={m.menuId} className={`flex gap-3 px-4 py-3.5 ${m.soldOut ? 'opacity-55' : ''}`}>
                {m.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imageUrl} alt="" className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-2xl object-cover bg-stone-100 shadow-sm" />
                ) : (
                  <div className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-2xl bg-stone-200/60" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{m.name}</p>
                  {(m.categoryMain || m.category) ? (
                    <p className="mt-0.5 text-[11px] text-stone-400">
                      {[m.categoryMain, m.category].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  {m.description ? <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">{m.description}</p> : null}
                  <p className="mt-1.5 text-sm font-semibold">
                    {m.soldOut ? (
                      <span className="text-red-600">{g('soldOut')}</span>
                    ) : m.buffetIncluded ? (
                      <span className="text-emerald-700">{g('included')}</span>
                    ) : (
                      `฿${m.price.toLocaleString()}`
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-center">
                  <button type="button" className="h-9 w-9 rounded-full bg-white text-lg shadow-sm disabled:opacity-40" disabled={m.soldOut} onClick={() => bumpCart(m.menuId, -1, m.soldOut)}>
                    −
                  </button>
                  <span className="w-6 text-center tabular-nums">{cart[m.menuId] || 0}</span>
                  <button type="button" className={`h-9 w-9 rounded-full text-lg text-white shadow-sm disabled:opacity-40 ${brandBtn}`} disabled={m.soldOut} onClick={() => bumpCart(m.menuId, 1, m.soldOut)}>
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {orderSummary ? (
            <div className="mx-4 mt-4 rounded-2xl border border-stone-200 bg-white p-3.5 text-sm shadow-sm">
              <p className="font-medium">{g('currentOrder')}</p>
              {sentLines.length > 0 ? (
                <ul className="mt-2 space-y-1 text-stone-700">
                  {sentLines.map((line) => (
                    <li key={`${line.buffetIncluded ? 'in' : 'ex'}-${line.name}-${line.price}`} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {line.name}
                        {line.buffetIncluded ? ` · ${g('included')}` : ''}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        ×{line.qty}
                        {line.buffetIncluded ? '' : ` · ฿${(line.price * line.qty).toLocaleString()}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-stone-500">{g('orderHistoryEmpty')}</p>
              )}
              <p className="mt-2">
                {g('total')} ฿{Number(orderSummary.total || 0).toLocaleString()}
              </p>
              <p>
                {g('paidQr')} ฿{Number(orderSummary.paymentQr || 0).toLocaleString()}
              </p>
              <p className="font-semibold">
                {g('balance')} ฿{Number(orderSummary.balanceDue || 0).toLocaleString()}
              </p>
            </div>
          ) : null}

          {qrPayload ? (
            <div className="mx-4 mt-3 rounded-2xl border border-stone-200 bg-white p-3 text-center shadow-sm">
              <p className="mb-2 text-sm">
                {g('payExtras')} ฿{qrAmount.toLocaleString()}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Extras QR"
                className="mx-auto h-48 w-48 object-contain"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrPayload)}`}
              />
            </div>
          ) : null}

          <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
            <button
              type="button"
              disabled={busy || Object.keys(cart).length === 0}
              onClick={handleSubmit}
              className={`w-full rounded-2xl py-3.5 font-semibold disabled:opacity-50 ${brandBtn}`}
            >
              {busy ? g('sendingKitchen') : g('sendKitchen')}
              {!busy && Object.keys(cart).length > 0
                ? ` · ${Object.values(cart).reduce((a, b) => a + b, 0)}`
                : ''}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
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
import {
  aggregateQrGuestSentLines,
  groupQrGuestSentLinesByTime,
  qrGuestCartLineKey,
  qrGuestMenuNeedsOptionPicker,
  type QrGuestMenuOption,
} from '@/lib/qr-table-guest-menu'
import {
  normalizeQrGuestLang,
  qrGuestLangOption,
  qrGuestT,
  QR_GUEST_LANG_OPTIONS,
  type QrGuestLang,
} from '@/lib/i18n-qr-table-guest'
import { QrTableGuestOptionSheet, type QrGuestOptionPick } from '@/components/qr-table/qr-table-guest-option-sheet'
import type { PosMenu, PosMenuOption } from '@/lib/api-client'
import {
  posMenuGuestSearchHaystack,
  resolvePosMenuGuestLabel,
  resolvePosMenuGuestName,
  type PosMenuGuestI18nMap,
} from '@/lib/pos-menu-guest-i18n'
import { translateQrGuestDescriptions, uniqueQrGuestDescriptions } from '@/lib/qr-table-guest-translate'
import { QR_TABLE_GUEST_PAY_POLL_MS } from '@/lib/qr-table-poll-interval'
import { QR_STAFF_CALL_BILL, QR_STAFF_CALL_HELP } from '@/lib/qr-table-staff-call'
import QRCode from 'qrcode'

type MenuItem = {
  menuId: number
  name: string
  nameI18n?: PosMenuGuestI18nMap
  code?: string
  price: number
  listPrice: number
  imageUrl: string
  soldOut?: boolean
  buffetIncluded: boolean
  description: string
  descriptionDefault?: string
  descriptionI18n?: PosMenuGuestI18nMap
  category: string
  categoryMain: string
  isBanban?: boolean
  banbanFlavorMenuIds?: string[]
  optionSelectionGroups?: string[]
  optionSelectionConfig?: PosMenu['optionSelectionConfig']
  options?: QrGuestMenuOption[]
}

type CartLine = {
  key: string
  menuId: number
  qty: number
  optionIds: number[]
  optionName: string
  menuId1?: number
  menuId2?: number
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

function GuestLangPickerGrid({
  lang,
  onChange,
  compact,
}: {
  lang: QrGuestLang
  onChange: (next: QrGuestLang) => void
  compact?: boolean
}) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {QR_GUEST_LANG_OPTIONS.map((opt) => {
          const selected = lang === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              className={`min-h-9 rounded-full px-3 text-sm font-bold touch-manipulation ${
                selected
                  ? 'bg-[var(--qr-brand,#b45309)] text-white shadow-sm'
                  : 'bg-white text-stone-800 ring-1 ring-amber-200'
              }`}
              onClick={() => onChange(opt.id)}
            >
              {opt.hint}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {QR_GUEST_LANG_OPTIONS.map((opt) => {
        const selected = lang === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            className={`flex min-h-10 flex-col items-center justify-center rounded-xl px-1.5 py-1.5 text-center touch-manipulation ${
              selected
                ? 'bg-[var(--qr-brand,#b45309)] text-white shadow-sm'
                : 'bg-white text-stone-800 ring-1 ring-amber-200'
            }`}
            onClick={() => onChange(opt.id)}
          >
            <span className={`text-[11px] font-bold leading-none ${selected ? 'text-white/80' : 'text-stone-400'}`}>
              {opt.hint}
            </span>
            <span className="mt-0.5 max-w-full truncate text-[12px] font-semibold leading-tight">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function GuestLangSheet({
  open,
  lang,
  onChange,
  onClose,
}: {
  open: boolean
  lang: QrGuestLang
  onChange: (next: QrGuestLang) => void
  onClose: () => void
}) {
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={qrGuestT(lang, 'languageBar')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1.5 w-10 rounded-full bg-stone-200" />
        </div>
        <p className="px-4 pb-1 pt-1 text-base font-semibold">{qrGuestT(lang, 'languageBar')}</p>
        <div className="overflow-y-auto overscroll-contain px-4 pb-3">
          <GuestLangPickerGrid
            lang={lang}
            onChange={(next) => {
              onChange(next)
              onClose()
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}

function GuestLangHeaderButton({
  lang,
  onClick,
}: {
  lang: QrGuestLang
  onClick: () => void
}) {
  const current = qrGuestLangOption(lang)
  return (
    <button
      type="button"
      className="inline-flex min-h-8 shrink-0 items-center gap-0.5 rounded-full bg-[#fff7ed] px-2 py-1 text-[11px] font-bold text-stone-800 shadow-sm ring-1 ring-amber-400 touch-manipulation"
      aria-label={qrGuestT(lang, 'languageBar')}
      aria-haspopup="dialog"
      onClick={onClick}
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M3 12h18M12 3c2.5 3 3.8 6 3.8 9s-1.3 6-3.8 9c-2.5-3-3.8-6-3.8-9S9.5 6 12 3Z"
          stroke="currentColor"
          strokeWidth="1.75"
        />
      </svg>
      {current.hint}
    </button>
  )
}

function GuestPayQrImg({
  payload,
  alt,
  className,
}: {
  payload: string
  alt: string
  className?: string
}) {
  const [src, setSrc] = React.useState('')
  React.useEffect(() => {
    let cancelled = false
    if (!payload) {
      setSrc('')
      return
    }
    void QRCode.toDataURL(payload, { width: 280, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setSrc('')
      })
    return () => {
      cancelled = true
    }
  }, [payload])
  if (!src) {
    return <div className={`${className || ''} animate-pulse rounded-xl bg-stone-100`} aria-hidden />
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} className={className} src={src} />
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
  const [cart, setCart] = React.useState<CartLine[]>([])
  const [optionMenu, setOptionMenu] = React.useState<MenuItem | null>(null)
  const [tab, setTab] = React.useState<'included' | 'extras'>('included')
  const [mainCategory, setMainCategory] = React.useState('')
  const [subCategory, setSubCategory] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [qrPayload, setQrPayload] = React.useState('')
  const [qrAmount, setQrAmount] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [submitConfirmOpen, setSubmitConfirmOpen] = React.useState(false)
  const submitLockRef = React.useRef(false)
  const [callOpen, setCallOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [orderSummary, setOrderSummary] = React.useState<OrderSummaryState | null>(null)
  const [lang, setLang] = React.useState<QrGuestLang>('th')
  const [langSheetOpen, setLangSheetOpen] = React.useState(false)
  const [descByLang, setDescByLang] = React.useState<Record<string, Record<string, string>>>({})
  const [catSheetOpen, setCatSheetOpen] = React.useState(false)
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
    if (msg === 'session_forbidden' || msg === 'session_required') return g('sessionForbidden')
    if (msg === 'session_device_limit') return g('sessionDeviceLimit')
    if (msg === 'invalid_token') return g('invalidToken')
    if (msg === 'option_required' || msg.startsWith('option_not_')) return g('optionRequired')
    if (msg === 'banban_required' || msg === 'banban_flavor_missing') return g('banbanRequired')
    return msg
  }

  function showToast(msg: string, ms = 4200) {
    setToast(msg)
    window.setTimeout(() => setToast(''), ms)
  }

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    setLang(normalizeQrGuestLang(sessionStorage.getItem(LANG_KEY)))
  }, [])

  const guestDescSources = React.useMemo(
    () => uniqueQrGuestDescriptions([...includedMenus, ...extraMenus]),
    [includedMenus, extraMenus]
  )

  React.useEffect(() => {
    let cancelled = false
    if (guestDescSources.length === 0) {
      return
    }
    void translateQrGuestDescriptions(guestDescSources, lang).then((map) => {
      if (!cancelled) {
        setDescByLang((prev) => ({ ...prev, [lang]: map }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [guestDescSources, lang])

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
          const claimed = await qrTableClaimSession(token, saved)
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
        } else if (menus?.message === 'session_forbidden' || menus?.message === 'session_required') {
          const claimed = await qrTableClaimSession(token, sessionAuth)
          if (!cancelled && claimed.success && claimed.sessionAuth && claimed.sessionAuth !== sessionAuth) {
            sessionStorage.setItem(AUTH_KEY, claimed.sessionAuth)
            setSessionAuth(claimed.sessionAuth)
            if (claimed.session) setSession(claimed.session)
          } else if (!cancelled) {
            setError(g('sessionForbidden'))
          }
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
  }, [step, sessionAuth, g, token])

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
    }, QR_TABLE_GUEST_PAY_POLL_MS)
    return () => window.clearInterval(t)
  }, [step, sessionAuth, qrPayload])

  function persistLang(next: QrGuestLang) {
    setLang(next)
    try {
      sessionStorage.setItem(LANG_KEY, next)
    } catch {
      /* ignore */
    }
  }

  function changeLang(next: QrGuestLang) {
    persistLang(next)
  }

  async function handleOpen(forceAlaCarte = false) {
    persistLang(lang)
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

  function qtyForMenu(menuId: number): number {
    return cart.filter((line) => line.menuId === menuId).reduce((n, line) => n + line.qty, 0)
  }

  function cartLinesForMenu(menuId: number): CartLine[] {
    return cart.filter((line) => line.menuId === menuId)
  }

  function addCartLine(menu: MenuItem, pick?: QrGuestOptionPick) {
    if (menu.soldOut) return
    const optionIds = pick?.optionIds || []
    const banban =
      pick?.menuId1 && pick?.menuId2 ? { menuId1: pick.menuId1, menuId2: pick.menuId2 } : undefined
    const key = qrGuestCartLineKey(menu.menuId, optionIds, banban)
    setCart((prev) => {
      const i = prev.findIndex((line) => line.key === key)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], qty: Math.min(99, next[i].qty + 1) }
        return next
      }
      return [
        ...prev,
        {
          key,
          menuId: menu.menuId,
          qty: 1,
          optionIds,
          optionName: pick?.optionName || '',
          menuId1: pick?.menuId1,
          menuId2: pick?.menuId2,
        },
      ]
    })
    setOptionMenu(null)
  }

  function requestAddMenu(menu: MenuItem) {
    if (menu.soldOut) return
    if (qrGuestMenuNeedsOptionPicker(menu)) {
      setOptionMenu(menu)
      return
    }
    addCartLine(menu)
  }

  function decMenu(menuId: number) {
    setCart((prev) => {
      const last = [...prev].reverse().find((line) => line.menuId === menuId)
      if (!last) return prev
      return prev
        .map((line) => (line.key === last.key ? { ...line, qty: line.qty - 1 } : line))
        .filter((line) => line.qty > 0)
    })
  }

  function requestSubmit() {
    if (submitLockRef.current || busy || cart.length === 0) return
    setSubmitConfirmOpen(true)
  }

  async function handleSubmit() {
    const lines = cart.map((line) => ({
      menuId: line.menuId,
      qty: line.qty,
      optionIds: line.optionIds.length ? line.optionIds : undefined,
      menuId1: line.menuId1,
      menuId2: line.menuId2,
    }))
    if (!lines.length || submitLockRef.current) return
    submitLockRef.current = true
    setSubmitConfirmOpen(false)
    setBusy(true)
    setError('')
    const extrasPrepay = session?.extrasPaymentModeResolved === 'prepay' || extrasChoice === 'prepay'
    const extrasTotal = extrasPrepay
      ? lines.reduce((sum, l) => {
          const m = extraMenus.find((x) => x.menuId === l.menuId)
          if (!m) return sum
          const modifier = (l.optionIds || []).reduce((n, id) => {
            const opt = (m.options || []).find((o) => o.id === id)
            return n + (opt ? Number(opt.priceModifier) || 0 : 0)
          }, 0)
          const unit = Math.max(0, Number(m.price) || Number(m.listPrice) || 0) + modifier
          return sum + unit * l.qty
        }, 0)
      : 0
    let auth = sessionAuth
    let submitted = false
    try {
      let res = await qrTableSubmitCart(auth, lines)
      if (!res.success && (res.message === 'session_forbidden' || res.message === 'session_required')) {
        const claimed = await qrTableClaimSession(token, auth)
        if (claimed.success && claimed.sessionAuth) {
          auth = claimed.sessionAuth
          sessionStorage.setItem(AUTH_KEY, auth)
          setSessionAuth(auth)
          if (claimed.session) setSession(claimed.session)
          res = await qrTableSubmitCart(auth, lines)
        }
      }
      if (!res.success) {
        setError(humanizeApiError(res.message || 'submit_failed'))
        return
      }
      setCart([])
      submitted = true
      if (res.order) {
        setOrderSummary(toOrderSummary(res.order))
      }
      if (extrasTotal >= 1) {
        showToast(g('extrasPayThenKitchen'), 5600)
      } else {
        showToast(`${g('sentKitchen')} · ${g('sentKitchenHint')}`)
        setHistoryOpen(true)
      }
    } catch (e) {
      setError(humanizeApiError(e instanceof Error ? e.message : 'submit_failed'))
      return
    } finally {
      setBusy(false)
      submitLockRef.current = false
    }
    if (submitted && extrasTotal >= 1) {
      try {
        const qr = await qrTableIssueExtrasQr(auth)
        if (qr?.success) {
          setQrPayload(String(qr.qrPayload || ''))
          setQrAmount(Number(qr.qrAmount || 0))
          clearExtrasPayPoll()
          extrasPayPollRef.current = window.setInterval(async () => {
            const st = await qrTablePollExtrasPay(auth)
            if (st?.paid) {
              clearExtrasPayPoll()
              setQrPayload('')
              showToast(`${g('sentKitchen')} · ${g('sentKitchenHint')}`)
              setHistoryOpen(true)
              const order = await qrTableGetOrder(auth)
              if (order?.success && order.order) {
                setOrderSummary(toOrderSummary(order.order))
              }
            }
          }, QR_TABLE_GUEST_PAY_POLL_MS)
        }
      } catch {
        /* extras QR is not on the kitchen-send path */
      }
    }
  }

  async function handleCall(note: string) {
    if (!sessionAuth) return
    setBusy(true)
    try {
      const res = await qrTableCallStaff(sessionAuth, note)
      if (!res.success) {
        setError(humanizeApiError(res.message || 'call_failed'))
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
  const cartQty = cart.reduce((n, line) => n + line.qty, 0)
  const cartTotal = React.useMemo(() => {
    const menus = [...includedMenus, ...extraMenus]
    return cart.reduce((sum, line) => {
      const m = menus.find((x) => x.menuId === line.menuId)
      if (!m || m.buffetIncluded) return sum
      const modifier = (line.optionIds || []).reduce((n, id) => {
        const opt = (m.options || []).find((o) => o.id === id)
        return n + (opt ? Number(opt.priceModifier) || 0 : 0)
      }, 0)
      const unit = Math.max(0, Number(m.price) || Number(m.listPrice) || 0) + modifier
      return sum + unit * line.qty
    }, 0)
  }, [cart, includedMenus, extraMenus])
  const displayTotal = Math.round((Number(orderSummary?.total || 0) + cartTotal) * 100) / 100
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

  const mainCategoryCounts = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const m of listRaw) {
      const main = String(m.categoryMain || '').trim() || uncategorizedLabel
      map.set(main, (map.get(main) || 0) + 1)
    }
    return map
  }, [listRaw, uncategorizedLabel])

  const subCategoryCounts = React.useMemo(() => {
    const map = new Map<string, number>()
    let all = 0
    for (const m of listRaw) {
      const main = String(m.categoryMain || '').trim() || uncategorizedLabel
      if (mainCategory && main !== mainCategory) continue
      all += 1
      const sub = String(m.category || '').trim()
      if (!sub) continue
      map.set(sub, (map.get(sub) || 0) + 1)
    }
    map.set('', all)
    return map
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
      posMenuGuestSearchHaystack({
        name: m.name,
        description: m.description,
        category: m.category,
        categoryMain: m.categoryMain,
        nameI18n: m.nameI18n,
        descriptionI18n: m.descriptionI18n,
        lang,
      }).includes(q) ||
      String(descByLang[lang]?.[String(m.description || '').trim()] || '')
        .toLowerCase()
        .includes(q)
    )
  })

  function toPosMenu(m: MenuItem): PosMenu {
    return {
      id: String(m.menuId),
      code: m.code || '',
      name: m.name,
      category: m.category,
      categoryMain: m.categoryMain,
      price: m.listPrice,
      imageUrl: m.imageUrl,
      vatIncluded: true,
      isActive: true,
      sortOrder: 0,
      isBanban: m.isBanban,
      banbanFlavorMenuIds: m.banbanFlavorMenuIds,
      optionSelectionGroups: m.optionSelectionGroups,
      optionSelectionConfig: m.optionSelectionConfig,
      soldOutDate: m.soldOut ? getBangkokSoldOutFlag() : undefined,
    }
  }

  function toPosOptions(options: QrGuestMenuOption[] | undefined): PosMenuOption[] {
    return (options || []).map((o) => ({
      id: String(o.id),
      menuId: String(o.menuId),
      name: o.name,
      optionCode: o.optionCode,
      priceModifier: o.priceModifier,
      sortOrder: o.sortOrder,
      optionType: o.optionType,
      optionStepValues: o.optionStepValues,
      sellHall: o.sellHall !== false,
    }))
  }

  function getBangkokSoldOutFlag(): string {
    return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 10)
  }

  function guestMenuName(m: Pick<MenuItem, 'name' | 'nameI18n'> | { name?: string }) {
    return resolvePosMenuGuestName({ name: String(m.name || ''), nameI18n: 'nameI18n' in m ? m.nameI18n : undefined, lang })
  }

  function guestMenuDesc(m: Pick<MenuItem, 'description' | 'descriptionDefault'>) {
    const src = String(m.description || m.descriptionDefault || '').trim()
    if (!src) return ''
    return descByLang[lang]?.[src] || src
  }

  function guestLabel(raw: string) {
    return resolvePosMenuGuestLabel(raw)
  }

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
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--qr-accent,#faf7f2)] p-6 text-center" style={brandCss(settings)}>
        <div className="w-full max-w-sm">
          <p className="mb-2 text-sm font-medium text-stone-700">{g('languageBar')}</p>
          <GuestLangPickerGrid lang={lang} onChange={changeLang} compact />
        </div>
        <p className="text-lg font-semibold text-stone-900">{g('cannotOpen')}</p>
        <p className="text-sm text-stone-600">{error}</p>
      </div>
    )
  }

  const brandBtn = 'bg-[var(--qr-brand,#b45309)] text-white'
  const catFilterLabel = [mainCategory, subCategory].filter(Boolean).join(' · ') || g('allCategories')

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-[var(--qr-accent,#faf7f2)] text-stone-900" style={brandCss(settings)}>
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight">
              {g('table')} {tableName}
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            {step === 'menu' && sessionAuth ? (
              <button
                type="button"
                className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold"
                onClick={() => setHistoryOpen(true)}
              >
                {g('orderHistory')}
                {sentLines.length > 0 ? ` (${sentLines.reduce((n, l) => n + l.qty, 0)})` : ''}
              </button>
            ) : null}
            {(step === 'menu' || step === 'wait_staff' || step === 'pay_entry') && sessionAuth ? (
              <button
                type="button"
                className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold"
                onClick={() => setCallOpen((v) => !v)}
              >
                {g('callStaff')}
              </button>
            ) : null}
            <GuestLangHeaderButton lang={lang} onClick={() => setLangSheetOpen(true)} />
          </div>
        </div>
        {step === 'menu' ? (
          <div className="flex items-center gap-1.5 border-t border-stone-100 px-3 py-1.5">
            <button
              type="button"
              className="flex min-h-8 max-w-[46%] shrink-0 items-center gap-1 rounded-full bg-stone-900 px-2.5 text-[12px] font-semibold text-white touch-manipulation"
              aria-expanded={catSheetOpen}
              aria-haspopup="dialog"
              onClick={() => setCatSheetOpen(true)}
            >
              <span className="min-w-0 truncate">{catFilterLabel}</span>
              <svg className="h-3.5 w-3.5 shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <input
              className="min-h-8 min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 text-[13px]"
              placeholder={g('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        ) : null}
        {callOpen ? (
          <div className="grid grid-cols-2 gap-2 px-3 pb-2">
            <button type="button" disabled={busy} className="rounded-lg bg-stone-100 py-2 text-xs font-medium" onClick={() => void handleCall(QR_STAFF_CALL_BILL)}>
              {g('callBill')}
            </button>
            <button type="button" disabled={busy} className="rounded-lg bg-stone-100 py-2 text-xs font-medium" onClick={() => void handleCall(QR_STAFF_CALL_HELP)}>
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
                                <p className="font-medium leading-snug">{guestLabel(line.name)}</p>
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
            <p className="text-sm font-medium">{g('languageBar')}</p>
            <div className="mt-1.5">
              <GuestLangPickerGrid lang={lang} onChange={changeLang} compact />
            </div>
          </div>
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
              <GuestPayQrImg alt="PromptPay QR" className="mx-auto h-56 w-56 object-contain" payload={qrPayload} />
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
        <section className="pb-24">
          <ul className="divide-y divide-stone-100/80">
            {list.map((m) => (
              <li key={m.menuId} className={`flex gap-2.5 px-3 py-2 ${m.soldOut ? 'opacity-55' : ''}`}>
                <div className="flex min-w-0 flex-1 gap-2">
                {m.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover bg-stone-100 shadow-sm" />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-xl bg-stone-200/60" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{guestMenuName(m)}</p>
                  {guestMenuDesc(m) ? <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">{guestMenuDesc(m)}</p> : null}
                  {cartLinesForMenu(m.menuId).some((line) => line.optionName) ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-[var(--qr-brand,#b45309)]">
                      {cartLinesForMenu(m.menuId)
                        .filter((line) => line.optionName)
                        .map((line) => `${guestLabel(line.optionName)} ×${line.qty}`)
                        .join(' · ')}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold">
                    {m.soldOut ? (
                      <span className="text-red-600">{g('soldOut')}</span>
                    ) : m.buffetIncluded ? (
                      <span className="text-emerald-700">{g('included')}</span>
                    ) : (
                      `฿${m.price.toLocaleString()}`
                    )}
                  </p>
                </div>
                </div>
                <div className="flex items-center gap-1.5 self-center">
                  <button type="button" className="h-8 w-8 rounded-full bg-white text-lg shadow-sm disabled:opacity-40" disabled={m.soldOut || qtyForMenu(m.menuId) <= 0} onClick={() => decMenu(m.menuId)}>
                    −
                  </button>
                  <span className="w-5 text-center text-sm tabular-nums">{qtyForMenu(m.menuId)}</span>
                  <button type="button" className={`h-8 w-8 rounded-full text-lg text-white shadow-sm disabled:opacity-40 ${brandBtn}`} disabled={m.soldOut} onClick={() => requestAddMenu(m)}>
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
                        {guestLabel(line.name)}
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
                {g('total')} ฿{displayTotal.toLocaleString()}
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
            <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-white p-3 text-center shadow-sm">
              <p className="mb-1 text-sm font-semibold">
                {g('payExtras')} ฿{qrAmount.toLocaleString()}
              </p>
              <p className="mb-2 text-xs text-stone-600">{g('extrasPayThenKitchen')}</p>
              <GuestPayQrImg alt="Extras QR" className="mx-auto h-48 w-48 object-contain" payload={qrPayload} />
            </div>
          ) : null}

          <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-stone-200 bg-white/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
            <button
              type="button"
              disabled={busy || cart.length === 0}
              onClick={requestSubmit}
              className={`w-full rounded-2xl py-3 font-semibold disabled:opacity-50 ${brandBtn}`}
            >
              {busy ? g('sendingKitchen') : g('sendKitchen')}
              {!busy && cartQty > 0 ? ` · ${cartQty}` : ''}
              {!busy && cartTotal >= 1 ? ` · ฿${Math.round(cartTotal).toLocaleString()}` : ''}
            </button>
          </div>
        </section>
      ) : null}

      {submitConfirmOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/45"
          role="presentation"
          onClick={() => setSubmitConfirmOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl bg-white p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold">{g('confirmSendKitchen')}</p>
            <p className="mt-1 text-sm text-stone-600">{g('confirmSendKitchenHint')}</p>
            {cartQty > 0 ? (
              <p className="mt-2 text-sm font-semibold tabular-nums">
                {cartQty}
                {cartTotal >= 1 ? ` · ฿${Math.round(cartTotal).toLocaleString()}` : ''}
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-2xl bg-stone-100 py-3 font-semibold text-stone-800"
                onClick={() => setSubmitConfirmOpen(false)}
              >
                {g('cancel')}
              </button>
              <button
                type="button"
                disabled={busy}
                className={`rounded-2xl py-3 font-semibold disabled:opacity-50 ${brandBtn}`}
                onClick={() => void handleSubmit()}
              >
                {g('confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <GuestLangSheet
        open={langSheetOpen}
        lang={lang}
        onChange={changeLang}
        onClose={() => setLangSheetOpen(false)}
      />

      {catSheetOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45"
              role="presentation"
              onClick={() => setCatSheetOpen(false)}
            >
              <div
                className="flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-label={g('mainCategory')}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-center pt-2.5">
                  <span className="h-1.5 w-10 rounded-full bg-stone-200" />
                </div>
                <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-1">
                  <p className="text-base font-semibold">{g('menuTab')}</p>
                  <button
                    type="button"
                    className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-semibold"
                    onClick={() => setCatSheetOpen(false)}
                  >
                    {g('close')}
                  </button>
                </div>
                <div className="space-y-3 overflow-y-auto overscroll-contain px-4 pb-3">
                  {includedMenus.length > 0 ? (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className={`min-h-10 flex-1 rounded-xl text-sm font-semibold touch-manipulation ${
                          tab === 'included' ? 'bg-[var(--qr-brand)]/15 text-[var(--qr-brand)]' : 'bg-stone-100 text-stone-800'
                        }`}
                        onClick={() => switchTab('included')}
                      >
                        {g('included')}
                      </button>
                      <button
                        type="button"
                        className={`min-h-10 flex-1 rounded-xl text-sm font-semibold touch-manipulation ${
                          tab === 'extras' ? 'bg-[var(--qr-brand)]/15 text-[var(--qr-brand)]' : 'bg-stone-100 text-stone-800'
                        }`}
                        onClick={() => switchTab('extras')}
                      >
                        {g('extras')}
                      </button>
                    </div>
                  ) : null}
                  {mainCategories.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-stone-500">{g('mainCategory')}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {mainCategories.map((c) => {
                          const selected = mainCategory === c
                          const count = mainCategoryCounts.get(c) || 0
                          return (
                            <button
                              key={c}
                              type="button"
                              className={`flex min-h-11 items-center justify-between gap-1 rounded-2xl px-3 text-left text-sm font-semibold touch-manipulation ${
                                selected
                                  ? 'bg-[var(--qr-brand,#b45309)] text-white shadow-sm'
                                  : 'bg-[#fff7ed] text-stone-800 ring-1 ring-amber-100'
                              }`}
                              onClick={() => {
                                setMainCategory(c)
                                setSubCategory('')
                                const hasSub = listRaw.some((m) => {
                                  const main = String(m.categoryMain || '').trim() || uncategorizedLabel
                                  return main === c && Boolean(String(m.category || '').trim())
                                })
                                if (!hasSub) setCatSheetOpen(false)
                              }}
                            >
                              <span className="min-w-0 truncate">{guestLabel(c)}</span>
                              <span className={`shrink-0 tabular-nums text-[11px] ${selected ? 'text-white/75' : 'text-stone-400'}`}>
                                {count}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                  {subCategories.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-stone-500">
                        {g('subCategory')}
                        {mainCategory ? ` · ${mainCategory}` : ''}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {['', ...subCategories].map((c) => {
                          const selected = c ? subCategory === c : !subCategory
                          const label = c || g('allCategories')
                          const count = subCategoryCounts.get(c) || 0
                          return (
                            <button
                              key={c || 'all'}
                              type="button"
                              className={`flex min-h-9 items-center gap-1 rounded-full px-3 text-[13px] font-semibold touch-manipulation ${
                                selected
                                  ? 'bg-stone-900 text-white shadow-sm'
                                  : 'bg-white text-stone-700 ring-1 ring-stone-200'
                              }`}
                              onClick={() => {
                                setSubCategory(c)
                                setCatSheetOpen(false)
                              }}
                            >
                              <span>{c ? guestLabel(label) : label}</span>
                              <span className={`tabular-nums text-[11px] ${selected ? 'text-white/70' : 'text-stone-400'}`}>
                                {count}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <QrTableGuestOptionSheet
        open={!!optionMenu}
        menu={optionMenu ? toPosMenu(optionMenu) : null}
        options={optionMenu ? toPosOptions(optionMenu.options) : []}
        flavorMenus={[...includedMenus, ...extraMenus].map(toPosMenu)}
        buffetIncluded={optionMenu?.buffetIncluded === true}
        storeCode={storeCode}
        t={g}
        onClose={() => setOptionMenu(null)}
        onPick={(pick) => {
          if (optionMenu) addCartLine(optionMenu, pick)
        }}
      />
    </div>
  )
}

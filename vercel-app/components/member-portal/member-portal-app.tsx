"use client"

import * as React from "react"
import Image from "next/image"
import QRCode from "qrcode"
import {
  Award,
  ChevronRight,
  Copy,
  ExternalLink,
  Gift,
  History,
  Home,
  Loader2,
  LogOut,
  MapPin,
  QrCode,
  Search,
  Share2,
  ShoppingCart,
  Sparkles,
  Star,
  Ticket,
  UserRound,
  Wallet,
} from "lucide-react"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BirthDateFields } from "@/components/member-portal/birth-date-fields"
import { MemberPortalLangSelect } from "@/components/member-portal/member-portal-lang-select"
import type { MemberSummary } from "@/lib/members-server"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import {
  memberPortalCouponStatusLabel,
  memberPortalDateLocale,
  memberPortalLoginError,
  memberPortalPointKindLabel,
} from "@/lib/member-portal-i18n"
import { normalizeMemberPhone } from "@/lib/member-phone-lookup"
import type { MemberPortalContentItem } from "@/lib/member-portal-content"
import { MemberPortalOrderTab } from "@/components/member-portal/member-portal-order-tab"
import {
  buildFallbackDashboard,
  formatBaht,
  formatDateTime,
  formatPoints,
  maskPhone,
  tierVisual,
  type PortalCouponRow,
  type PortalDashboard,
  type PortalPointRow,
  type PortalProfileForm,
  type PortalTab,
  type PortalVisitRow,
} from "@/components/member-portal/portal-ui"

type MemberPortalStoreRow = {
  storeCode: string
  displayName: string
  mapQuery: string
}

async function postJson<T>(url: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  })
  return res.json() as Promise<T>
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "same-origin" })
  return res.json() as Promise<T>
}

function LineLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? "h-12 w-12"} aria-hidden>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#06C755" />
      <path
        d="M14 24.8C14 17.73 19.73 12 26.8 12h10.4C44.27 12 50 17.73 50 24.8c0 6.63-5.06 12.07-11.52 12.69l-4.77 6.1a1.4 1.4 0 0 1-2.5-.86v-5.15H26.8C19.73 37.58 14 31.87 14 24.8Z"
        fill="#fff"
      />
      <path
        d="M24.1 21.4c.5 0 .9.4.9.9v4.6h2.1c.5 0 .9.4.9.9s-.4.9-.9.9h-3c-.5 0-.9-.4-.9-.9v-5.5c0-.5.4-.9.9-.9Zm5.6 0c.5 0 .9.4.9.9v5.5c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-5.5c0-.5.4-.9.9-.9Zm2.9 0c.4 0 .7.2.8.5l2.3 3.6v-3.2c0-.5.4-.9.9-.9s.9.4.9.9v5.5c0 .4-.2.7-.6.9-.4.1-.8 0-1-.3l-2.5-3.9v3.3c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-5.5c0-.4.2-.7.6-.8.1-.1.2-.1.4-.1Zm9.7 0c.5 0 .9.4.9.9s-.4.9-.9.9h-2.1v1.1h2.1c.5 0 .9.4.9.9s-.4.9-.9.9h-2.1v1.1h2.1c.5 0 .9.4.9.9s-.4.9-.9.9h-3c-.5 0-.9-.4-.9-.9v-5.5c0-.5.4-.9.9-.9h3Z"
        fill="#06C755"
      />
    </svg>
  )
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useMemberPortalLang()
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch {
          /* ignore */
        }
      }}
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? t("copied") : label || t("copy")}
    </button>
  )
}

function MembershipCard({
  member,
  dashboard,
  qrDataUrl,
  showQr,
  onToggleQr,
}: {
  member: MemberSummary
  dashboard: PortalDashboard
  qrDataUrl: string
  showQr: boolean
  onToggleQr: () => void
}) {
  const { t } = useMemberPortalLang()
  const tier = tierVisual(dashboard.tierProgress.currentTierCode)
  const displayName = member.fullName || member.name || "Member"
  const cardShellClass = `relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${tier.gradient} p-5 ${tier.glow}`

  return (
    <div className="[perspective:1000px]">
      <div
        className={`relative min-h-[292px] transition-transform duration-500 ease-in-out will-change-transform [transform-style:preserve-3d] ${
          showQr ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        <div
          className={`${cardShellClass} absolute inset-0 [backface-visibility:hidden] [transform:rotateY(0deg)]`}
          aria-hidden={showQr}
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-6 h-32 w-32 rounded-full bg-black/20 blur-2xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">{t("membership")}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">{displayName}</h2>
              <p className="mt-1 text-sm text-white/65">{maskPhone(member.phone)}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${tier.chip}`}>
              {dashboard.tierProgress.currentTierName || tier.label}
            </span>
          </div>

          <div className="relative mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-black/20 px-4 py-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-wider text-white/50">{t("points")}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{formatPoints(member.pointBalance || 0)}</p>
            </div>
            <div className="rounded-2xl bg-black/20 px-4 py-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-wider text-white/50">{t("memberNoShort")}</p>
              <p className="mt-1 text-lg font-semibold tracking-wide text-white">{member.memberNo || `#${member.id}`}</p>
            </div>
          </div>

          <div className="relative mt-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-white/55">{t("scanAtCounter")}</p>
            </div>
            <button
              type="button"
              onClick={onToggleQr}
              disabled={!qrDataUrl}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-40"
              aria-label={t("showQr")}
              aria-pressed={false}
            >
              <QrCode className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className={`${cardShellClass} absolute inset-0 flex flex-col [backface-visibility:hidden] [transform:rotateY(180deg)]`}
          aria-hidden={!showQr}
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-6 h-32 w-32 rounded-full bg-black/20 blur-2xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">{t("scanAtCounter")}</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">{member.memberNo || `#${member.id}`}</h2>
            </div>
            <button
              type="button"
              onClick={onToggleQr}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
              aria-label={t("hideQr")}
              aria-pressed={true}
            >
              <QrCode className="h-5 w-5" />
            </button>
          </div>

          <div className="relative mt-4 flex flex-1 flex-col items-center justify-center">
            {qrDataUrl ? (
              <div className="flex w-full flex-col items-center rounded-2xl border border-white/10 bg-white p-4 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
                <img src={qrDataUrl} alt="Member QR" className="h-44 w-44 rounded-xl" />
                <p className="mt-3 text-center text-xs font-medium text-neutral-600">{member.memberNo || `M${member.id}`}</p>
              </div>
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-white/50" aria-hidden />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatTile({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-white/40">{sub}</p> : null}
    </div>
  )
}

function BottomNav({ tab, onChange }: { tab: PortalTab; onChange: (tab: PortalTab) => void }) {
  const { t } = useMemberPortalLang()
  const items: Array<{ id: PortalTab; label: string; icon: React.ElementType }> = [
    { id: "home", label: t("tabHome"), icon: Home },
    { id: "order", label: t("tabOrder"), icon: ShoppingCart },
    { id: "location", label: t("tabLocation"), icon: MapPin },
    { id: "privilege", label: t("tabPrivilege"), icon: Ticket },
    { id: "me", label: t("tabMe"), icon: UserRound },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0b0d]/95 backdrop-blur-xl">
      <div className="mx-auto grid max-w-lg grid-cols-5 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {items.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] transition ${
                active ? "text-amber-300" : "text-white/45 hover:text-white/70"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-amber-300" : ""}`} />
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function MemberPortalApp() {
  const brand = useAppBrandConfig()
  const { lang, t } = useMemberPortalLang()
  const dateLocale = memberPortalDateLocale(lang)
  const [member, setMember] = React.useState<MemberSummary | null>(null)
  const [dashboard, setDashboard] = React.useState<PortalDashboard | null>(null)
  const [phone, setPhone] = React.useState("")
  const [birthDate, setBirthDate] = React.useState("")
  const [tab, setTab] = React.useState<PortalTab>("home")
  const [signupName, setSignupName] = React.useState("")
  const [signupGender, setSignupGender] = React.useState<"" | "M" | "F">("")
  const [loading, setLoading] = React.useState(true)
  const [actionLoading, setActionLoading] = React.useState(false)
  const [authPanel, setAuthPanel] = React.useState<"signup" | "login" | null>(null)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const [lineLoginEnabled, setLineLoginEnabled] = React.useState(false)
  const [contactMenuOpen, setContactMenuOpen] = React.useState(false)
  const [contactUrls, setContactUrls] = React.useState<{
    facebookUrl: string
    instagramUrl: string
  }>({
    facebookUrl: brand.memberContactFacebookUrl,
    instagramUrl: brand.memberContactInstagramUrl,
  })
  const [designBackgrounds, setDesignBackgrounds] = React.useState<{
    loginBackgroundUrl: string
    appBackgroundUrl: string
  }>({
    loginBackgroundUrl: "",
    appBackgroundUrl: "",
  })
  const [points, setPoints] = React.useState<PortalPointRow[]>([])
  const [coupons, setCoupons] = React.useState<PortalCouponRow[]>([])
  const [visits, setVisits] = React.useState<PortalVisitRow[]>([])
  const [stores, setStores] = React.useState<MemberPortalStoreRow[]>([])
  const [contentItems, setContentItems] = React.useState<MemberPortalContentItem[]>([])
  const [locationSearch, setLocationSearch] = React.useState("")
  const [favoriteStoreCode, setFavoriteStoreCode] = React.useState("")
  const [showQr, setShowQr] = React.useState(false)
  const [qrDataUrl, setQrDataUrl] = React.useState("")
  const [profile, setProfile] = React.useState<PortalProfileForm>({
    name: "",
    birthDate: "",
    gender: "",
    nationality: "",
    email: "",
    referralCode: "",
    consentMarketing: false,
  })

  const applyLoggedInMember = React.useCallback((nextMember: MemberSummary) => {
    setMember(nextMember)
    setDashboard(buildFallbackDashboard(nextMember))
  }, [])

  const loadSession = React.useCallback(async () => {
    const me = await getJson<{ success: boolean; member?: MemberSummary }>("/api/member-portal/me")
    if (!me.success || !me.member) {
      setMember(null)
      setDashboard(null)
      return false
    }

    const [dashRes, pointsRes, couponsRes, visitsRes] = await Promise.all([
      getJson<{ success: boolean } & PortalDashboard>("/api/member-portal/me/dashboard"),
      getJson<{ success: boolean; rows?: PortalPointRow[] }>("/api/member-portal/me/points"),
      getJson<{ success: boolean; rows?: PortalCouponRow[] }>("/api/member-portal/me/coupons"),
      getJson<{ success: boolean; rows?: PortalVisitRow[] }>("/api/member-portal/me/visits"),
    ])

    const dashMember = dashRes.success && dashRes.member ? dashRes.member : me.member
    setMember(dashMember)
    if (dashRes.success && dashRes.member) {
      setDashboard({
        member: dashRes.member,
        referralCode: dashRes.referralCode,
        stats: dashRes.stats,
        tierProgress: dashRes.tierProgress,
      })
    } else {
      setDashboard(buildFallbackDashboard(dashMember))
    }
    setProfile((p) => ({
      ...p,
      name: dashMember.fullName || dashMember.name || "",
      birthDate: dashMember.birthDate || "",
      gender: dashMember.gender || "",
      nationality: dashMember.nationality || "",
      email: dashMember.email || "",
      referralCode: "",
      consentMarketing: Boolean(dashMember.consentMarketing),
    }))
    setPoints(pointsRes.rows || [])
    setCoupons(couponsRes.rows || [])
    setVisits(visitsRes.rows || [])
    return true
  }, [])

  React.useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        await loadSession()
      } finally {
        setLoading(false)
      }
    })()
    getJson<{ lineLoginEnabled?: boolean }>("/api/member-portal/auth/phone-birth")
      .then((r) => setLineLoginEnabled(Boolean(r.lineLoginEnabled)))
      .catch(() => {})
    getJson<{ success: boolean; stores?: MemberPortalStoreRow[] }>("/api/member-portal/stores")
      .then((r) => setStores(r.success ? r.stores || [] : []))
      .catch(() => setStores([]))
    getJson<{ success: boolean; items?: MemberPortalContentItem[] }>("/api/member-portal/content")
      .then((r) => setContentItems(r.success ? r.items || [] : []))
      .catch(() => setContentItems([]))
    getJson<{
      success: boolean
      facebookUrl?: string
      instagramUrl?: string
      loginBackgroundUrl?: string
      appBackgroundUrl?: string
    }>("/api/member-portal/public-config")
      .then((r) =>
        {
          setContactUrls({
            facebookUrl: String(r.facebookUrl || brand.memberContactFacebookUrl).trim(),
            instagramUrl: String(r.instagramUrl || brand.memberContactInstagramUrl).trim(),
          })
          setDesignBackgrounds({
            loginBackgroundUrl: String(r.loginBackgroundUrl || "").trim(),
            appBackgroundUrl: String(r.appBackgroundUrl || "").trim(),
          })
        }
      )
      .catch(() => {
        setContactUrls({
          facebookUrl: brand.memberContactFacebookUrl,
          instagramUrl: brand.memberContactInstagramUrl,
        })
        setDesignBackgrounds({
          loginBackgroundUrl: "",
          appBackgroundUrl: "",
        })
      })
    getJson<{ success: boolean; favoriteStoreCode?: string }>("/api/member-portal/preferences/favorite-store")
      .then((r) => {
        const code = String(r.favoriteStoreCode || "").trim()
        if (r.success && code) {
          setFavoriteStoreCode(code)
          try {
            localStorage.setItem("cm_member_favorite_store", code)
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {})
  }, [brand.memberContactFacebookUrl, brand.memberContactInstagramUrl, loadSession])

  React.useEffect(() => {
    try {
      setFavoriteStoreCode(localStorage.getItem("cm_member_favorite_store") || "")
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get("error")
    const lineFriend = params.get("line_friend")
    if (err) {
      setError(memberPortalLoginError(lang, err))
    }
    if (lineFriend === "added") {
      setNotice(t("lineFriendAdded"))
    } else if (lineFriend === "connected") {
      setNotice(t("lineFriendConnected"))
    }
    if (lineFriend) {
      void loadSession()
    }
    if (err || lineFriend) window.history.replaceState({}, "", "/m")
  }, [lang, loadSession, t])

  React.useEffect(() => {
    if (!member?.memberNo) return
    QRCode.toDataURL(member.memberNo, { width: 360, margin: 1, errorCorrectionLevel: "H" })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""))
  }, [member?.memberNo])

  const loginWithPhoneBirth = async () => {
    setActionLoading(true)
    setError("")
    try {
      const res = await postJson<{ success: boolean; message?: string; code?: string; member?: MemberSummary }>(
        "/api/member-portal/auth/phone-birth",
        {
          phone: normalizeMemberPhone(phone),
          birthDate,
          deviceLabel: "member-web",
        }
      )
      if (!res.success) {
        setError(res.code ? memberPortalLoginError(lang, res.code) : res.message || t("loginFailed"))
        return
      }
      if (res.member) applyLoggedInMember(res.member)
      const ok = await loadSession()
      if (!ok) setError(t("loginFailed"))
    } finally {
      setActionLoading(false)
    }
  }

  const signupWithPhoneBirth = async () => {
    setActionLoading(true)
    setError("")
    setNotice("")
    try {
      const res = await postJson<{
        success: boolean
        created?: boolean
        message?: string
        code?: string
        member?: MemberSummary
      }>("/api/member-portal/auth/signup", {
        name: signupName,
        phone: normalizeMemberPhone(phone),
        birthDate,
        gender: signupGender,
        deviceLabel: "member-web",
      })
      if (!res.success) {
        setError(res.code ? memberPortalLoginError(lang, res.code) : res.message || t("loginFailed"))
        return
      }
      setNotice(t(res.created ? "signup_success_created" : "signup_success_existing"))
      if (res.member) applyLoggedInMember(res.member)
      const ok = await loadSession()
      if (!ok) setError(t("loginFailed"))
    } finally {
      setActionLoading(false)
    }
  }

  const saveProfile = async () => {
    setActionLoading(true)
    setError("")
    try {
      const res = await postJson<{ success: boolean; message?: string; member?: MemberSummary }>(
        "/api/member-portal/register",
        profile
      )
      if (!res.success) {
        setError(res.message || t("saveFailed"))
        return
      }
      await loadSession()
    } finally {
      setActionLoading(false)
    }
  }

  const filteredStores = React.useMemo(() => {
    const q = locationSearch.trim().toLowerCase()
    if (!q) return stores
    return stores.filter((s) =>
      `${s.displayName} ${s.storeCode}`.toLowerCase().includes(q)
    )
  }, [locationSearch, stores])

  const homePopup = React.useMemo(
    () =>
      contentItems.find(
        (x) =>
          x.contentType === "popup" &&
          (!x.targetTab || x.targetTab === "home")
      ) || null,
    [contentItems]
  )

  const homeInfoItems = React.useMemo(
    () =>
      contentItems
        .filter((x) => x.contentType === "info" && (!x.targetTab || x.targetTab === "home"))
        .slice(0, 4),
    [contentItems]
  )

  const storePhotoMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const item of contentItems) {
      if (item.contentType !== "store_photo") continue
      const code = String(item.storeCode || "").trim()
      const imageUrl = String(item.imageUrl || "").trim()
      if (!code || !imageUrl || map.has(code)) continue
      map.set(code, imageUrl)
    }
    return map
  }, [contentItems])

  const logout = async () => {
    await postJson("/api/member-portal/auth/logout", {})
    setMember(null)
    setDashboard(null)
    setPoints([])
    setCoupons([])
    setVisits([])
    setTab("home")
    setPhone("")
    setBirthDate("")
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#08080a] text-white/70">
        <Loader2 className="h-8 w-8 animate-spin text-amber-300" />
      </div>
    )
  }

  if (!member) {
    const birthDateReady = /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
    const portalFieldClass =
      "h-12 rounded-2xl border-white/10 bg-white/[0.04] text-white shadow-inner shadow-black/20 placeholder:text-white/30 focus-visible:border-amber-400/50 focus-visible:ring-amber-400/20"
    const portalLabelClass = "text-[11px] font-medium uppercase tracking-[0.14em] text-white/45"

    return (
      <div
        className="relative min-h-[100dvh] overflow-hidden bg-[#08080a] text-white"
        style={
          designBackgrounds.loginBackgroundUrl
            ? {
                backgroundImage: `linear-gradient(rgba(8,8,10,0.82), rgba(8,8,10,0.92)), url(${designBackgrounds.loginBackgroundUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.14),transparent_42%)]" />
        <div className="pointer-events-none absolute -left-24 top-32 h-56 w-56 rounded-full bg-[#ef233c]/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-40 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative mx-auto flex min-h-[100dvh] max-w-lg flex-col px-5 pb-8 pt-6">
          <div className="mb-10 flex justify-end">
            <MemberPortalLangSelect />
          </div>

          <div className="mb-10 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 scale-110 rounded-[28px] bg-amber-400/20 blur-xl" />
              <div className="relative flex h-[88px] w-[88px] items-center justify-center rounded-[28px] border border-white/15 bg-white/[0.06] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm">
                <Image src={brand.logoSymbolSrc} alt={brand.logoAlt} width={64} height={64} className="h-16 w-16 object-contain" />
              </div>
            </div>
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-amber-200/70">{t("memberLounge")}</p>
            <h1 className="mt-2 bg-gradient-to-br from-white via-white to-white/70 bg-clip-text text-[2.35rem] font-bold leading-none tracking-tight text-transparent">
              {brand.headerWordmark}
            </h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/50">
              {t("loginSubtitle")}
            </p>
          </div>

          {!!notice && (
            <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {notice}
            </div>
          )}

          {!!error && (
            <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <div className="mb-4 flex items-center gap-2 text-white/70">
              <Sparkles className="h-4 w-4 text-amber-300/80" aria-hidden />
              <p className="text-sm font-medium tracking-wide">{t("lineLoginDesc")}</p>
            </div>

            <div className="space-y-3">
              <Button
                className="h-14 w-full rounded-2xl border-0 bg-[#06C755] text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(6,199,85,0.28)] transition hover:bg-[#05b34c] disabled:opacity-50"
                disabled={!lineLoginEnabled}
                onClick={() => {
                  window.location.href = "/api/member-portal/auth/line/start"
                }}
              >
                <span className="inline-flex items-center gap-3">
                  <LineLogo />
                  {lineLoginEnabled ? t("lineBtnWithLogo") : t("lineLoginPreparing")}
                </span>
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAuthPanel((prev) => (prev === "signup" ? null : "signup"))
                    setError("")
                  }}
                  className={`h-[50px] rounded-2xl px-3 text-sm font-semibold transition ${
                    authPanel === "signup"
                      ? "bg-gradient-to-br from-[#ef233c] to-[#c1121f] text-white shadow-[0_8px_24px_rgba(239,35,60,0.25)]"
                      : "border border-white/10 bg-white/[0.04] text-white/85 hover:bg-white/[0.07]"
                  }`}
                >
                  {t("signupBtn")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthPanel((prev) => (prev === "login" ? null : "login"))
                    setError("")
                  }}
                  className={`h-[50px] rounded-2xl px-3 text-sm font-semibold transition ${
                    authPanel === "login"
                      ? "border border-amber-400/40 bg-amber-400/10 text-amber-100"
                      : "border border-white/10 bg-white/[0.04] text-white/85 hover:bg-white/[0.07]"
                  }`}
                >
                  {t("loginBtn")}
                </button>
              </div>
            </div>

            {authPanel === "signup" ? (
              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="mb-4 text-sm font-medium text-white/80">{t("signupTitle")}</p>
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label className={portalLabelClass}>{t("signupNameLabel")}</Label>
                    <Input
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      placeholder={t("signupNameLabel")}
                      className={portalFieldClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={portalLabelClass}>{t("phoneLabel")}</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0812345678"
                      inputMode="tel"
                      className={portalFieldClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={portalLabelClass}>{t("birthDateLabel")}</Label>
                    <BirthDateFields value={birthDate} onChange={setBirthDate} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={portalLabelClass}>{t("genderLabel")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["M", "F"] as const).map((value) => {
                        const active = signupGender === value
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setSignupGender(value)}
                            className={`h-11 rounded-2xl border text-sm font-medium transition ${
                              active
                                ? "border-[#ef233c]/60 bg-[#ef233c]/90 text-white"
                                : "border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.07]"
                            }`}
                          >
                            {value === "M" ? t("genderMale") : t("genderFemale")}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <Button
                    onClick={signupWithPhoneBirth}
                    disabled={
                      actionLoading ||
                      !signupName.trim() ||
                      !normalizeMemberPhone(phone) ||
                      !birthDateReady ||
                      !signupGender
                    }
                    className="h-12 w-full rounded-2xl bg-gradient-to-r from-[#ef233c] to-[#d90429] text-base font-semibold text-white shadow-[0_8px_24px_rgba(239,35,60,0.22)] hover:from-[#d90429] hover:to-[#b9132a]"
                  >
                    {actionLoading ? t("signupChecking") : t("signupBtn")}
                  </Button>
                </div>
              </div>
            ) : null}

            {authPanel === "login" ? (
              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="mb-4 text-sm font-medium text-white/80">{t("phoneBirthTitle")}</p>
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label className={portalLabelClass}>{t("phoneLabel")}</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0812345678"
                      inputMode="tel"
                      className={portalFieldClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={portalLabelClass}>{t("birthDateLabel")}</Label>
                    <BirthDateFields value={birthDate} onChange={setBirthDate} />
                  </div>
                  <Button
                    onClick={loginWithPhoneBirth}
                    disabled={actionLoading || !normalizeMemberPhone(phone) || !birthDateReady}
                    className="h-12 w-full rounded-2xl border border-amber-400/30 bg-amber-400/10 text-base font-semibold text-amber-50 hover:bg-amber-400/15"
                  >
                    {actionLoading ? t("loginChecking") : t("loginBtn")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-auto pt-10 text-center">
            <button
              type="button"
              className="text-sm font-medium text-amber-200/90 transition hover:text-amber-100"
              onClick={() => {
                setContactMenuOpen(true)
              }}
            >
              {t("footerContactUs")}
            </button>
            <p className="mt-4 text-[11px] leading-relaxed text-white/40">
              {t("footerLegalIntro")}{" "}
              <button
                type="button"
                className="text-amber-200/80 underline underline-offset-2 hover:text-amber-100"
                onClick={() => {
                  window.location.href = "/m/terms"
                }}
              >
                {t("footerTerms")}
              </button>{" "}
              /{" "}
              <button
                type="button"
                className="text-amber-200/80 underline underline-offset-2 hover:text-amber-100"
                onClick={() => {
                  window.location.href = "/m/privacy"
                }}
              >
                {t("footerPrivacyPolicy")}
              </button>
              .
            </p>
          </div>

          {contactMenuOpen ? (
            <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm">
              <button
                type="button"
                className="absolute inset-0"
                aria-label="close contact menu"
                onClick={() => setContactMenuOpen(false)}
              />
              <div className="relative w-full rounded-t-[28px] border border-white/10 bg-[#121214] px-5 pb-8 pt-5 shadow-2xl">
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
                <p className="mb-4 text-center text-sm font-medium text-white/80">{t("contactMenuTitle")}</p>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    className="h-12 w-full rounded-2xl bg-[#1877F2] text-sm font-semibold text-white shadow-lg"
                    onClick={() => {
                      window.open(contactUrls.facebookUrl, "_blank")
                      setContactMenuOpen(false)
                    }}
                  >
                    {t("contactViaFacebook")}
                  </button>
                  <button
                    type="button"
                    className="h-12 w-full rounded-2xl bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-sm font-semibold text-white shadow-lg"
                    onClick={() => {
                      window.open(contactUrls.instagramUrl, "_blank")
                      setContactMenuOpen(false)
                    }}
                  >
                    {t("contactViaInstagram")}
                  </button>
                  <button
                    type="button"
                    className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-medium text-white/80"
                    onClick={() => setContactMenuOpen(false)}
                  >
                    {t("contactMenuClose")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const activeDashboard = dashboard ?? buildFallbackDashboard(member)

  const tier = tierVisual(activeDashboard.tierProgress.currentTierCode)

  return (
    <div
      className="min-h-[100dvh] bg-[#08080a] pb-24 text-white"
      style={
        designBackgrounds.appBackgroundUrl
          ? {
              backgroundImage: `linear-gradient(rgba(8,8,10,0.78), rgba(8,8,10,0.86)), url(${designBackgrounds.appBackgroundUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.10),transparent_40%)]" />

      <div className="relative mx-auto max-w-lg px-4 pb-6 pt-5">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-1.5">
              <Image src={brand.logoSymbolSrc} alt={brand.logoAlt} width={28} height={28} className="h-7 w-7 object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">{t("memberLounge")}</p>
              <p className="truncate font-medium">{member.fullName || member.name}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <MemberPortalLangSelect />
            <button
              type="button"
              onClick={logout}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70 transition hover:text-white"
              aria-label={t("logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {!!notice && (
          <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        )}

        {!!error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {tab === "home" && (
          <div className="space-y-4">
            <MembershipCard
              member={member}
              dashboard={activeDashboard}
              qrDataUrl={qrDataUrl}
              showQr={showQr}
              onToggleQr={() => setShowQr((v) => !v)}
            />

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("tierNext")}</p>
                  <p className="text-xs text-white/45">
                    {activeDashboard.tierProgress.nextTierName
                      ? t("tierProgress", {
                          amount: formatBaht(activeDashboard.tierProgress.amountToNext),
                          tier: activeDashboard.tierProgress.nextTierName,
                        })
                      : t("tierMax")}
                  </p>
                </div>
                <Award className={`h-5 w-5 ${tier.accent}`} />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all"
                  style={{ width: `${activeDashboard.tierProgress.progressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-white/45">
                {(activeDashboard.tierProgress.pointRate * 100).toFixed(1)}% · {activeDashboard.tierProgress.progressPercent}%
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={Wallet} label={t("statLifetime")} value={formatBaht(activeDashboard.stats.lifetimeAmount)} />
              <StatTile
                icon={History}
                label={t("statVisits")}
                value={`${activeDashboard.stats.visitCount}`}
                sub={`${t("statAvgTicket")} ${formatBaht(activeDashboard.stats.avgTicket)}`}
              />
              <StatTile icon={Ticket} label={t("statCoupons")} value={`${activeDashboard.stats.availableCoupons}`} />
              <StatTile icon={Gift} label={t("statPointsEarned")} value={formatPoints(activeDashboard.stats.pointsEarnedTotal)} />
            </div>

            {homePopup ? (
              <div className="rounded-3xl border border-fuchsia-300/25 bg-fuchsia-400/10 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-fuchsia-100">{homePopup.title || t("memberLounge")}</p>
                    {homePopup.body ? <p className="mt-1 text-xs text-fuchsia-50/85">{homePopup.body}</p> : null}
                  </div>
                  <Sparkles className="h-5 w-5 text-fuchsia-200" />
                </div>
                {homePopup.imageUrl ? (
                  <img
                    src={homePopup.imageUrl}
                    alt={homePopup.title || "popup"}
                    className="mt-3 h-32 w-full rounded-2xl object-cover"
                  />
                ) : null}
              </div>
            ) : null}

            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-400/10 to-transparent p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{t("referTitle")}</p>
                  <p className="mt-1 text-xs text-white/45">{t("referDesc")}</p>
                  <p className="mt-3 font-mono text-lg tracking-widest text-amber-200">{activeDashboard.referralCode}</p>
                </div>
                <Share2 className="h-5 w-5 text-amber-300/80" />
              </div>
              <div className="mt-4 flex gap-2">
                <CopyButton text={activeDashboard.referralCode} label={t("copyCode")} />
                <CopyButton
                  text={`Join Choongman Chicken membership with my code ${activeDashboard.referralCode}`}
                  label={t("shareText")}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setTab("privilege")}
              className="flex w-full items-center justify-between rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition hover:bg-white/[0.05]"
            >
              <div>
                <p className="font-medium">{t("recentPoints")}</p>
                <p className="text-xs text-white/45">
                  {points[0] ? formatDateTime(points[0].createdAt, dateLocale) : t("noRecords")}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-white/35" />
            </button>

            {homeInfoItems.length > 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <p className="mb-3 text-sm font-medium">업데이트</p>
                <div className="space-y-2">
                  {homeInfoItems.map((item) => (
                    <div key={item.contentKey} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                      <p className="text-sm text-white/90">{item.title || "안내"}</p>
                      {item.body ? <p className="mt-0.5 text-xs text-white/55">{item.body}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {tab === "order" && member ? (
          <MemberPortalOrderTab
            lang={lang}
            t={t}
            member={member}
            stores={stores}
            favoriteStoreCode={favoriteStoreCode}
          />
        ) : null}

        {tab === "location" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{t("locationTitle")}</h2>
              <p className="text-sm text-white/45">{t("locationDesc")}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-white/45" />
                <Input
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  placeholder={t("locationSearchPh")}
                  className="h-8 border-0 bg-transparent px-0 text-sm text-white placeholder:text-white/40 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="space-y-2">
              {filteredStores.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/20 bg-white/[0.03] px-5 py-14 text-center">
                  <MapPin className="mx-auto mb-3 h-7 w-7 text-amber-300/80" />
                  <p className="text-sm text-white/70">
                    {stores.length > 0 ? t("locationNoResult") : t("locationComing")}
                  </p>
                </div>
              ) : (
                filteredStores.map((s) => (
                  <div
                    key={s.storeCode}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                  >
                    {storePhotoMap.get(s.storeCode) ? (
                      <img
                        src={storePhotoMap.get(s.storeCode)}
                        alt={s.displayName}
                        className="mb-3 h-28 w-full rounded-xl object-cover"
                      />
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{s.displayName}</p>
                        <p className="text-xs text-white/45">
                          {t("locationCode")} · {s.storeCode}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const q = encodeURIComponent(s.mapQuery || s.displayName)
                          window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank")
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/85 hover:bg-white/10"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t("locationOpenMap")}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFavoriteStoreCode(s.storeCode)
                        try {
                          localStorage.setItem("cm_member_favorite_store", s.storeCode)
                        } catch {
                          /* ignore */
                        }
                        void postJson<{ success: boolean }>("/api/member-portal/preferences/favorite-store", {
                          storeCode: s.storeCode,
                        }).catch(() => {})
                        setNotice(t("locationFavoriteSaved"))
                      }}
                      className={`mt-2 inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                        favoriteStoreCode === s.storeCode
                          ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                          : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      <Star className={`h-3.5 w-3.5 ${favoriteStoreCode === s.storeCode ? "fill-current" : ""}`} />
                      {favoriteStoreCode === s.storeCode ? t("locationFavorite") : t("locationFavoriteSet")}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === "privilege" && (
          <div className="space-y-3">
            <div className="mb-1">
              <h2 className="text-lg font-semibold">{t("privilegeTitle")}</h2>
              <p className="text-sm text-white/45">{t("privilegeDesc")}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center">
                <p className="text-xs text-white/45">{t("statCoupons")}</p>
                <p className="mt-1 text-lg font-semibold">{activeDashboard.stats.availableCoupons}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center">
                <p className="text-xs text-white/45">{t("points")}</p>
                <p className="mt-1 text-lg font-semibold">{formatPoints(member.pointBalance || 0)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center">
                <p className="text-xs text-white/45">{t("statVisits")}</p>
                <p className="mt-1 text-lg font-semibold">{activeDashboard.stats.visitCount}</p>
              </div>
            </div>
            {coupons.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 px-5 py-12 text-center text-white/45">
                {t("noCoupons")}
              </div>
            ) : (
              coupons.map((c) => (
                <div
                  key={c.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-lg tracking-wide text-amber-200">{c.couponCode}</p>
                      <p className="mt-1 text-xs text-white/45">
                        {t("issuedAt")} {formatDateTime(c.issuedAt, dateLocale)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        c.status === "issued"
                          ? "bg-emerald-400/15 text-emerald-200"
                          : "bg-white/10 text-white/50"
                      }`}
                    >
                      {memberPortalCouponStatusLabel(lang, c.status)}
                    </span>
                  </div>
                  {c.status === "issued" ? (
                    <div className="mt-4">
                      <CopyButton text={c.couponCode} label={t("copyCode")} />
                    </div>
                  ) : null}
                </div>
              ))
            )}
            <div>
              <h2 className="text-lg font-semibold">{t("historyTitle")}</h2>
              <p className="text-sm text-white/45">{t("historySub")}</p>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium text-white/70">{t("recentOrders")}</h3>
              <div className="space-y-2">
                {visits.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 px-5 py-10 text-center text-white/45">
                    {t("noOrders")}
                  </div>
                ) : (
                  visits.map((v) => (
                    <div key={v.orderId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{formatBaht(v.total)}</p>
                          <p className="text-xs text-white/45">{v.storeCode || t("store")} · {v.orderNo || `#${v.orderId}`}</p>
                        </div>
                        <p className="text-xs text-white/45">{formatDateTime(v.visitedAt, dateLocale)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium text-white/70">{t("pointsHistory")}</h3>
              <div className="space-y-2">
                {points.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 px-5 py-10 text-center text-white/45">
                    {t("noPoints")}
                  </div>
                ) : (
                  points.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={`font-medium ${p.points >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {p.points >= 0 ? "+" : ""}
                            {formatPoints(p.points)}
                          </p>
                          <p className="text-xs text-white/45">
                            {memberPortalPointKindLabel(lang, p.kind)} · {p.note || "-"}
                          </p>
                        </div>
                        <p className="text-xs text-white/45">{formatDateTime(p.createdAt, dateLocale)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "me" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{t("profileTitle")}</h2>
              <p className="text-sm text-white/45">{t("profileSub")}</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("nameLabel")}</Label>
                  <Input
                    value={profile.name}
                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                    className="rounded-2xl border-white/10 bg-black/20 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("phoneLabel")}</Label>
                  <Input value={member.phone || ""} disabled className="rounded-2xl border-white/10 bg-black/10 text-white/60" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("birthDateLabel")}</Label>
                  <BirthDateFields
                    value={profile.birthDate}
                    onChange={(iso) => setProfile((p) => ({ ...p, birthDate: iso }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-white/70">{t("genderLabel")}</Label>
                    <Input
                      value={profile.gender}
                      onChange={(e) => setProfile((p) => ({ ...p, gender: e.target.value }))}
                      placeholder="M / F"
                      className="rounded-2xl border-white/10 bg-black/20 text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white/70">{t("nationalityLabel")}</Label>
                    <Input
                      value={profile.nationality}
                      onChange={(e) => setProfile((p) => ({ ...p, nationality: e.target.value }))}
                      placeholder="TH"
                      className="rounded-2xl border-white/10 bg-black/20 text-white"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("emailLabel")}</Label>
                  <Input
                    value={profile.email}
                    onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                    className="rounded-2xl border-white/10 bg-black/20 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("referralInputLabel")}</Label>
                  <Input
                    value={profile.referralCode}
                    onChange={(e) => setProfile((p) => ({ ...p, referralCode: e.target.value.toUpperCase() }))}
                    placeholder="CM123456"
                    className="rounded-2xl border-white/10 bg-black/20 text-white"
                  />
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={profile.consentMarketing}
                    onChange={(e) => setProfile((p) => ({ ...p, consentMarketing: e.target.checked }))}
                    className="h-4 w-4 accent-amber-400"
                  />
                  <span className="text-white/75">{t("consentMarketing")}</span>
                </label>
              </div>

              <Button
                onClick={saveProfile}
                disabled={actionLoading}
                className="mt-5 h-12 w-full rounded-2xl bg-amber-400 text-base font-medium text-black hover:bg-amber-300"
              >
                {actionLoading ? t("saving") : t("saveProfile")}
              </Button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/45">
              <p>{t("memberNo")} {member.memberNo}</p>
              <p className="mt-1">{t("joined")} {member.createdAt ? formatDateTime(member.createdAt, dateLocale) : "-"}</p>
              {member.lastVisitedAt ? (
                <p className="mt-1">{t("lastVisit")} {formatDateTime(member.lastVisitedAt, dateLocale)}</p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <BottomNav tab={tab} onChange={setTab} />
    </div>
  )
}

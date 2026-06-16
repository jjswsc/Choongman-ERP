"use client"

import * as React from "react"
import Image from "next/image"
import QRCode from "qrcode"
import {
  Copy,
  Gift,
  Home,
  Loader2,
  MapPin,
  Search,
  Share2,
  ShoppingCart,
  Sparkles,
  Ticket,
  UserRound,
} from "lucide-react"
import { useMemberPortalEmbedPreview } from "@/lib/member-portal-embed-preview"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BirthDateFields } from "@/components/member-portal/birth-date-fields"
import { MemberPortalNationalitySelect } from "@/components/member-portal/member-portal-nationality-select"
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
import { MemberPortalHomePromosAndMenus } from "@/components/member-portal/member-portal-home-monthly-promos"
import { MemberPortalStoreLocationCard } from "@/components/member-portal/member-portal-store-location-card"
import { MemberPwaInstallBanner } from "@/components/member-portal/member-pwa-install-banner"
import { MemberPortalMembershipCard } from "@/components/member-portal/member-portal-membership-card"
import { MemberPortalCouponQrButton } from "@/components/member-portal/member-portal-coupon-qr-sheet"
import {
  MemberPortalTierBenefitsSheet,
  MemberPortalTierEntryButton,
  useMemberPortalTiers,
} from "@/components/member-portal/member-portal-tier-guide"
import { MemberPortalProfileContactLinks, MemberPortalContactChannelButtons } from "@/components/member-portal/member-portal-contact-links"
import { MemberPortalLoungeBackdrop } from "@/components/member-portal/member-portal-lounge-backdrop"
import {
  MemberPortalStampCard,
  MemberPortalStampHomeWidget,
  useMemberPortalStampStatus,
} from "@/components/member-portal/member-portal-stamp-card"
import {
  GlassCard,
  MemberPortalAmbienceBackground,
  MemberPortalContentSheet,
  MemberPortalBenefitStatsGrid,
  MemberPortalShell,
  PremiumAppHeader,
  PremiumBottomNav,
  SectionTitle,
} from "@/components/member-portal/member-portal-premium-ui"
import {
  buildFallbackDashboard,
  formatBaht,
  formatDateTime,
  formatPoints,
  memberToProfileForm,
  tierVisual,
  type PortalCouponRow,
  type PortalDashboard,
  type PortalPointRow,
  type PortalProfileForm,
  type PortalTab,
  type PortalVisitRow,
} from "@/components/member-portal/portal-ui"
import { clearMemberPortalMemberLocalData, readFavoriteStoreCodesFromLocalStorage, writeFavoriteStoreCodesToLocalStorage } from "@/lib/member-portal-client-storage"
import { sortStoresWithFavoritesFirst, toggleFavoriteStoreCode } from "@/lib/member-portal-favorite-stores"
import { mpInputClass, mpPrimaryBtn } from "@/lib/member-portal-design"
import { memberPortalStoreMatchesQuery, type MemberPortalStoreDto } from "@/lib/member-portal-stores"

type MemberPortalStoreRow = MemberPortalStoreDto

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
      className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-700 shadow-sm transition hover:bg-stone-50"
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

export function MemberPortalApp() {
  const brand = useAppBrandConfig()
  const {
    isEmbedPreview: embedPreview,
    previewLoginBackgroundUrl,
    previewAppBackgroundUrl,
  } = useMemberPortalEmbedPreview()
  const { lang, t } = useMemberPortalLang()
  const { tiers: portalTiers } = useMemberPortalTiers()
  const dateLocale = memberPortalDateLocale(lang)
  const [member, setMember] = React.useState<MemberSummary | null>(null)
  const {
    status: stampStatus,
    loading: stampLoading,
    reload: reloadStampStatus,
  } = useMemberPortalStampStatus(lang, Boolean(member))
  const [dashboard, setDashboard] = React.useState<PortalDashboard | null>(null)
  const [phone, setPhone] = React.useState("")
  const [birthDate, setBirthDate] = React.useState("")
  const [tab, setTab] = React.useState<PortalTab>("home")
  const [, startTabTransition] = React.useTransition()
  const changeTab = React.useCallback(
    (next: PortalTab) => {
      if (next === tab) return
      requestAnimationFrame(() => {
        startTabTransition(() => setTab(next))
      })
    },
    [tab]
  )
  const [signupName, setSignupName] = React.useState("")
  const [signupGender, setSignupGender] = React.useState<"" | "M" | "F">("")
  const [signupStoreCode, setSignupStoreCode] = React.useState("")
  const [signupStoreOptions, setSignupStoreOptions] = React.useState<
    Array<{ storeCode: string; displayName: string }>
  >([])
  const [signupOfficeStoreCode, setSignupOfficeStoreCode] = React.useState("office")
  const [signupConsentMarketing, setSignupConsentMarketing] = React.useState(true)
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
    lineOfficialUrl: string
  }>({
    facebookUrl: brand.memberContactFacebookUrl,
    instagramUrl: brand.memberContactInstagramUrl,
    lineOfficialUrl: brand.memberContactLineOfficialUrl,
  })
  const [designBackgrounds, setDesignBackgrounds] = React.useState<{
    loginBackgroundUrl: string
    appBackgroundUrl: string
    heroFoodImageUrl: string
  }>({
    loginBackgroundUrl: "",
    appBackgroundUrl: "",
    heroFoodImageUrl: "",
  })
  const [signupWelcomeCouponEnabled, setSignupWelcomeCouponEnabled] = React.useState(false)
  const [points, setPoints] = React.useState<PortalPointRow[]>([])
  const [coupons, setCoupons] = React.useState<PortalCouponRow[]>([])
  const [visits, setVisits] = React.useState<PortalVisitRow[]>([])
  const [stores, setStores] = React.useState<MemberPortalStoreRow[]>([])
  const [contentItems, setContentItems] = React.useState<MemberPortalContentItem[]>([])
  const [locationSearch, setLocationSearch] = React.useState("")
  const [favoriteStoreCodes, setFavoriteStoreCodes] = React.useState<string[]>([])
  const [showQr, setShowQr] = React.useState(false)
  const [homePromoOpen, setHomePromoOpen] = React.useState(false)
  const [tierBenefitsOpen, setTierBenefitsOpen] = React.useState(false)
  const [selectedHomePromo, setSelectedHomePromo] = React.useState<MemberPortalContentItem | null>(null)
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
    setProfile(memberToProfileForm(nextMember))
  }, [])

  const loadMemberContent = React.useCallback(async () => {
    try {
      const r = await getJson<{ success: boolean; items?: MemberPortalContentItem[] }>("/api/member-portal/content")
      setContentItems(r.success ? r.items || [] : [])
    } catch {
      setContentItems([])
    }
  }, [])

  const loadMemberStores = React.useCallback(async () => {
    try {
      const r = await getJson<{ success: boolean; stores?: MemberPortalStoreRow[] }>("/api/member-portal/stores")
      setStores(r.success ? r.stores || [] : [])
    } catch {
      setStores([])
    }
  }, [])

  const loadFavoriteStorePreference = React.useCallback(async () => {
    try {
      const r = await getJson<{ success: boolean; favoriteStoreCodes?: string[]; favoriteStoreCode?: string }>(
        "/api/member-portal/preferences/favorite-store"
      )
      const serverCodes = Array.isArray(r.favoriteStoreCodes)
        ? r.favoriteStoreCodes.map((code) => String(code || "").trim()).filter(Boolean)
        : String(r.favoriteStoreCode || "").trim()
          ? [String(r.favoriteStoreCode || "").trim()]
          : []
      if (r.success) {
        const localCodes = readFavoriteStoreCodesFromLocalStorage()
        const codes = serverCodes.length > 0 ? serverCodes : localCodes
        setFavoriteStoreCodes(codes)
        writeFavoriteStoreCodesToLocalStorage(codes)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const loadSession = React.useCallback(async () => {
    const me = await getJson<{ success: boolean; member?: MemberSummary }>("/api/member-portal/me")
    if (!me.success || !me.member) {
      setMember(null)
      setDashboard(null)
      setFavoriteStoreCodes(readFavoriteStoreCodesFromLocalStorage())
      setStores([])
      setContentItems([])
      return false
    }

    const [dashRes, pointsRes, couponsRes, visitsRes] = await Promise.all([
      getJson<{ success: boolean } & PortalDashboard>("/api/member-portal/me/dashboard"),
      getJson<{ success: boolean; rows?: PortalPointRow[] }>("/api/member-portal/me/points"),
      getJson<{ success: boolean; rows?: PortalCouponRow[] }>("/api/member-portal/me/coupons"),
      getJson<{ success: boolean; rows?: PortalVisitRow[] }>("/api/member-portal/me/visits"),
      loadMemberStores(),
      loadFavoriteStorePreference(),
      loadMemberContent(),
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
    setProfile(memberToProfileForm(dashMember))
    setPoints(pointsRes.rows || [])
    setCoupons(couponsRes.rows || [])
    setVisits(visitsRes.rows || [])
    void reloadStampStatus()
    return true
  }, [loadFavoriteStorePreference, loadMemberContent, loadMemberStores, reloadStampStatus])

  React.useLayoutEffect(() => {
    if (!embedPreview) return
    setDesignBackgrounds((prev) => ({
      ...prev,
      loginBackgroundUrl: previewLoginBackgroundUrl || prev.loginBackgroundUrl,
      appBackgroundUrl: previewAppBackgroundUrl || prev.appBackgroundUrl,
    }))
    setLoading(false)
  }, [embedPreview, previewAppBackgroundUrl, previewLoginBackgroundUrl])

  React.useEffect(() => {
    if (embedPreview) {
      getJson<{
        success: boolean
        facebookUrl?: string
        instagramUrl?: string
        lineOfficialUrl?: string
        loginBackgroundUrl?: string
        appBackgroundUrl?: string
        heroFoodImageUrl?: string
        signupWelcomeCouponEnabled?: boolean
      }>("/api/member-portal/public-config")
        .then((r) => {
          setContactUrls({
            facebookUrl: String(r.facebookUrl || brand.memberContactFacebookUrl).trim(),
            instagramUrl: String(r.instagramUrl || brand.memberContactInstagramUrl).trim(),
            lineOfficialUrl: String(r.lineOfficialUrl || brand.memberContactLineOfficialUrl).trim(),
          })
          setDesignBackgrounds({
            loginBackgroundUrl:
              previewLoginBackgroundUrl || String(r.loginBackgroundUrl || "").trim(),
            appBackgroundUrl: previewAppBackgroundUrl || String(r.appBackgroundUrl || "").trim(),
            heroFoodImageUrl: String(r.heroFoodImageUrl || "").trim(),
          })
          setSignupWelcomeCouponEnabled(Boolean(r.signupWelcomeCouponEnabled))
        })
        .catch(() => {
          setContactUrls({
            facebookUrl: brand.memberContactFacebookUrl,
            instagramUrl: brand.memberContactInstagramUrl,
            lineOfficialUrl: brand.memberContactLineOfficialUrl,
          })
        })
      return
    }

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
    getJson<{
      success: boolean
      facebookUrl?: string
      instagramUrl?: string
      lineOfficialUrl?: string
      loginBackgroundUrl?: string
      appBackgroundUrl?: string
      heroFoodImageUrl?: string
      signupWelcomeCouponEnabled?: boolean
    }>("/api/member-portal/public-config")
      .then((r) => {
        setContactUrls({
          facebookUrl: String(r.facebookUrl || brand.memberContactFacebookUrl).trim(),
          instagramUrl: String(r.instagramUrl || brand.memberContactInstagramUrl).trim(),
          lineOfficialUrl: String(r.lineOfficialUrl || brand.memberContactLineOfficialUrl).trim(),
        })
        setDesignBackgrounds({
          loginBackgroundUrl: String(r.loginBackgroundUrl || "").trim(),
          appBackgroundUrl: String(r.appBackgroundUrl || "").trim(),
          heroFoodImageUrl: String(r.heroFoodImageUrl || "").trim(),
        })
        setSignupWelcomeCouponEnabled(Boolean(r.signupWelcomeCouponEnabled))
      })
      .catch(() => {
        setContactUrls({
          facebookUrl: brand.memberContactFacebookUrl,
          instagramUrl: brand.memberContactInstagramUrl,
          lineOfficialUrl: brand.memberContactLineOfficialUrl,
        })
        setDesignBackgrounds({
          loginBackgroundUrl: "",
          appBackgroundUrl: "",
          heroFoodImageUrl: "",
        })
      })
    getJson<{
      success: boolean
      officeStoreCode?: string
      stores?: Array<{ storeCode: string; displayName: string }>
    }>("/api/member-portal/signup-stores?lang=" + encodeURIComponent(lang))
      .then((r) => {
        if (!r.success) return
        setSignupOfficeStoreCode(String(r.officeStoreCode || "office"))
        setSignupStoreOptions(Array.isArray(r.stores) ? r.stores : [])
      })
      .catch(() => {})
  }, [
    brand.memberContactFacebookUrl,
    brand.memberContactInstagramUrl,
    brand.memberContactLineOfficialUrl,
    embedPreview,
    lang,
    loadSession,
    previewAppBackgroundUrl,
    previewLoginBackgroundUrl,
  ])

  React.useEffect(() => {
    setFavoriteStoreCodes(readFavoriteStoreCodesFromLocalStorage())
  }, [])

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get("error")
    const lineFriend = params.get("line_friend")
    if (err) {
      setError(memberPortalLoginError(lang, err))
      if (err === "missing_store" || err === "invalid_store") {
        setAuthPanel("signup")
      }
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
        welcomeCouponIssued?: boolean
        message?: string
        code?: string
        member?: MemberSummary
      }>("/api/member-portal/auth/signup", {
        name: signupName,
        phone: normalizeMemberPhone(phone),
        birthDate,
        gender: signupGender,
        joinStoreCode: signupStoreCode,
        consentMarketing: signupConsentMarketing,
        deviceLabel: "member-web",
      })
      if (!res.success) {
        setError(res.code ? memberPortalLoginError(lang, res.code) : res.message || t("loginFailed"))
        return
      }
      if (res.created && res.welcomeCouponIssued) {
        setNotice(t("signup_success_created_with_coupon"))
      } else {
        setNotice(t(res.created ? "signup_success_created" : "signup_success_existing"))
      }
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
    const matched = stores.filter((s) => memberPortalStoreMatchesQuery(s, locationSearch))
    return sortStoresWithFavoritesFirst(matched, favoriteStoreCodes)
  }, [locationSearch, stores, favoriteStoreCodes])

  const toggleFavoriteStore = React.useCallback(
    (storeCode: string) => {
      const wasFavorite = favoriteStoreCodes.includes(storeCode)
      const optimistic = toggleFavoriteStoreCode(favoriteStoreCodes, storeCode)
      setFavoriteStoreCodes(optimistic)
      writeFavoriteStoreCodesToLocalStorage(optimistic)
      setNotice(t(wasFavorite ? "locationFavoriteRemoved" : "locationFavoriteSaved"))
      void postJson<{ success: boolean; favoriteStoreCodes?: string[] }>(
        "/api/member-portal/preferences/favorite-store",
        { storeCode, action: "toggle" }
      )
        .then((r) => {
          if (!r.success || !Array.isArray(r.favoriteStoreCodes)) return
          setFavoriteStoreCodes(r.favoriteStoreCodes)
          writeFavoriteStoreCodesToLocalStorage(r.favoriteStoreCodes)
        })
        .catch(() => {})
    },
    [favoriteStoreCodes, t]
  )

  React.useEffect(() => {
    if (!member?.id) return
    setProfile(memberToProfileForm(member))
  }, [member?.id])

  React.useEffect(() => {
    if (tab !== "location" || !member) return
    if (stores.length === 0) void loadMemberStores()
  }, [tab, member, stores.length, loadMemberStores])

  React.useEffect(() => {
    if (tab !== "privilege" || !member) return
    let cancelled = false
    ;(async () => {
      try {
        const [couponsRes, dashRes] = await Promise.all([
          getJson<{ success: boolean; rows?: PortalCouponRow[] }>("/api/member-portal/me/coupons"),
          getJson<{ success: boolean } & PortalDashboard>("/api/member-portal/me/dashboard"),
        ])
        if (cancelled) return
        if (couponsRes.success) setCoupons(couponsRes.rows || [])
        if (dashRes.success && dashRes.member) {
          setDashboard({
            member: dashRes.member,
            referralCode: dashRes.referralCode,
            stats: dashRes.stats,
            tierProgress: dashRes.tierProgress,
          })
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, member])

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
        .filter(
          (x) =>
            x.contentType === "info" &&
            x.targetTab !== "home_feature" &&
            x.targetTab !== "home_promo" &&
            (!x.targetTab || x.targetTab === "home")
        )
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
    clearMemberPortalMemberLocalData()
    setMember(null)
    setDashboard(null)
    setPoints([])
    setCoupons([])
    setVisits([])
    setStores([])
    setFavoriteStoreCodes([])
    setShowQr(false)
    setTab("home")
    setPhone("")
    setBirthDate("")
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#faf7f2] text-stone-500">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  if (!member) {
    const birthDateReady = /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
    const portalFieldClass =
      "h-12 rounded-2xl border-stone-200 bg-white text-stone-900 shadow-sm placeholder:text-stone-400 focus-visible:border-amber-500/50 focus-visible:ring-amber-400/20"
    const portalLabelClass = "text-[11px] font-medium uppercase tracking-[0.14em] text-stone-500"

    return (
      <div className={`relative bg-[#faf7f2] text-stone-900 ${embedPreview ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh] overflow-x-hidden"}`}>
        <MemberPortalLoungeBackdrop
          customFullBackgroundUrl={designBackgrounds.loginBackgroundUrl}
          heroFoodImageUrl={designBackgrounds.heroFoodImageUrl}
          variant="login"
        />
        <div className="pointer-events-none absolute -left-24 top-32 h-56 w-56 rounded-full bg-[#ef233c]/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-40 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative mx-auto flex min-h-[100dvh] max-w-lg flex-col px-5 pb-8 pt-6">
          <div className="mb-10 flex justify-end">
            <MemberPortalLangSelect />
          </div>

          <div className="mb-10 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 scale-110 rounded-[28px] bg-amber-400/20 blur-xl" />
              <div className="relative flex h-[88px] w-[88px] items-center justify-center rounded-[28px] border border-stone-200 bg-white p-3 shadow-md">
                <Image src={brand.logoSymbolSrc} alt={brand.logoAlt} width={64} height={64} className="h-16 w-16 object-contain" />
              </div>
            </div>
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-amber-700/80">{t("memberLounge")}</p>
            <h1 className="mt-2 bg-gradient-to-br from-stone-900 via-stone-800 to-stone-600 bg-clip-text text-[2.35rem] font-bold leading-none tracking-tight text-transparent">
              {brand.headerWordmark}
            </h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-stone-500">
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

          <div className="mb-4">
            <MemberPwaInstallBanner />
          </div>

          <div className="rounded-[28px] border border-stone-200/80 bg-white/95 p-5 shadow-[0_12px_40px_rgba(28,21,16,0.08)]">
            <div className="mb-4 flex items-center gap-2 text-stone-600">
              <Sparkles className="h-4 w-4 text-amber-600" aria-hidden />
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
                      : "border border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100"
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
                      : "border border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100"
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
                    <Label className={portalLabelClass}>{t("signupStoreLabel")}</Label>
                    <select
                      value={signupStoreCode}
                      onChange={(e) => setSignupStoreCode(e.target.value)}
                      className={`${portalFieldClass} w-full px-3 text-sm`}
                    >
                      <option value="" className="bg-[#141418] text-white/70">
                        {t("signupStorePlaceholder")}
                      </option>
                      <option value={signupOfficeStoreCode} className="bg-[#141418] text-white">
                        {t("signupStoreOffice")}
                      </option>
                      {signupStoreOptions.map((store) => (
                        <option key={store.storeCode} value={store.storeCode} className="bg-[#141418] text-white">
                          {store.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
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
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm transition ${
                      signupConsentMarketing
                        ? "border-amber-400/35 bg-amber-400/[0.08]"
                        : "border-white/10 bg-black/25"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={signupConsentMarketing}
                      onChange={(e) => setSignupConsentMarketing(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-medium text-white/90">
                        <Gift className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
                        {t("consentMarketing")}
                      </span>
                      {signupWelcomeCouponEnabled ? (
                        <span className="mt-1 block text-xs leading-relaxed text-amber-100/75">
                          {signupConsentMarketing ? t("consentMarketingSignupHint") : t("consentMarketingCouponHint")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                  <Button
                    onClick={signupWithPhoneBirth}
                    disabled={
                      actionLoading ||
                      !signupName.trim() ||
                      !normalizeMemberPhone(phone) ||
                      !birthDateReady ||
                      !signupGender ||
                      !signupStoreCode
                    }
                    className="h-12 w-full rounded-2xl bg-gradient-to-r from-[#ef233c] to-[#d90429] text-base font-semibold text-white shadow-[0_8px_24px_rgba(239,35,60,0.22)] hover:from-[#d90429] hover:to-[#b9132a]"
                  >
                    {actionLoading ? t("signupChecking") : t("signupBtn")}
                  </Button>
                  {lineLoginEnabled ? (
                    <Button
                      type="button"
                      className="h-12 w-full rounded-2xl border-0 bg-[#06C755] text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(6,199,85,0.28)] transition hover:bg-[#05b34c] disabled:opacity-50"
                      disabled={!signupStoreCode}
                      onClick={() => {
                        window.location.href = `/api/member-portal/auth/line/start?joinStore=${encodeURIComponent(signupStoreCode)}`
                      }}
                    >
                      <span className="inline-flex items-center justify-center gap-3">
                        <LineLogo className="h-8 w-8" />
                        {t("lineBtnWithLogo")}
                      </span>
                    </Button>
                  ) : null}
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

          {portalTiers.length > 0 ? (
            <div className="mt-8">
              <MemberPortalTierEntryButton
                title={t("tierBenefitsTitle")}
                description={t("tierBenefitsDesc")}
                onClick={() => setTierBenefitsOpen(true)}
              />
            </div>
          ) : null}

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
                <MemberPortalContactChannelButtons
                  urls={contactUrls}
                  onChannelClick={() => setContactMenuOpen(false)}
                />
                <button
                  type="button"
                  className="mt-2.5 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-medium text-white/80"
                  onClick={() => setContactMenuOpen(false)}
                >
                  {t("contactMenuClose")}
                </button>
              </div>
            </div>
          ) : null}

          <MemberPortalTierBenefitsSheet
            open={tierBenefitsOpen}
            tiers={portalTiers}
            closeLabel={t("contactMenuClose")}
            onClose={() => setTierBenefitsOpen(false)}
          />
        </div>
      </div>
    )
  }

  const activeDashboard = dashboard ?? buildFallbackDashboard(member)
  const tier = tierVisual(activeDashboard.tierProgress.currentTierCode)
  const navItems = [
    { id: "home" as const, label: t("tabHome"), icon: Home },
    { id: "order" as const, label: t("tabOrder"), icon: ShoppingCart },
    { id: "location" as const, label: t("tabLocation"), icon: MapPin },
    { id: "privilege" as const, label: t("tabPrivilege"), icon: Ticket },
    { id: "me" as const, label: t("tabMe"), icon: UserRound },
  ]

  const couponBenefitText = (coupon: PortalCouponRow): string => {
    const discountType = String(coupon.discountType || "fixed").toLowerCase()
    const discountValue = Number(coupon.discountValue || 0)
    const maxDiscountAmt = Number(coupon.maxDiscountAmt || 0)
    if (discountType === "bogo") return "1+1"
    if (discountType === "set_fixed") return `Set ฿${Math.round(discountValue)}`
    if (discountType === "item_fixed") return `฿${Math.round(discountValue)} / item`
    if (discountType === "percent") {
      if (maxDiscountAmt > 0) return `${discountValue}% (max ฿${Math.round(maxDiscountAmt)})`
      return `${discountValue}%`
    }
    return `฿${Math.round(discountValue)}`
  }

  const couponStackRuleText = (coupon: PortalCouponRow): string => {
    const mode = String(coupon.stackMode || "fixed_only")
    if (mode === "any") return "any"
    if (mode === "percent_only") return "percent_only"
    return "fixed_only"
  }

  return (
    <MemberPortalAmbienceBackground
      imageUrl={designBackgrounds.appBackgroundUrl}
      heroFoodImageUrl={designBackgrounds.heroFoodImageUrl}
      className={embedPreview ? "h-[100dvh] overflow-hidden" : undefined}
    >
      <MemberPortalShell embedPreview={embedPreview}>
        <PremiumAppHeader
          wordmark={t("memberLounge")}
          displayName={member.fullName || member.name || "Member"}
          tierLabel={activeDashboard.tierProgress.currentTierName || tier.label}
          logoSrc={brand.logoSymbolSrc}
          logoAlt={brand.logoAlt}
          langSelect={<MemberPortalLangSelect />}
          onLogout={logout}
          logoutLabel={t("logout")}
        />

        {!!notice && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        )}

        {!!error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mb-4">
          <MemberPwaInstallBanner />
        </div>

        {tab === "home" && (
          <div className="space-y-4">
            <MemberPortalMembershipCard
              member={member}
              dashboard={activeDashboard}
              qrDataUrl={qrDataUrl}
              showQr={showQr}
              onToggleQr={() => setShowQr((v) => !v)}
              tierProgress={{
                subtitle:
                  activeDashboard.tierProgress.nextTierName
                    ? activeDashboard.tierProgress.upgradeBasis === "points"
                      ? t("tierProgressPoints", {
                          amount: formatPoints(activeDashboard.tierProgress.amountToNext),
                          tier: activeDashboard.tierProgress.nextTierName,
                        })
                      : t("tierProgress", {
                          amount: formatBaht(activeDashboard.tierProgress.amountToNext),
                          tier: activeDashboard.tierProgress.nextTierName,
                        })
                    : t("tierMax"),
                progressPercent: activeDashboard.tierProgress.progressPercent,
                pointRateLabel: `${(activeDashboard.tierProgress.pointRate * 100).toFixed(1)}% · ${activeDashboard.tierProgress.progressPercent}%`,
                actionLabel: portalTiers.length > 0 ? t("tierBenefitsViewBtn") : undefined,
                onAction: portalTiers.length > 0 ? () => setTierBenefitsOpen(true) : undefined,
              }}
            />

            <MemberPortalStampHomeWidget
              lang={lang}
              status={stampStatus}
              loading={stampLoading}
              onOpenPrivilege={() => changeTab("privilege")}
            />

            <MemberPortalHomePromosAndMenus
              contentItems={contentItems}
              lang={lang}
              t={t}
              onSelectItem={(item) => {
                setSelectedHomePromo(item)
                setHomePromoOpen(true)
              }}
            />

            {homePopup ? (
              <GlassCard className="border-fuchsia-300/20 bg-fuchsia-500/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-fuchsia-100">{homePopup.title || t("memberLounge")}</p>
                    {homePopup.body ? <p className="mt-1 text-xs leading-relaxed text-fuchsia-50/85">{homePopup.body}</p> : null}
                  </div>
                  <Sparkles className="h-5 w-5 shrink-0 text-fuchsia-200" />
                </div>
                {homePopup.imageUrl ? (
                  <img src={homePopup.imageUrl} alt={homePopup.title || "popup"} className="mt-3 h-36 w-full rounded-2xl object-cover" />
                ) : null}
              </GlassCard>
            ) : null}

            <GlassCard className="border-amber-200/80 bg-gradient-to-br from-amber-50 to-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{t("referTitle")}</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-500">{t("referDesc")}</p>
                  <p className="mt-3 font-mono text-xl tracking-[0.2em] text-amber-700">{activeDashboard.referralCode}</p>
                </div>
                <Share2 className="h-5 w-5 shrink-0 text-amber-600" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <CopyButton text={activeDashboard.referralCode} label={t("copyCode")} />
                <CopyButton
                  text={`Join Choongman Chicken membership with my code ${activeDashboard.referralCode}`}
                  label={t("shareText")}
                />
              </div>
            </GlassCard>

            {homeInfoItems.length > 0 ? (
              <GlassCard soft>
                <p className="mb-3 text-sm font-semibold">Updates</p>
                <div className="space-y-2">
                  {homeInfoItems.map((item) => (
                    <div key={item.contentKey} className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                      <p className="text-sm text-white/90">{item.title || "—"}</p>
                      {item.body ? <p className="mt-0.5 text-xs leading-relaxed text-white/55">{item.body}</p> : null}
                    </div>
                  ))}
                </div>
              </GlassCard>
            ) : null}
          </div>
        )}

        {tab === "order" && member ? (
          <MemberPortalOrderTab
            lang={lang}
            t={t}
            member={member}
            stores={stores}
            favoriteStoreCodes={favoriteStoreCodes}
          />
        ) : null}

        {tab === "location" && (
          <div className="space-y-4">
            <SectionTitle title={t("locationTitle")} subtitle={t("locationDesc")} />
            <GlassCard soft className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-white/45" />
                <Input
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  placeholder={t("locationSearchPh")}
                  className="h-9 border-0 bg-transparent px-0 text-sm text-white placeholder:text-white/40 focus-visible:ring-0"
                />
              </div>
            </GlassCard>
            <div className="space-y-3">
              {filteredStores.length === 0 ? (
                <GlassCard soft className="px-5 py-14 text-center">
                  <MapPin className="mx-auto mb-3 h-7 w-7 text-amber-300/80" />
                  <p className="text-sm text-white/70">
                    {stores.length === 0 ? t("locationEmpty") : t("locationNoResult")}
                  </p>
                </GlassCard>
              ) : (
                filteredStores.map((s) => (
                  <MemberPortalStoreLocationCard
                    key={s.storeCode}
                    store={s}
                    photoUrl={s.photoUrl || storePhotoMap.get(s.storeCode) || ""}
                    isFavorite={favoriteStoreCodes.includes(s.storeCode)}
                    onToggleFavorite={() => toggleFavoriteStore(s.storeCode)}
                    t={t}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {tab === "privilege" && (
          <div className="space-y-3">
            <SectionTitle title={t("privilegeTitle")} subtitle={t("privilegeDesc")} />
            <p className="-mt-1 text-xs text-white/40">
              {t("memberNo")} {member.memberNo}
            </p>
            <MemberPortalBenefitStatsGrid
              couponsLabel={t("statCoupons")}
              couponsValue={`${activeDashboard.stats.availableCoupons}`}
              pointsLabel={t("points")}
              pointsValue={formatPoints(member.pointBalance || 0)}
              visitsLabel={t("statVisits")}
              visitsValue={`${activeDashboard.stats.visitCount}`}
            />
            <MemberPortalStampCard
              lang={lang}
              memberId={member.id}
              status={stampStatus}
              loading={stampLoading}
              onGoCoupons={() => changeTab("privilege")}
            />
            {portalTiers.length > 0 ? (
              <MemberPortalTierEntryButton
                title={t("tierBenefitsTitle")}
                description={t("tierBenefitsDesc")}
                onClick={() => setTierBenefitsOpen(true)}
              />
            ) : null}
            {coupons.length === 0 ? (
              <GlassCard soft className="px-5 py-12 text-center text-white/45">
                {t("noCoupons")}
              </GlassCard>
            ) : (
              coupons.map((c) => (
                <GlassCard key={c.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-lg tracking-wide text-amber-200">{c.couponCode}</p>
                      {c.couponName && c.couponName !== c.couponCode ? (
                        <p className="mt-0.5 text-xs text-white/60">{c.couponName}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-white/45">
                        {t("issuedAt")} {formatDateTime(c.issuedAt, dateLocale)}
                      </p>
                      {c.expiresAt || c.validTo ? (
                        <p className="mt-0.5 text-xs text-white/45">
                          {t("couponExpiresAt")} {formatDateTime(c.expiresAt || c.validTo || "", dateLocale)}
                        </p>
                      ) : null}
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
                  <div className="mt-3 grid gap-1 text-xs text-white/65">
                    <p>
                      {t("couponBenefit")}: {couponBenefitText(c)}
                    </p>
                    {Number(c.minOrderAmt || 0) > 0 ? (
                      <p>
                        {t("couponMinOrder")}: ฿{Math.round(Number(c.minOrderAmt || 0))}
                      </p>
                    ) : null}
                    <p>
                      {t("couponStackRule")}: {couponStackRuleText(c)}
                    </p>
                    {c.campaignName ? (
                      <p>
                        {t("couponCampaign")}: {c.campaignName}
                      </p>
                    ) : null}
                    {Array.isArray(c.issuedStoreScope) && c.issuedStoreScope.length > 0 ? (
                      <p>
                        {t("couponScope")}: {c.issuedStoreScope.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  {c.status === "issued" ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <MemberPortalCouponQrButton
                        memberNo={member.memberNo}
                        couponCode={c.couponCode}
                        couponName={c.couponName}
                        issueId={c.id}
                      />
                      <CopyButton text={c.couponCode} label={t("copyCode")} />
                    </div>
                  ) : null}
                </GlassCard>
              ))
            )}
            <SectionTitle title={t("historyTitle")} subtitle={t("historySub")} />

            <div>
              <h3 className="mb-3 text-sm font-semibold text-white/70">{t("recentOrders")}</h3>
              <div className="space-y-2">
                {visits.length === 0 ? (
                  <GlassCard soft className="px-5 py-10 text-center text-white/45">
                    {t("noOrders")}
                  </GlassCard>
                ) : (
                  visits.map((v) => (
                    <GlassCard key={v.orderId} soft className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{formatBaht(v.total)}</p>
                          <p className="text-xs text-white/45">
                            {stores.find((s) => s.storeCode === v.storeCode)?.displayName || t("store")} · {v.orderNo || `#${v.orderId}`}
                          </p>
                        </div>
                        <p className="text-xs text-white/45">{formatDateTime(v.visitedAt, dateLocale)}</p>
                      </div>
                    </GlassCard>
                  ))
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-white/70">{t("pointsHistory")}</h3>
              <div className="space-y-2">
                {points.length === 0 ? (
                  <GlassCard soft className="px-5 py-10 text-center text-white/45">
                    {t("noPoints")}
                  </GlassCard>
                ) : (
                  points.map((p) => (
                    <GlassCard key={p.id} soft className="px-4 py-3">
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
                    </GlassCard>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "me" && (
          <div className="space-y-4">
            <SectionTitle title={t("profileTitle")} subtitle={t("profileSub")} />

            <GlassCard>
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("nameLabel")}</Label>
                  <Input
                    value={profile.name}
                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                    className={mpInputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("phoneLabel")}</Label>
                  <Input value={member.phone || ""} disabled className={`${mpInputClass} opacity-60`} />
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
                    <div className="grid grid-cols-2 gap-2">
                      {(["M", "F"] as const).map((value) => {
                        const active = profile.gender === value
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setProfile((p) => ({ ...p, gender: value }))}
                            className={`h-11 rounded-2xl border text-sm font-medium transition ${
                              active
                                ? "border-amber-400/50 bg-amber-400/15 text-amber-100"
                                : "border-white/10 bg-black/20 text-white/75 hover:border-white/20"
                            }`}
                          >
                            {value === "M" ? t("genderMale") : t("genderFemale")}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white/70">{t("nationalityLabel")}</Label>
                    <MemberPortalNationalitySelect
                      value={profile.nationality}
                      onChange={(nationality) => setProfile((p) => ({ ...p, nationality }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("emailLabel")}</Label>
                  <Input
                    value={profile.email}
                    onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                    className={mpInputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("referralInputLabel")}</Label>
                  {member.referredByMemberId ? (
                    <p className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/55">
                      {t("profileReferralLocked")}
                    </p>
                  ) : (
                    <Input
                      value={profile.referralCode}
                      onChange={(e) => setProfile((p) => ({ ...p, referralCode: e.target.value.toUpperCase() }))}
                      placeholder="CM123456"
                      className={mpInputClass}
                    />
                  )}
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={profile.consentMarketing}
                    onChange={(e) => setProfile((p) => ({ ...p, consentMarketing: e.target.checked }))}
                    className="h-4 w-4 accent-amber-400"
                  />
                  <span className="text-white/75">{t("consentMarketing")}</span>
                </label>
              </div>

              <Button onClick={saveProfile} disabled={actionLoading} className={`mt-5 w-full ${mpPrimaryBtn}`}>
                {actionLoading ? t("saving") : t("saveProfileChanges")}
              </Button>
            </GlassCard>

            <MemberPortalProfileContactLinks urls={contactUrls} />

            <GlassCard soft className="text-sm text-stone-600">
              <p>{t("memberNo")} {member.memberNo}</p>
              {activeDashboard.referralCode ? (
                <p className="mt-1">{t("myReferralCode")} {activeDashboard.referralCode}</p>
              ) : null}
              <p className="mt-1">{t("joined")} {member.createdAt ? formatDateTime(member.createdAt, dateLocale) : "-"}</p>
              {member.lastVisitedAt ? (
                <p className="mt-1">{t("lastVisit")} {formatDateTime(member.lastVisitedAt, dateLocale)}</p>
              ) : null}
            </GlassCard>
          </div>
        )}
      </MemberPortalShell>

      <PremiumBottomNav tab={tab} onChange={changeTab} items={navItems} embedPreview={embedPreview} />

      <MemberPortalContentSheet
        open={homePromoOpen}
        item={selectedHomePromo}
        closeLabel={t("contactMenuClose")}
        onClose={() => {
          setHomePromoOpen(false)
          setSelectedHomePromo(null)
        }}
      />
      <MemberPortalTierBenefitsSheet
        open={tierBenefitsOpen}
        tiers={portalTiers}
        currentTierCode={activeDashboard.tierProgress.currentTierCode}
        closeLabel={t("contactMenuClose")}
        onClose={() => setTierBenefitsOpen(false)}
      />
    </MemberPortalAmbienceBackground>
  )
}

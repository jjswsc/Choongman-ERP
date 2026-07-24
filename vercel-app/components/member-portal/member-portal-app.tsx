"use client"

import * as React from "react"
import Image from "next/image"
import QRCode from "qrcode"
import {
  Gift,
  Home,
  Loader2,
  MapPin,
  Search,
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
  memberPortalDateLocale,
  memberPortalLoginError,
} from "@/lib/member-portal-i18n"
import { normalizeMemberPhone } from "@/lib/member-phone-lookup"
import type { MemberPortalContentItem } from "@/lib/member-portal-content"
import { pickMemberPortalHomePopup } from "@/lib/member-portal-content"
import { MemberPortalOrderTab } from "@/components/member-portal/member-portal-order-tab"
import { MemberPortalHomeTopBar } from "@/components/member-portal/member-portal-home-top-bar"
import { MemberPortalNotificationsSheet } from "@/components/member-portal/member-portal-notifications-sheet"
import {
  bangkokNowDateTimeString,
  hasUnreadMemberPortalNotifications,
  mergeMemberPortalNotificationItems,
  readMemberPortalNotifSeenAt,
  writeMemberPortalNotifSeenAt,
} from "@/lib/member-portal-notifications"
import type { MemberStampHistoryRow } from "@/lib/member-stamp-card"
import { formatStampHistoryKind } from "@/components/member-portal/member-portal-stamp-card"
import { MemberPortalHomeHeroBanner, MemberPortalHomeNewMenuHeroes } from "@/components/member-portal/member-portal-home-hero-banner"
import { MemberPortalHomePrivileges } from "@/components/member-portal/member-portal-home-privileges"
import { MP_HOME_SECTION_GAP } from "@/lib/member-portal-home-layout"
import {
  resolveMemberPortalHomePrivilegesForLang,
  type MemberPortalHomePrivilegeItem,
} from "@/lib/member-portal-home-privileges-config"
import { MemberPortalStoreLocationCard } from "@/components/member-portal/member-portal-store-location-card"
import { MemberPwaInstallBanner } from "@/components/member-portal/member-pwa-install-banner"
import { MemberPortalLineOaFriendBanner } from "@/components/member-portal/member-portal-line-oa-friend-banner"
import { MemberPortalJoinStoreDialog } from "@/components/member-portal/member-portal-join-store-dialog"
import { MemberPortalLinePhoneLinkDialog } from "@/components/member-portal/member-portal-line-phone-link-dialog"
import { MemberPortalMembershipCard } from "@/components/member-portal/member-portal-membership-card"
import type { PortalCouponOfferRow } from "@/lib/member-portal-coupon-claim"
import { MemberPortalPrivilegeTab } from "@/components/member-portal/member-portal-privilege-tab"
import {
  MemberPortalTierBenefitsSheet,
  MemberPortalTierEntryButton,
  useMemberPortalTiers,
} from "@/components/member-portal/member-portal-tier-guide"
import { MemberPortalProfileContactLinks, MemberPortalContactChannelButtons } from "@/components/member-portal/member-portal-contact-links"
import { MemberPortalComplaintSection } from "@/components/member-portal/member-portal-complaint-section"
import { MemberPortalComplaintPromoCard } from "@/components/member-portal/member-portal-complaint-promo-card"
import { MemberPortalLoungeBackdrop } from "@/components/member-portal/member-portal-lounge-backdrop"
import {
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
import {
  MP_CARD_TEXT_MUTED,
  MP_CARD_TEXT_PRIMARY,
  MP_CARD_TEXT_SECONDARY,
  MP_CARD_TEXT_SUBTLE,
  mpCardSearchInputClass,
  memberPortalGreetingKey,
} from "@/lib/member-portal-design"
import {
  DEFAULT_MEMBER_PORTAL_UI_THEME,
  memberPortalUiThemeStyle,
  type MemberPortalUiTheme,
} from "@/lib/member-portal-theme"
import { clearMemberPortalMemberLocalData, readFavoriteStoreCodesFromLocalStorage, writeFavoriteStoreCodesToLocalStorage } from "@/lib/member-portal-client-storage"
import { sortStoresWithFavoritesFirst, toggleFavoriteStoreCode } from "@/lib/member-portal-favorite-stores"
import {
  MP_PAGE_BG_CLASS,
  mpGenderBtnActiveClass,
  mpGenderBtnClass,
  mpInputClass,
  mpPrimaryBtn,
} from "@/lib/member-portal-design"
import { memberPortalStoreMatchesQuery } from "@/lib/member-portal-stores"
import {
  DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES,
  DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL,
  type MemberPortalStoreRow,
  type PublicConfigResponse,
  postJson,
  getJson,
  publicConfigUrl,
  applyPublicConfigToState,
} from "@/components/member-portal/member-portal-app-utils"

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

export function MemberPortalApp() {
  const brand = useAppBrandConfig()
  const {
    isEmbedPreview: embedPreview,
    previewLoginBackgroundUrl,
    previewAppBackgroundUrl,
  } = useMemberPortalEmbedPreview()
  const { lang, t } = useMemberPortalLang()
  const { tiers: portalTiers, pointRetentionYears } = useMemberPortalTiers()
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
  const [orderBottomNavSuppressed, setOrderBottomNavSuppressed] = React.useState(false)

  React.useEffect(() => {
    if (tab !== "order") setOrderBottomNavSuppressed(false)
  }, [tab])
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
  const openInAppComplaint = React.useCallback(() => {
    setContactMenuOpen(false)
    changeTab("me")
    setComplaintFormOpen(true)
  }, [changeTab])
  const [signupName, setSignupName] = React.useState("")
  const [signupGender, setSignupGender] = React.useState<"" | "M" | "F">("")
  const [signupStoreCode, setSignupStoreCode] = React.useState("")
  const [signupStoreOptions, setSignupStoreOptions] = React.useState<
    Array<{ storeCode: string; displayName: string }>
  >([])
  const [signupOfficeStoreCode, setSignupOfficeStoreCode] = React.useState("office")
  const [phoneLinkSkipped, setPhoneLinkSkipped] = React.useState(false)
  const [signupConsentMarketing, setSignupConsentMarketing] = React.useState(true)
  const [loading, setLoading] = React.useState(true)
  const [actionLoading, setActionLoading] = React.useState(false)
  const [authPanel, setAuthPanel] = React.useState<"signup" | "login" | null>(null)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const [lineLoginEnabled, setLineLoginEnabled] = React.useState(false)
  const [contactMenuOpen, setContactMenuOpen] = React.useState(false)
  const [complaintFormOpen, setComplaintFormOpen] = React.useState(false)
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
  const [uiTheme, setUiTheme] = React.useState<MemberPortalUiTheme>(DEFAULT_MEMBER_PORTAL_UI_THEME)
  const [signupWelcomeCouponEnabled, setSignupWelcomeCouponEnabled] = React.useState(false)
  const [homePrivileges, setHomePrivileges] = React.useState<MemberPortalHomePrivilegeItem[]>(
    DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES
  )
  const [stampFoodImageUrl, setStampFoodImageUrl] = React.useState(DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL)
  const [points, setPoints] = React.useState<PortalPointRow[]>([])
  const [stampHistory, setStampHistory] = React.useState<MemberStampHistoryRow[]>([])
  const [notifOpen, setNotifOpen] = React.useState(false)
  const [notifSeenAt, setNotifSeenAt] = React.useState<string | null>(null)

  const notifItems = React.useMemo(
    () => mergeMemberPortalNotificationItems({ points, stamps: stampHistory, limit: 40 }),
    [points, stampHistory]
  )
  const hasNotification = React.useMemo(
    () => hasUnreadMemberPortalNotifications(notifItems, notifSeenAt),
    [notifItems, notifSeenAt]
  )
  React.useEffect(() => {
    if (!member?.id) {
      setNotifSeenAt(null)
      return
    }
    setNotifSeenAt(readMemberPortalNotifSeenAt(member.id))
  }, [member?.id])
  const openNotifications = React.useCallback(() => {
    setNotifOpen(true)
    if (!member?.id) return
    const now = bangkokNowDateTimeString()
    writeMemberPortalNotifSeenAt(member.id, now)
    setNotifSeenAt(now)
  }, [member?.id])
  const [coupons, setCoupons] = React.useState<PortalCouponRow[]>([])
  const [couponOffers, setCouponOffers] = React.useState<PortalCouponOfferRow[]>([])
  const [couponOffersLoading, setCouponOffersLoading] = React.useState(false)
  const [claimingCouponCode, setClaimingCouponCode] = React.useState<string | null>(null)
  const [visits, setVisits] = React.useState<PortalVisitRow[]>([])
  const [stores, setStores] = React.useState<MemberPortalStoreRow[]>([])
  const [contentItems, setContentItems] = React.useState<MemberPortalContentItem[]>([])
  const [locationSearch, setLocationSearch] = React.useState("")
  const [favoriteStoreCodes, setFavoriteStoreCodes] = React.useState<string[]>([])
  const [showQr, setShowQr] = React.useState(false)
  const [homePromoOpen, setHomePromoOpen] = React.useState(false)
  const [homePopupOpen, setHomePopupOpen] = React.useState(false)
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
    void getJson<{ success: boolean; rows?: MemberStampHistoryRow[] }>(
      "/api/member-portal/me/stamps/history?limit=30"
    )
      .then((stampHistRes) => setStampHistory(stampHistRes.rows || []))
      .catch(() => setStampHistory([]))
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
    const reloadDesignFromPublicConfig = () => {
      getJson<PublicConfigResponse>(publicConfigUrl())
        .then((r) => {
          const applied = applyPublicConfigToState(r, brand, {
            previewLoginBackgroundUrl: embedPreview ? previewLoginBackgroundUrl : "",
            previewAppBackgroundUrl: embedPreview ? previewAppBackgroundUrl : "",
          })
          setContactUrls(applied.contactUrls)
          setDesignBackgrounds(applied.designBackgrounds)
          setUiTheme(applied.uiTheme)
          setSignupWelcomeCouponEnabled(applied.signupWelcomeCouponEnabled)
          setHomePrivileges(applied.homePrivileges)
          setStampFoodImageUrl(applied.stampFoodImageUrl)
        })
        .catch(() => {})
    }

    if (embedPreview) {
      getJson<PublicConfigResponse>(publicConfigUrl())
        .then((r) => {
          const applied = applyPublicConfigToState(r, brand, {
            previewLoginBackgroundUrl,
            previewAppBackgroundUrl,
          })
          setContactUrls(applied.contactUrls)
          if (previewLoginBackgroundUrl || previewAppBackgroundUrl) {
            setDesignBackgrounds((prev) => ({
              ...prev,
              loginBackgroundUrl: previewLoginBackgroundUrl || prev.loginBackgroundUrl,
              appBackgroundUrl: previewAppBackgroundUrl || prev.appBackgroundUrl,
              heroFoodImageUrl: applied.designBackgrounds.heroFoodImageUrl,
            }))
          } else {
            setDesignBackgrounds(applied.designBackgrounds)
          }
          setUiTheme(applied.uiTheme)
          setSignupWelcomeCouponEnabled(applied.signupWelcomeCouponEnabled)
          setHomePrivileges(applied.homePrivileges)
          setStampFoodImageUrl(applied.stampFoodImageUrl)
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
    reloadDesignFromPublicConfig()
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

    const onVisible = () => {
      if (document.visibilityState === "visible") reloadDesignFromPublicConfig()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
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
    if (!member?.id) return
    try {
      setPhoneLinkSkipped(localStorage.getItem(`member-line-phone-link-skipped-${member.id}`) === "1")
    } catch {
      setPhoneLinkSkipped(false)
    }
  }, [member?.id])

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
    if (member) return
    const params = new URLSearchParams(window.location.search)
    if (params.get("signup") === "1") {
      setAuthPanel("signup")
      window.history.replaceState({}, "", "/m")
    }
  }, [member])

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
    setCouponOffersLoading(true)
    ;(async () => {
      try {
        const [couponsRes, offersRes, dashRes] = await Promise.all([
          getJson<{ success: boolean; rows?: PortalCouponRow[] }>("/api/member-portal/me/coupons"),
          getJson<{ success: boolean; rows?: PortalCouponOfferRow[] }>("/api/member-portal/me/coupon-offers"),
          getJson<{ success: boolean } & PortalDashboard>("/api/member-portal/me/dashboard"),
        ])
        if (cancelled) return
        if (couponsRes.success) setCoupons(couponsRes.rows || [])
        if (offersRes.success) setCouponOffers(offersRes.rows || [])
        if (dashRes.success && dashRes.member) {
          setMember(dashRes.member)
          setDashboard({
            member: dashRes.member,
            referralCode: dashRes.referralCode,
            stats: dashRes.stats,
            tierProgress: dashRes.tierProgress,
          })
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setCouponOffersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, member?.id])

  const handleClaimCouponOffer = React.useCallback(
    async (couponCode: string) => {
      const code = String(couponCode || "").trim().toUpperCase()
      if (!code || claimingCouponCode) return
      setClaimingCouponCode(code)
      try {
        const res = await postJson<{
          success: boolean
          message?: string
          coupons?: PortalCouponRow[]
          rows?: PortalCouponOfferRow[]
          pointBalance?: number
        }>(`/api/member-portal/me/coupons/claim?lang=${encodeURIComponent(lang)}`, { couponCode: code })
        if (res.success) {
          if (Array.isArray(res.coupons)) setCoupons(res.coupons)
          setMember((prev) =>
            prev && typeof res.pointBalance === "number"
              ? { ...prev, pointBalance: res.pointBalance }
              : prev
          )
          const offersRes = await getJson<{ success: boolean; rows?: PortalCouponOfferRow[] }>(
            "/api/member-portal/me/coupon-offers"
          )
          if (offersRes.success) setCouponOffers(offersRes.rows || [])
          window.alert(t("couponClaimSuccess"))
        } else if (res.message) {
          window.alert(res.message)
        }
      } catch {
        /* ignore */
      } finally {
        setClaimingCouponCode(null)
      }
    },
    [claimingCouponCode, lang, t]
  )

  const [redeemingPromoCode, setRedeemingPromoCode] = React.useState(false)
  const handleRedeemPromoCode = React.useCallback(
    async (rawCode: string): Promise<boolean> => {
      const code = String(rawCode || "").trim()
      if (!code || redeemingPromoCode || claimingCouponCode) return false
      setRedeemingPromoCode(true)
      try {
        const res = await postJson<{
          success: boolean
          message?: string
          coupons?: PortalCouponRow[]
        }>(`/api/member-portal/me/coupons/redeem-code?lang=${encodeURIComponent(lang)}`, { code })
        if (res.success) {
          if (Array.isArray(res.coupons)) setCoupons(res.coupons)
          const offersRes = await getJson<{ success: boolean; rows?: PortalCouponOfferRow[] }>(
            "/api/member-portal/me/coupon-offers"
          )
          if (offersRes.success) setCouponOffers(offersRes.rows || [])
          window.alert(t("promoCodeSuccess"))
          return true
        }
        if (res.message) window.alert(res.message)
        return false
      } catch {
        window.alert(t("promoCodeFailGeneric"))
        return false
      } finally {
        setRedeemingPromoCode(false)
      }
    },
    [claimingCouponCode, lang, redeemingPromoCode, t]
  )

  const homePopup = React.useMemo(() => pickMemberPortalHomePopup(contentItems), [contentItems])
  const homePopupContentKey = homePopup?.contentKey || ""
  const homePrivilegeCards = React.useMemo(
    () => resolveMemberPortalHomePrivilegesForLang(homePrivileges, lang),
    [homePrivileges, lang]
  )

  React.useEffect(() => {
    if (!member || tab !== "home" || !homePopupContentKey) {
      setHomePopupOpen(false)
      return
    }
    if (!embedPreview) {
      try {
        const dismissKey = `cm_mp_popup_dismiss_${homePopupContentKey}`
        if (sessionStorage.getItem(dismissKey) === "1") {
          setHomePopupOpen(false)
          return
        }
      } catch {
        /* ignore */
      }
    }
    setHomePopupOpen(true)
  }, [member, tab, homePopupContentKey, embedPreview])

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
    setStampHistory([])
    setNotifOpen(false)
    setNotifSeenAt(null)
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
    const portalFieldClass = `${mpInputClass} h-12`
    const portalLabelClass = `text-[11px] font-medium uppercase tracking-[0.14em] ${MP_CARD_TEXT_SECONDARY}`

    return (
      <div
        className={`relative ${MP_PAGE_BG_CLASS} ${MP_CARD_TEXT_PRIMARY} ${embedPreview ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh] overflow-x-hidden"}`}
        style={memberPortalUiThemeStyle(uiTheme)}
      >
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
            <div className={`mb-4 flex items-center gap-2 ${MP_CARD_TEXT_SECONDARY}`}>
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

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAuthPanel((prev) => (prev === "signup" ? null : "signup"))
                    setError("")
                  }}
                  className={`h-[50px] w-full rounded-2xl px-3 text-sm font-semibold transition ${
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
                  className={`h-[50px] w-full rounded-2xl px-3 text-sm font-semibold transition ${
                    authPanel === "login"
                      ? "border border-amber-400/40 bg-amber-50 text-amber-900"
                      : "border border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100"
                  }`}
                >
                  {t("loginBtn")}
                </button>
              </div>
            </div>

            {authPanel === "signup" ? (
              <div className="mt-5 border-t border-stone-200/80 pt-5">
                <p className={`mb-4 text-sm font-medium ${MP_CARD_TEXT_PRIMARY}`}>{t("signupTitle")}</p>
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label className={portalLabelClass}>{t("signupStoreLabel")}</Label>
                    <select
                      value={signupStoreCode}
                      onChange={(e) => setSignupStoreCode(e.target.value)}
                      className={`${portalFieldClass} w-full px-3 text-sm`}
                    >
                      <option value="" className="bg-white text-stone-500">
                        {t("signupStorePlaceholder")}
                      </option>
                      <option value={signupOfficeStoreCode} className="bg-white text-stone-900">
                        {t("signupStoreOffice")}
                      </option>
                      {signupStoreOptions.map((store) => (
                        <option key={store.storeCode} value={store.storeCode} className="bg-white text-stone-900">
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
                    <BirthDateFields value={birthDate} onChange={setBirthDate} variant="light" />
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
                            className={active ? mpGenderBtnActiveClass : mpGenderBtnClass}
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
                        ? "border-amber-300/50 bg-amber-50"
                        : "border-stone-200 bg-stone-50/90"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={signupConsentMarketing}
                      onChange={(e) => setSignupConsentMarketing(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
                    />
                    <span className="min-w-0">
                      <span className={`flex items-center gap-2 font-medium ${MP_CARD_TEXT_PRIMARY}`}>
                        <Gift className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                        {t("consentMarketing")}
                      </span>
                      {signupWelcomeCouponEnabled ? (
                        <span className={`mt-1 block text-xs leading-relaxed ${MP_CARD_TEXT_SECONDARY}`}>
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
              <div className="mt-5 border-t border-stone-200/80 pt-5">
                <p className={`mb-4 text-sm font-medium ${MP_CARD_TEXT_PRIMARY}`}>{t("phoneBirthTitle")}</p>
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
                    <BirthDateFields value={birthDate} onChange={setBirthDate} variant="light" />
                  </div>
                  <Button
                    onClick={loginWithPhoneBirth}
                    disabled={actionLoading || !normalizeMemberPhone(phone) || !birthDateReady}
                    className={`w-full ${mpPrimaryBtn}`}
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
                <div className="mb-2.5">
                  <MemberPortalComplaintPromoCard
                    variant="onDark"
                    onOpen={() => {
                      setContactMenuOpen(false)
                      setAuthPanel("login")
                      setNotice(t("complaintLoginRequired"))
                    }}
                  />
                </div>
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
            pointRetentionYears={pointRetentionYears}
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

  return (
    <MemberPortalAmbienceBackground
      imageUrl={designBackgrounds.appBackgroundUrl}
      heroFoodImageUrl={designBackgrounds.heroFoodImageUrl}
      uiTheme={uiTheme}
      className={embedPreview ? "h-[100dvh] overflow-hidden" : undefined}
    >
      <MemberPortalShell embedPreview={embedPreview}>
        {member.lineUserId && (!member.phone || !member.birthDate) && !phoneLinkSkipped ? (
          <MemberPortalLinePhoneLinkDialog
            onComplete={(updated, merged) => {
              applyLoggedInMember(updated)
              void loadSession()
              if (merged) setNotice(t("linePhoneLinkMergedNotice"))
            }}
            onSkip={() => {
              if (!member.id) return
              try {
                localStorage.setItem(`member-line-phone-link-skipped-${member.id}`, "1")
              } catch {
                /* ignore */
              }
              setPhoneLinkSkipped(true)
            }}
          />
        ) : !member.joinStoreCode ? (
          <MemberPortalJoinStoreDialog
            officeStoreCode={signupOfficeStoreCode}
            storeOptions={signupStoreOptions}
            onComplete={(updated) => applyLoggedInMember(updated)}
          />
        ) : null}
        {tab === "home" ? (
          <MemberPortalHomeTopBar
            greeting={t(memberPortalGreetingKey())}
            displayName={member.fullName || member.name || "Member"}
            tierName={activeDashboard.tierProgress.currentTierName || tier.label}
            tierCode={activeDashboard.tierProgress.currentTierCode}
            logoSrc={brand.logoSymbolSrc}
            logoAlt={brand.logoAlt}
            langSelect={<MemberPortalLangSelect />}
            onLogout={logout}
            logoutLabel={t("logout")}
            hasNotification={hasNotification}
            notificationLabel={t("notifBellAria")}
            onOpenNotifications={openNotifications}
          />
        ) : (
          <PremiumAppHeader
            wordmark={t("memberLounge")}
            displayName={member.fullName || member.name || "Member"}
            tierLabel={activeDashboard.tierProgress.currentTierName || tier.label}
            tierCode={activeDashboard.tierProgress.currentTierCode}
            logoSrc={brand.logoSymbolSrc}
            logoAlt={brand.logoAlt}
            langSelect={<MemberPortalLangSelect />}
            onLogout={logout}
            logoutLabel={t("logout")}
          />
        )}

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
          <div className={MP_HOME_SECTION_GAP}>
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
                pointRateLabel: `${(activeDashboard.tierProgress.pointRate * 100).toFixed(1)}%`,
                nextTierCode: activeDashboard.tierProgress.nextTierCode,
                nextTierName: activeDashboard.tierProgress.nextTierName,
                progressSummary: activeDashboard.tierProgress.nextTierName
                  ? activeDashboard.tierProgress.upgradeBasis === "points"
                    ? `${Math.round(activeDashboard.tierProgress.qualificationValue || 0).toLocaleString()} / ${Math.round((activeDashboard.tierProgress.qualificationValue || 0) + activeDashboard.tierProgress.amountToNext).toLocaleString()} P (${activeDashboard.tierProgress.progressPercent}%)`
                    : `${formatBaht(activeDashboard.tierProgress.qualificationValue || 0)} / ${formatBaht((activeDashboard.tierProgress.qualificationValue || 0) + activeDashboard.tierProgress.amountToNext)} (${activeDashboard.tierProgress.progressPercent}%)`
                  : undefined,
                actionLabel: portalTiers.length > 0 ? t("tierBenefitsViewBtn") : undefined,
                onAction: portalTiers.length > 0 ? () => setTierBenefitsOpen(true) : undefined,
              }}
              pointRetentionYears={pointRetentionYears}
            />

            <MemberPortalLineOaFriendBanner
              memberId={member.id}
              lineOaFriend={member.lineOaFriend}
              lineOfficialUrl={contactUrls.lineOfficialUrl}
            />

            <MemberPortalComplaintPromoCard onOpen={openInAppComplaint} />

            <MemberPortalHomeHeroBanner
              contentItems={contentItems}
              t={t}
              onOrder={() => changeTab("order")}
              onSelectItem={(item) => {
                setHomePopupOpen(false)
                setSelectedHomePromo(item)
                setHomePromoOpen(true)
              }}
            />

            <MemberPortalHomeNewMenuHeroes
              contentItems={contentItems}
              t={t}
              onOrder={() => changeTab("order")}
              onSelectItem={(item) => {
                setHomePopupOpen(false)
                setSelectedHomePromo(item)
                setHomePromoOpen(true)
              }}
            />

            <MemberPortalHomePrivileges
              items={homePrivilegeCards}
              t={t}
              onViewAll={() => changeTab("privilege")}
              onNavigateTab={changeTab}
            />

            <MemberPortalStampHomeWidget
              lang={lang}
              status={stampStatus}
              loading={stampLoading}
              foodImageUrl={stampFoodImageUrl}
              onOpenPrivilege={() => changeTab("privilege")}
            />
          </div>
        )}

        {tab === "order" && member ? (
          <MemberPortalOrderTab
            lang={lang}
            t={t}
            member={member}
            stores={stores}
            favoriteStoreCodes={favoriteStoreCodes}
            contentItems={contentItems}
            onBottomNavSuppressChange={setOrderBottomNavSuppressed}
            onSessionRefresh={() => {
              void loadSession()
            }}
            onSelectContentItem={(item) => {
              setHomePopupOpen(false)
              setSelectedHomePromo(item)
              setHomePromoOpen(true)
            }}
          />
        ) : null}

        {tab === "location" && (
          <div className="space-y-4">
            <SectionTitle title={t("locationTitle")} subtitle={t("locationDesc")} />
            <GlassCard soft className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Search className={`h-4 w-4 ${MP_CARD_TEXT_SUBTLE}`} />
                <Input
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  placeholder={t("locationSearchPh")}
                  className={mpCardSearchInputClass}
                />
              </div>
            </GlassCard>
            <div className="space-y-3">
              {filteredStores.length === 0 ? (
                <GlassCard soft className="px-5 py-14 text-center">
                  <MapPin className="mx-auto mb-3 h-7 w-7 text-amber-600/80" />
                  <p className={`text-sm ${MP_CARD_TEXT_SECONDARY}`}>
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
          <MemberPortalPrivilegeTab
            lang={lang}
            dateLocale={dateLocale}
            memberNo={member.memberNo}
            member={member}
            dashboard={activeDashboard}
            coupons={coupons}
            offers={couponOffers}
            offersLoading={couponOffersLoading}
            claimingCode={claimingCouponCode}
            redeemingPromo={redeemingPromoCode}
            visits={visits}
            points={points}
            stampStatus={stampStatus}
            stampLoading={stampLoading}
            stampFoodImageUrl={stampFoodImageUrl}
            portalTiersCount={portalTiers.length}
            pointRetentionYears={pointRetentionYears}
            onOpenTierBenefits={() => setTierBenefitsOpen(true)}
            onClaimOffer={handleClaimCouponOffer}
            onRedeemPromoCode={handleRedeemPromoCode}
            stores={stores}
            t={t}
          />
        )}

        {tab === "me" && (
          <div className="space-y-4">
            <SectionTitle title={t("profileTitle")} subtitle={t("profileSub")} />

            <GlassCard>
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label className={MP_CARD_TEXT_SECONDARY}>{t("nameLabel")}</Label>
                  <Input
                    value={profile.name}
                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                    className={mpInputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={MP_CARD_TEXT_SECONDARY}>{t("phoneLabel")}</Label>
                  <Input value={member.phone || ""} disabled className={`${mpInputClass} opacity-60`} />
                </div>
                <div className="space-y-1.5">
                  <Label className={MP_CARD_TEXT_SECONDARY}>{t("birthDateLabel")}</Label>
                  <BirthDateFields
                    variant="light"
                    value={profile.birthDate}
                    onChange={(iso) => setProfile((p) => ({ ...p, birthDate: iso }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className={MP_CARD_TEXT_SECONDARY}>{t("genderLabel")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["M", "F"] as const).map((value) => {
                        const active = profile.gender === value
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setProfile((p) => ({ ...p, gender: value }))}
                            className={active ? mpGenderBtnActiveClass : mpGenderBtnClass}
                          >
                            {value === "M" ? t("genderMale") : t("genderFemale")}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={MP_CARD_TEXT_SECONDARY}>{t("nationalityLabel")}</Label>
                    <MemberPortalNationalitySelect
                      value={profile.nationality}
                      onChange={(nationality) => setProfile((p) => ({ ...p, nationality }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className={MP_CARD_TEXT_SECONDARY}>{t("emailLabel")}</Label>
                  <Input
                    value={profile.email}
                    onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                    className={mpInputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={MP_CARD_TEXT_SECONDARY}>{t("referralInputLabel")}</Label>
                  {member.referredByMemberId ? (
                    <p className={`rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 text-sm ${MP_CARD_TEXT_MUTED}`}>
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
                <label className={`flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 text-sm ${MP_CARD_TEXT_SECONDARY}`}>
                  <input
                    type="checkbox"
                    checked={profile.consentMarketing}
                    onChange={(e) => setProfile((p) => ({ ...p, consentMarketing: e.target.checked }))}
                    className="h-4 w-4 accent-amber-500"
                  />
                  <span>{t("consentMarketing")}</span>
                </label>
              </div>

              <Button onClick={saveProfile} disabled={actionLoading} className={`mt-5 w-full ${mpPrimaryBtn}`}>
                {actionLoading ? t("saving") : t("saveProfileChanges")}
              </Button>
            </GlassCard>

            <MemberPortalComplaintSection
              member={member}
              stores={stores}
              formOpen={complaintFormOpen}
              onFormOpenChange={setComplaintFormOpen}
              onNotice={setNotice}
              onError={setError}
            />

            <MemberPortalProfileContactLinks urls={contactUrls} />

            <GlassCard soft className={`text-sm ${MP_CARD_TEXT_MUTED}`}>
              <p className={MP_CARD_TEXT_PRIMARY}>{t("memberNo")} {member.memberNo}</p>
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

      <PremiumBottomNav
        tab={tab}
        onChange={changeTab}
        items={navItems}
        embedPreview={embedPreview}
        hidden={orderBottomNavSuppressed}
      />

      <MemberPortalContentSheet
        open={homePromoOpen}
        item={selectedHomePromo}
        closeLabel={t("contactMenuClose")}
        onClose={() => {
          setHomePromoOpen(false)
          setSelectedHomePromo(null)
        }}
      />
      <MemberPortalContentSheet
        open={homePopupOpen}
        item={homePopup}
        imageFit="popup"
        closeLabel={t("contactMenuClose")}
        onClose={() => {
          setHomePopupOpen(false)
          if (homePopup?.contentKey) {
            try {
              sessionStorage.setItem(`cm_mp_popup_dismiss_${homePopup.contentKey}`, "1")
            } catch {
              /* ignore */
            }
          }
        }}
      />
      <MemberPortalTierBenefitsSheet
        open={tierBenefitsOpen}
        tiers={portalTiers}
        currentTierCode={activeDashboard.tierProgress.currentTierCode}
        pointRetentionYears={pointRetentionYears}
        closeLabel={t("contactMenuClose")}
        onClose={() => setTierBenefitsOpen(false)}
      />
      <MemberPortalNotificationsSheet
        open={notifOpen}
        items={notifItems}
        locale={dateLocale}
        lang={lang}
        t={t}
        formatStampItem={(item) =>
          formatStampHistoryKind(lang, {
            id: 0,
            kind: item.stampKind || "earn",
            storeCode: item.storeCode || "",
            stampYmd: "",
            balanceAfter: item.stampBalanceAfter || 0,
            note: item.note || "",
            createdAt: item.createdAt,
          })
        }
        onClose={() => setNotifOpen(false)}
      />
    </MemberPortalAmbienceBackground>
  )
}

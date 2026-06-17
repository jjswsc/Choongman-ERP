"use client"

import * as React from "react"
import Link from "next/link"
import { QrCode } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { MemberPortalContentAdminPanel } from "@/components/admin/member-portal-content-admin-panel"
import { MemberPortalStoresPanel } from "@/components/admin/member-portal-stores-panel"
import { CrmImageUploadField } from "@/components/crm/crm-image-upload-field"
import { CrmMemberAppPreview } from "@/components/crm/crm-member-app-preview"
import type { MemberPortalContentAdminItem } from "@/lib/member-portal-content-admin"
import { countContentForAdminTab } from "@/lib/member-portal-content-admin"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tr } from "@/lib/i18n"
import { canEditMemberPortalAdmin, hasOfficeStaffScope } from "@/lib/permissions"
import { apiFetch } from "@/lib/api/fetch"
import {
  MEMBER_PORTAL_CONTENT_IMAGE_RULES,
  readMemberPortalImageSize,
  validateMemberPortalImageByRule,
  memberPortalImageUploadCatchMessage,
} from "@/lib/member-portal-content-image-rules"
import {
  uploadMemberPortalContentImageToStorage,
  verifyMemberPortalImagePublicUrl,
  withMemberPortalImageCacheBust,
} from "@/lib/member-portal-image-upload"

export default function CrmMemberAppContentPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const canEdit = canEditMemberPortalAdmin(auth?.role || "", auth?.store)
  const canViewAllSignupStats = hasOfficeStaffScope(auth?.role || "", auth?.store)
  const [activeTab, setActiveTab] = React.useState<
    "all" | "design" | "popup" | "promo" | "new_menu" | "info" | "stores" | "contact" | "delivery"
  >("all")
  const [items, setItems] = React.useState<MemberPortalContentAdminItem[]>([])
  const [contactFacebookUrl, setContactFacebookUrl] = React.useState("")
  const [contactInstagramUrl, setContactInstagramUrl] = React.useState("")
  const [contactLineOfficialUrl, setContactLineOfficialUrl] = React.useState("")
  const [signupWelcomeCouponCode, setSignupWelcomeCouponCode] = React.useState("")
  const [deliveryGrabUrl, setDeliveryGrabUrl] = React.useState("")
  const [deliveryLinemanUrl, setDeliveryLinemanUrl] = React.useState("")
  const [deliveryShopeeUrl, setDeliveryShopeeUrl] = React.useState("")
  const [loginBackgroundUrl, setLoginBackgroundUrl] = React.useState("")
  const [appBackgroundUrl, setAppBackgroundUrl] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [contactSaving, setContactSaving] = React.useState(false)
  const [signupBenefitsSaving, setSignupBenefitsSaving] = React.useState(false)
  const [signupStatsDays, setSignupStatsDays] = React.useState(30)
  const [signupStatsStartYmd, setSignupStatsStartYmd] = React.useState("")
  const [signupStatsEndYmd, setSignupStatsEndYmd] = React.useState("")
  const [signupStatsLoading, setSignupStatsLoading] = React.useState(false)
  const [signupGoalsLoading, setSignupGoalsLoading] = React.useState(false)
  const [signupGoalsSaving, setSignupGoalsSaving] = React.useState(false)
  const [signupGoalsMonth, setSignupGoalsMonth] = React.useState("")
  const [signupGoals, setSignupGoals] = React.useState<
    Array<{ storeCode: string; displayName: string; targetCount: number }>
  >([])
  const [canEditSignupGoals, setCanEditSignupGoals] = React.useState(false)
  const [signupStats, setSignupStats] = React.useState<{
    days: number | null
    startYmd: string
    endYmd: string
    monthYmd: string
    totalSignups: number
    rows: Array<{
      storeCode: string
      displayName: string
      signupCount: number
      sharePct: number
      targetCount: number
      achievementPct: number
    }>
  } | null>(null)
  const [deliverySaving, setDeliverySaving] = React.useState(false)
  const [prepayEnabled, setPrepayEnabled] = React.useState(false)
  const [prepayStoreCodesText, setPrepayStoreCodesText] = React.useState("")
  const [prepayAllPublic, setPrepayAllPublic] = React.useState(false)
  const [prepayAdminStores, setPrepayAdminStores] = React.useState<
    Array<{ storeCode: string; displayName: string; isActive?: boolean }>
  >([])
  const [prepayEnvOverride, setPrepayEnvOverride] = React.useState(false)
  const [prepaySaving, setPrepaySaving] = React.useState(false)
  const [prepayStats, setPrepayStats] = React.useState<{
    days: number
    totalOrders: number
    paidOrders: number
    expiredOrders: number
    awaitingPayment: number
    conversionRate: number
  } | null>(null)
  const [pickupMinLeadMinutes, setPickupMinLeadMinutes] = React.useState(30)
  const [pickupStoreMinLead, setPickupStoreMinLead] = React.useState<Record<string, string>>({})
  const [pickupLineNotifyEnabled, setPickupLineNotifyEnabled] = React.useState(true)
  const [pickupSaving, setPickupSaving] = React.useState(false)
  const [designSaving, setDesignSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [previewReloadKey, setPreviewReloadKey] = React.useState(0)
  const [imagePreviewNonce, setImagePreviewNonce] = React.useState(0)
  const [notice, setNotice] = React.useState("")
  const [error, setError] = React.useState("")

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await apiFetch("/api/member-portal/admin/content", { cache: "no-store" })
      const data = (await res.json()) as {
        success: boolean
        needsSetup?: boolean
        message?: string
        items?: MemberPortalContentAdminItem[]
      }
      if (!res.ok || !data.success) {
        setItems([])
        setError(data.message || t("mpAdmin_errLoadContent"))
        return
      }
      setItems(data.items || [])
      if (data.needsSetup) {
        setError(data.message || t("mpAdmin_errNeedsSetup"))
      }
    } catch {
      setError(t("mpAdmin_errLoadContent"))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [t])

  const loadContactSettings = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/contact-links", { cache: "no-store" })
      const data = (await res.json()) as {
        success: boolean
        facebookUrl?: string
        instagramUrl?: string
        lineOfficialUrl?: string
      }
      if (!res.ok || !data.success) return
      setContactFacebookUrl(String(data.facebookUrl || ""))
      setContactInstagramUrl(String(data.instagramUrl || ""))
      setContactLineOfficialUrl(String(data.lineOfficialUrl || ""))
    } catch {
      /* ignore */
    }
  }, [])

  const loadDeliverySettings = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/delivery-links", { cache: "no-store" })
      const data = (await res.json()) as {
        success: boolean
        grabUrl?: string
        linemanUrl?: string
        shopeeUrl?: string
      }
      if (!res.ok || !data.success) return
      setDeliveryGrabUrl(String(data.grabUrl || ""))
      setDeliveryLinemanUrl(String(data.linemanUrl || ""))
      setDeliveryShopeeUrl(String(data.shopeeUrl || ""))
    } catch {
      /* ignore */
    }
  }, [])

  const loadDesignSettings = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/design", { cache: "no-store" })
      const data = (await res.json()) as {
        success: boolean
        loginBackgroundUrl?: string
        appBackgroundUrl?: string
      }
      if (!res.ok || !data.success) return
      setLoginBackgroundUrl(String(data.loginBackgroundUrl || ""))
      setAppBackgroundUrl(String(data.appBackgroundUrl || ""))
    } catch {
      /* ignore */
    }
  }, [])

  const loadSignupBenefitsSettings = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/signup-benefits", { cache: "no-store" })
      const data = (await res.json()) as { success: boolean; welcomeCouponCode?: string }
      if (!res.ok || !data.success) return
      setSignupWelcomeCouponCode(String(data.welcomeCouponCode || ""))
    } catch {
      /* ignore */
    }
  }, [])

  const loadSignupStoreStats = React.useCallback(
    async (opts?: { days?: number; startYmd?: string; endYmd?: string }) => {
      setSignupStatsLoading(true)
      try {
        const q = new URLSearchParams()
        q.set("lang", lang)
        if (opts?.startYmd && opts?.endYmd) {
          q.set("startYmd", opts.startYmd)
          q.set("endYmd", opts.endYmd)
        } else {
          q.set("days", String(opts?.days ?? signupStatsDays))
        }
        const res = await apiFetch(`/api/member-portal/admin/settings/signup-stores/stats?${q.toString()}`, {
          cache: "no-store",
        })
        const data = (await res.json()) as {
          success?: boolean
          stats?: typeof signupStats
          scope?: { canEditGoals?: boolean }
        }
        if (!res.ok || !data.success || !data.stats) {
          setSignupStats(null)
          return
        }
        setSignupStats(data.stats)
        setSignupGoalsMonth(data.stats.monthYmd)
        setCanEditSignupGoals(Boolean(data.scope?.canEditGoals))
      } catch {
        setSignupStats(null)
      } finally {
        setSignupStatsLoading(false)
      }
    },
    [lang, signupStatsDays]
  )

  const loadSignupStoreGoals = React.useCallback(
    async (monthYmd?: string) => {
      const fallbackMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 7)
      const month = String(monthYmd || signupGoalsMonth || signupStats?.monthYmd || fallbackMonth).trim()
      setSignupGoalsLoading(true)
      try {
        const res = await apiFetch(
          `/api/member-portal/admin/settings/signup-stores/goals?month=${encodeURIComponent(month)}&lang=${encodeURIComponent(lang)}`,
          { cache: "no-store" }
        )
        const data = (await res.json()) as {
          success?: boolean
          goals?: typeof signupGoals
          scope?: { canEditGoals?: boolean }
        }
        if (!res.ok || !data.success) return
        setSignupGoals(data.goals || [])
        setSignupGoalsMonth(month)
        setCanEditSignupGoals(Boolean(data.scope?.canEditGoals))
      } catch {
        /* ignore */
      } finally {
        setSignupGoalsLoading(false)
      }
    },
    [lang, signupGoalsMonth, signupStats?.monthYmd]
  )

  const saveSignupStoreGoals = React.useCallback(async () => {
    if (!canEditSignupGoals) return
    setSignupGoalsSaving(true)
    setError("")
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/signup-stores/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthYmd: signupGoalsMonth,
          goals: signupGoals.map((g) => ({ storeCode: g.storeCode, targetCount: g.targetCount })),
        }),
      })
      const data = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || !data.success) {
        setError(data.message || t("mpAdmin_errSave"))
        return
      }
      setNotice(t("mpAdmin_signupStoreStatsGoalsSaved"))
      await loadSignupStoreGoals(signupGoalsMonth)
      await loadSignupStoreStats(
        signupStatsStartYmd && signupStatsEndYmd
          ? { startYmd: signupStatsStartYmd, endYmd: signupStatsEndYmd }
          : { days: signupStatsDays }
      )
    } catch {
      setError(t("mpAdmin_errSaveGeneric"))
    } finally {
      setSignupGoalsSaving(false)
    }
  }, [
    canEditSignupGoals,
    loadSignupStoreGoals,
    loadSignupStoreStats,
    signupGoals,
    signupGoalsMonth,
    signupStatsDays,
    signupStatsEndYmd,
    signupStatsStartYmd,
    t,
  ])

  const exportSignupStoreStats = React.useCallback(async () => {
    const q = new URLSearchParams()
    q.set("lang", lang)
    if (signupStatsStartYmd && signupStatsEndYmd) {
      q.set("startYmd", signupStatsStartYmd)
      q.set("endYmd", signupStatsEndYmd)
    } else {
      q.set("days", String(signupStatsDays))
    }
    const res = await apiFetch(`/api/member-portal/admin/settings/signup-stores/stats/export?${q.toString()}`, {
      cache: "no-store",
    })
    if (!res.ok) {
      setError(t("mpAdmin_errSave"))
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `member-signup-stores_${signupStats?.startYmd || "export"}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [lang, signupStats?.startYmd, signupStatsDays, signupStatsEndYmd, signupStatsStartYmd, t])

  const loadPrepaySettings = React.useCallback(async () => {
    try {
      const [prepayRes, storesRes, statsRes, pickupRes] = await Promise.all([
        apiFetch("/api/member-portal/admin/settings/prepay", { cache: "no-store" }),
        apiFetch("/api/member-portal/admin/stores", { cache: "no-store" }),
        apiFetch("/api/member-portal/admin/settings/prepay/stats?days=7", { cache: "no-store" }),
        apiFetch("/api/member-portal/admin/settings/pickup", { cache: "no-store" }),
      ])
      const data = (await prepayRes.json()) as {
        success: boolean
        enabled?: boolean
        storeCodes?: string[]
        allPublicStores?: boolean
        envOverride?: boolean
      }
      const storesData = (await storesRes.json()) as {
        success?: boolean
        stores?: Array<{ storeCode: string; displayName: string; isActive?: boolean }>
      }
      if (storesData.success) {
        setPrepayAdminStores(
          (storesData.stores || []).filter((s) => s.isActive !== false)
        )
      }
      const pickupData = (await pickupRes.json()) as {
        success?: boolean
        globalMinLeadMinutes?: number
        storeMinLeadMinutes?: Record<string, number>
        lineNotifyEnabled?: boolean
      }
      const statsData = (await statsRes.json()) as {
        success?: boolean
        stats?: typeof prepayStats
      }
      if (statsData.success && statsData.stats) setPrepayStats(statsData.stats)
      if (pickupData.success) {
        setPickupMinLeadMinutes(Number(pickupData.globalMinLeadMinutes || 30))
        setPickupLineNotifyEnabled(pickupData.lineNotifyEnabled !== false)
        const storeMap = pickupData.storeMinLeadMinutes || {}
        const nextStore: Record<string, string> = {}
        for (const [code, minutes] of Object.entries(storeMap)) {
          if (code && minutes != null) nextStore[code] = String(minutes)
        }
        setPickupStoreMinLead(nextStore)
      }
      if (!prepayRes.ok || !data.success) return
      setPrepayEnabled(Boolean(data.enabled))
      setPrepayStoreCodesText((data.storeCodes || []).join(", "))
      setPrepayAllPublic(Boolean(data.allPublicStores))
      setPrepayEnvOverride(Boolean(data.envOverride))
    } catch {
      /* ignore */
    }
  }, [])

  const prepaySelectedStoreCodes = React.useMemo(() => {
    return prepayStoreCodesText
      .split(/[,;\n]+/)
      .map((x) => x.trim())
      .filter(Boolean)
  }, [prepayStoreCodesText])

  const togglePrepayStoreCode = React.useCallback((storeCode: string) => {
    const code = String(storeCode || "").trim()
    if (!code) return
    setPrepayStoreCodesText((prev) => {
      const set = new Set(
        prev
          .split(/[,;\n]+/)
          .map((x) => x.trim())
          .filter(Boolean)
      )
      if (set.has(code)) set.delete(code)
      else set.add(code)
      return Array.from(set).join(", ")
    })
  }, [])

  React.useEffect(() => {
    refresh().catch(() => {})
    loadContactSettings().catch(() => {})
    loadDeliverySettings().catch(() => {})
    loadDesignSettings().catch(() => {})
    loadSignupBenefitsSettings().catch(() => {})
    loadSignupStoreStats().catch(() => {})
    loadSignupStoreGoals().catch(() => {})
    loadPrepaySettings().catch(() => {})
  }, [loadContactSettings, loadDeliverySettings, loadDesignSettings, loadSignupBenefitsSettings, loadSignupStoreGoals, loadSignupStoreStats, loadPrepaySettings, refresh])

  const signupStoreStatLabel = React.useCallback(
    (row: { storeCode: string; displayName: string }) => {
      if (row.storeCode === "office") return t("mpAdmin_signupStoreStatsOffice")
      if (row.storeCode === "__unset__") return t("mpAdmin_signupStoreStatsUnset")
      return row.displayName || row.storeCode
    },
    [t]
  )

  const saveContactSettings = React.useCallback(async () => {
    setContactSaving(true)
    setError("")
    setNotice("")
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/contact-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facebookUrl: contactFacebookUrl,
          instagramUrl: contactInstagramUrl,
          lineOfficialUrl: contactLineOfficialUrl,
        }),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        setError(data.message || t("mpAdmin_errContactSave"))
        return
      }
      setNotice(t("mpAdmin_noticeContactSaved"))
      await loadContactSettings()
    } catch {
      setError(t("mpAdmin_errContactSaveGeneric"))
    } finally {
      setContactSaving(false)
    }
  }, [contactFacebookUrl, contactInstagramUrl, contactLineOfficialUrl, loadContactSettings, t])

  const saveSignupBenefitsSettings = React.useCallback(async () => {
    setSignupBenefitsSaving(true)
    setError("")
    setNotice("")
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/signup-benefits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomeCouponCode: signupWelcomeCouponCode }),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        setError(data.message || t("mpAdmin_errSignupBenefitsSave"))
        return
      }
      setNotice(t("mpAdmin_noticeSignupBenefitsSaved"))
      await loadSignupBenefitsSettings()
    } catch {
      setError(t("mpAdmin_errSignupBenefitsSaveGeneric"))
    } finally {
      setSignupBenefitsSaving(false)
    }
  }, [loadSignupBenefitsSettings, signupWelcomeCouponCode, t])

  const saveDeliverySettings = React.useCallback(async () => {
    setDeliverySaving(true)
    setError("")
    setNotice("")
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/delivery-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grabUrl: deliveryGrabUrl,
          linemanUrl: deliveryLinemanUrl,
          shopeeUrl: deliveryShopeeUrl,
        }),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        setError(data.message || t("mpAdmin_errDeliverySave"))
        return
      }
      setNotice(t("mpAdmin_noticeDeliverySaved"))
      await loadDeliverySettings()
    } catch {
      setError(t("mpAdmin_errDeliverySaveGeneric"))
    } finally {
      setDeliverySaving(false)
    }
  }, [deliveryGrabUrl, deliveryLinemanUrl, deliveryShopeeUrl, loadDeliverySettings, t])

  const savePrepaySettings = React.useCallback(async () => {
    setPrepaySaving(true)
    setError("")
    setNotice("")
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/prepay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: prepayEnabled,
          storeCodesText: prepayStoreCodesText,
          allPublicStores: prepayAllPublic,
        }),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        setError(
          data.message === "prepay_env_override"
            ? t("mpAdmin_prepayEnvOverride")
            : data.message || t("mpAdmin_errPrepaySave")
        )
        return
      }
      setNotice(t("mpAdmin_noticePrepaySaved"))
      await loadPrepaySettings()
    } catch {
      setError(t("mpAdmin_errPrepaySaveGeneric"))
    } finally {
      setPrepaySaving(false)
    }
  }, [loadPrepaySettings, prepayAllPublic, prepayEnabled, prepayStoreCodesText, t])

  const savePickupSettings = React.useCallback(async () => {
    setPickupSaving(true)
    setError("")
    try {
      const storeMinLeadMinutes: Record<string, number> = {}
      for (const [code, raw] of Object.entries(pickupStoreMinLead)) {
        const trimmed = String(raw || "").trim()
        if (!trimmed) continue
        const n = Math.trunc(Number(trimmed))
        if (n >= 5 && n <= 240) storeMinLeadMinutes[code] = n
      }
      const res = await apiFetch("/api/member-portal/admin/settings/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          globalMinLeadMinutes: pickupMinLeadMinutes,
          storeMinLeadMinutes,
          lineNotifyEnabled: pickupLineNotifyEnabled,
        }),
      })
      const data = (await res.json()) as { success?: boolean }
      if (!res.ok || !data.success) {
        setError(t("mpAdmin_errPickupSave"))
        return
      }
      setNotice(t("mpAdmin_noticePickupSaved"))
      await loadPrepaySettings()
    } catch {
      setError(t("mpAdmin_errPickupSave"))
    } finally {
      setPickupSaving(false)
    }
  }, [loadPrepaySettings, pickupLineNotifyEnabled, pickupMinLeadMinutes, pickupStoreMinLead, t])

  const persistDesignSettings = React.useCallback(
    async (urls: { loginBackgroundUrl: string; appBackgroundUrl: string }) => {
      const res = await apiFetch("/api/member-portal/admin/settings/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(urls),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        throw new Error(data.message || t("mpAdmin_errDesignSave"))
      }
    },
    [t]
  )

  const saveDesignSettings = React.useCallback(async () => {
    setDesignSaving(true)
    setError("")
    setNotice("")
    try {
      await persistDesignSettings({ loginBackgroundUrl, appBackgroundUrl })
      setNotice(t("mpAdmin_noticeDesignSaved"))
      await loadDesignSettings()
      setPreviewReloadKey((k) => k + 1)
      setImagePreviewNonce((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mpAdmin_errDesignSaveGeneric"))
    } finally {
      setDesignSaving(false)
    }
  }, [appBackgroundUrl, loadDesignSettings, loginBackgroundUrl, persistDesignSettings, t])

  const uploadDesignImage = React.useCallback(async (file: File, target: "login" | "app") => {
    setUploading(true)
    setError("")
    setNotice("")
    try {
      const size = await readMemberPortalImageSize(file)
      const ruleKey = target === "login" ? "login" : "app"
      const rule = target === "login" ? MEMBER_PORTAL_CONTENT_IMAGE_RULES.login : MEMBER_PORTAL_CONTENT_IMAGE_RULES.app
      const v = validateMemberPortalImageByRule(size.width, size.height, rule, t, ruleKey)
      if (!v.ok) {
        setError(v.message)
        return
      }

      const uploaded = await uploadMemberPortalContentImageToStorage(file)
      if (!uploaded.ok) {
        setError(
          uploaded.message === "UPLOAD_PRESIGN_FAIL"
            ? t("mpAdmin_errImagePresign")
            : uploaded.message.startsWith("STORAGE_PUT_FAIL_")
              ? t("mpAdmin_errImageUpload")
              : uploaded.message || t("mpAdmin_errImageUpload")
        )
        return
      }

      const newUrl = uploaded.publicUrl || ""
      const readable = await verifyMemberPortalImagePublicUrl(newUrl)

      const nextLogin = target === "login" ? newUrl : loginBackgroundUrl
      const nextApp = target === "app" ? newUrl : appBackgroundUrl
      if (target === "login") setLoginBackgroundUrl(newUrl)
      if (target === "app") setAppBackgroundUrl(newUrl)

      await persistDesignSettings({
        loginBackgroundUrl: nextLogin,
        appBackgroundUrl: nextApp,
      })
      setImagePreviewNonce((n) => n + 1)
      setPreviewReloadKey((k) => k + 1)
      setNotice(
        readable
          ? tr(t, "mpAdmin_noticeDesignBgUploadedAndSaved", {
              target: target === "login" ? t("mpAdmin_loginBgUrl") : t("mpAdmin_appBgUrl"),
            })
          : tr(t, "mpAdmin_noticeDesignBgSavedVerifyWarn", {
              target: target === "login" ? t("mpAdmin_loginBgUrl") : t("mpAdmin_appBgUrl"),
            })
      )
      await loadDesignSettings()
    } catch (e) {
      setError(e instanceof Error ? e.message : memberPortalImageUploadCatchMessage(t, e))
    } finally {
      setUploading(false)
    }
  }, [appBackgroundUrl, loadDesignSettings, loginBackgroundUrl, persistDesignSettings, t])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <CrmSubnav />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{t("mpAdmin_pageTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("mpAdmin_pageDesc")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/qr?target=member">
                <QrCode className="mr-1.5 h-4 w-4" />
                {t("mpAdmin_qrBtn")}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => refresh()} disabled={loading}>
              {loading ? t("loading") : t("adminOpsCenterReload")}
            </Button>
          </div>
        </div>

        {!!notice && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
        )}
        {!!error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {!canEdit ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {t("mpAdmin_readOnlyNotice")}
          </div>
        ) : null}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
            <TabsList className={adminTabsListRowCn}>
            <TabsTrigger value="all" className={adminTabsTriggerCn}>
              {t("mpAdmin_tabAll")}
              {items.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {countContentForAdminTab(items, "all")}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="promo" className={adminTabsTriggerCn}>
              {t("mpAdmin_tabPromo")}
              {items.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {countContentForAdminTab(items, "promo")}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="new_menu" className={adminTabsTriggerCn}>
              {t("mpAdmin_tabNewMenu")}
              {items.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {countContentForAdminTab(items, "new_menu")}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="popup" className={adminTabsTriggerCn}>
              {t("mpAdmin_tabPopup")}
              {items.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {countContentForAdminTab(items, "popup")}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="info" className={adminTabsTriggerCn}>
              {t("mpAdmin_tabInfo")}
              {items.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {countContentForAdminTab(items, "info")}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="stores" className={adminTabsTriggerCn}>{t("mpAdmin_tabStores")}</TabsTrigger>
            <TabsTrigger value="design" className={adminTabsTriggerCn}>{t("mpAdmin_tabDesign")}</TabsTrigger>
            <TabsTrigger value="contact" className={adminTabsTriggerCn}>{t("mpAdmin_tabContact")}</TabsTrigger>
            <TabsTrigger value="delivery" className={adminTabsTriggerCn}>{t("mpAdmin_tabDelivery")}</TabsTrigger>
            </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="design" className={cn(adminTabsContentCn, "space-y-4")}>
            <CrmMemberAppPreview
              reloadKey={previewReloadKey}
              loginBackgroundUrl={loginBackgroundUrl}
              appBackgroundUrl={appBackgroundUrl}
            />
            <Card>
              <CardHeader>
                <CardTitle>{t("mpAdmin_designTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("mpAdmin_designDesc")}</p>
                <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 rounded-lg border p-3">
                    <Label>{t("mpAdmin_loginBgUrl")}</Label>
                    <Input
                      value={loginBackgroundUrl}
                      onChange={(e) => setLoginBackgroundUrl(e.target.value)}
                      placeholder="https://..."
                    />
                    <CrmImageUploadField
                      disabled={!canEdit}
                      uploading={uploading}
                      previewUrl={withMemberPortalImageCacheBust(loginBackgroundUrl, imagePreviewNonce)}
                      alt={t("mpAdmin_loginBgAlt")}
                      onFile={(file) => void uploadDesignImage(file, "login")}
                    />
                    {loginBackgroundUrl ? (
                      <img
                        src={withMemberPortalImageCacheBust(loginBackgroundUrl, imagePreviewNonce)}
                        alt={t("mpAdmin_loginBgAlt")}
                        referrerPolicy="no-referrer"
                        className="h-28 w-full rounded object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="space-y-2 rounded-lg border p-3">
                    <Label>{t("mpAdmin_appBgUrl")}</Label>
                    <Input
                      value={appBackgroundUrl}
                      onChange={(e) => setAppBackgroundUrl(e.target.value)}
                      placeholder="https://..."
                    />
                    <CrmImageUploadField
                      disabled={!canEdit}
                      uploading={uploading}
                      previewUrl={withMemberPortalImageCacheBust(appBackgroundUrl, imagePreviewNonce)}
                      alt={t("mpAdmin_appBgAlt")}
                      onFile={(file) => void uploadDesignImage(file, "app")}
                    />
                    {appBackgroundUrl ? (
                      <img
                        src={withMemberPortalImageCacheBust(appBackgroundUrl, imagePreviewNonce)}
                        alt={t("mpAdmin_appBgAlt")}
                        referrerPolicy="no-referrer"
                        className="h-28 w-full rounded object-cover"
                      />
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveDesignSettings()} disabled={designSaving || uploading || !canEdit}>
                    {designSaving ? t("mpAdmin_saving") : t("mpAdmin_designSave")}
                  </Button>
                  <Button variant="outline" onClick={() => loadDesignSettings().catch(() => {})}>
                    {t("mpAdmin_reload")}
                  </Button>
                </div>
                </fieldset>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact" className={cn(adminTabsContentCn, "space-y-4")}>
            <Card>
              <CardHeader>
                <CardTitle>{t("mpAdmin_contactTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("mpAdmin_contactDesc")}</p>
                <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Facebook URL</Label>
                    <Input
                      value={contactFacebookUrl}
                      onChange={(e) => setContactFacebookUrl(e.target.value)}
                      placeholder="https://www.facebook.com/..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Instagram URL</Label>
                    <Input
                      value={contactInstagramUrl}
                      onChange={(e) => setContactInstagramUrl(e.target.value)}
                      placeholder="https://www.instagram.com/..."
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>{t("mpAdmin_lineOfficialUrl")}</Label>
                    <Input
                      value={contactLineOfficialUrl}
                      onChange={(e) => setContactLineOfficialUrl(e.target.value)}
                      placeholder="https://line.me/R/ti/p/@..."
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveContactSettings()} disabled={contactSaving || !canEdit}>
                    {contactSaving ? t("mpAdmin_saving") : t("mpAdmin_contactSave")}
                  </Button>
                  <Button variant="outline" onClick={() => loadContactSettings().catch(() => {})}>
                    {t("mpAdmin_reload")}
                  </Button>
                </div>
                </fieldset>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("mpAdmin_welcomeCouponTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("mpAdmin_welcomeCouponDesc")}</p>
                <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
                  <div className="space-y-1.5">
                    <Label>{t("mpAdmin_welcomeCouponCode")}</Label>
                    <Input
                      value={signupWelcomeCouponCode}
                      onChange={(e) => setSignupWelcomeCouponCode(e.target.value.toUpperCase())}
                      placeholder="WELCOME100"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => saveSignupBenefitsSettings()} disabled={signupBenefitsSaving || !canEdit}>
                      {signupBenefitsSaving ? t("mpAdmin_saving") : t("mpAdmin_signupBenefitsSave")}
                    </Button>
                    <Button variant="outline" onClick={() => loadSignupBenefitsSettings().catch(() => {})}>
                      {t("mpAdmin_reload")}
                    </Button>
                  </div>
                </fieldset>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("mpAdmin_stampCardTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("crmCouponStampMovedHint")}</p>
                <Button asChild variant="outline">
                  <Link href="/admin/crm/coupons?tab=stamp">{t("crmCouponTabStamp")}</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("mpAdmin_signupStoreStatsTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("mpAdmin_signupStoreStatsDesc")}</p>
                {!canViewAllSignupStats ? (
                  <p className="text-sm text-amber-700">{t("mpAdmin_signupStoreStatsFranchiseNotice")}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-sm">{t("mpAdmin_signupStoreStatsDays")}</Label>
                  {[7, 30, 90].map((days) => (
                    <Button
                      key={days}
                      type="button"
                      size="sm"
                      variant={signupStatsDays === days && !signupStatsStartYmd ? "default" : "outline"}
                      onClick={() => {
                        setSignupStatsDays(days)
                        setSignupStatsStartYmd("")
                        setSignupStatsEndYmd("")
                        void loadSignupStoreStats({ days })
                      }}
                    >
                      {days === 7
                        ? t("mpAdmin_signupStoreStatsDays7")
                        : days === 30
                          ? t("mpAdmin_signupStoreStatsDays30")
                          : t("mpAdmin_signupStoreStatsDays90")}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={signupStatsLoading}
                    onClick={() =>
                      loadSignupStoreStats(
                        signupStatsStartYmd && signupStatsEndYmd
                          ? { startYmd: signupStatsStartYmd, endYmd: signupStatsEndYmd }
                          : { days: signupStatsDays }
                      ).catch(() => {})
                    }
                  >
                    {signupStatsLoading ? t("mpAdmin_saving") : t("mpAdmin_reload")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => exportSignupStoreStats().catch(() => {})}>
                    {t("mpAdmin_signupStoreStatsExport")}
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div className="space-y-1.5">
                    <Label>{t("mpAdmin_signupStoreStatsStart")}</Label>
                    <Input type="date" value={signupStatsStartYmd} onChange={(e) => setSignupStatsStartYmd(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("mpAdmin_signupStoreStatsEnd")}</Label>
                    <Input type="date" value={signupStatsEndYmd} onChange={(e) => setSignupStatsEndYmd(e.target.value)} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!signupStatsStartYmd || !signupStatsEndYmd || signupStatsLoading}
                    onClick={() =>
                      loadSignupStoreStats({ startYmd: signupStatsStartYmd, endYmd: signupStatsEndYmd }).catch(() => {})
                    }
                  >
                    {t("mpAdmin_signupStoreStatsApplyRange")}
                  </Button>
                </div>
                {signupStats ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {tr(t, "mpAdmin_signupStoreStatsPeriod", {
                        start: signupStats.startYmd,
                        end: signupStats.endYmd,
                      })}
                    </p>
                    <p className="text-sm font-medium">
                      {t("mpAdmin_signupStoreStatsTotal")}: {signupStats.totalSignups.toLocaleString()}
                    </p>
                    {signupStats.rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("mpAdmin_signupStoreStatsEmpty")}</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <table className="min-w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">{t("mpAdmin_signupStoreStatsStore")}</th>
                              <th className="px-3 py-2 text-left font-medium">{t("mpAdmin_signupStoreStatsCode")}</th>
                              <th className="px-3 py-2 text-right font-medium">{t("mpAdmin_signupStoreStatsCount")}</th>
                              <th className="px-3 py-2 text-right font-medium">{t("mpAdmin_signupStoreStatsTarget")}</th>
                              <th className="px-3 py-2 text-right font-medium">{t("mpAdmin_signupStoreStatsAchievement")}</th>
                              <th className="px-3 py-2 text-right font-medium">{t("mpAdmin_signupStoreStatsShare")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {signupStats.rows.map((row) => (
                              <tr key={row.storeCode} className="border-t">
                                <td className="px-3 py-2">{signupStoreStatLabel(row)}</td>
                                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                                  {row.storeCode === "__unset__" ? "—" : row.storeCode}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{row.signupCount.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{row.targetCount.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{row.achievementPct.toFixed(1)}%</td>
                                <td className="px-3 py-2 text-right tabular-nums">{row.sharePct.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : signupStatsLoading ? (
                  <p className="text-sm text-muted-foreground">{t("mpAdmin_saving")}</p>
                ) : null}
                <div className="border-t pt-4 space-y-3">
                  <div>
                    <p className="font-medium">{t("mpAdmin_signupStoreStatsGoalsTitle")}</p>
                    <p className="text-sm text-muted-foreground">{t("mpAdmin_signupStoreStatsGoalsDesc")}</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1.5">
                      <Label>{t("mpAdmin_signupStoreStatsGoalsMonth")}</Label>
                      <Input
                        type="month"
                        value={signupGoalsMonth}
                        onChange={(e) => setSignupGoalsMonth(e.target.value)}
                      />
                    </div>
                    <Button type="button" variant="outline" disabled={signupGoalsLoading} onClick={() => loadSignupStoreGoals(signupGoalsMonth).catch(() => {})}>
                      {signupGoalsLoading ? t("mpAdmin_saving") : t("mpAdmin_reload")}
                    </Button>
                    {canEditSignupGoals ? (
                      <Button type="button" disabled={signupGoalsSaving} onClick={() => saveSignupStoreGoals().catch(() => {})}>
                        {signupGoalsSaving ? t("mpAdmin_saving") : t("mpAdmin_signupStoreStatsGoalsSave")}
                      </Button>
                    ) : null}
                  </div>
                  {signupGoals.length > 0 ? (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="min-w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">{t("mpAdmin_signupStoreStatsStore")}</th>
                            <th className="px-3 py-2 text-right font-medium">{t("mpAdmin_signupStoreStatsTarget")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {signupGoals.map((row) => (
                            <tr key={row.storeCode} className="border-t">
                              <td className="px-3 py-2">{signupStoreStatLabel(row)}</td>
                              <td className="px-3 py-2 text-right">
                                {canEditSignupGoals ? (
                                  <Input
                                    type="number"
                                    min={0}
                                    className="ml-auto w-28 text-right"
                                    value={row.targetCount}
                                    onChange={(e) => {
                                      const n = Math.max(0, Math.trunc(Number(e.target.value || 0)))
                                      setSignupGoals((prev) =>
                                        prev.map((g) => (g.storeCode === row.storeCode ? { ...g, targetCount: n } : g))
                                      )
                                    }}
                                  />
                                ) : (
                                  <span className="tabular-nums">{row.targetCount.toLocaleString()}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="delivery" className={cn(adminTabsContentCn, "space-y-4")}>
            <Card>
              <CardHeader>
                <CardTitle>{t("mpAdmin_deliveryTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("mpAdmin_deliveryDesc")}</p>
                <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label>GrabFood URL</Label>
                    <Input
                      value={deliveryGrabUrl}
                      onChange={(e) => setDeliveryGrabUrl(e.target.value)}
                      placeholder="https://food.grab.com/..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>LINE MAN URL</Label>
                    <Input
                      value={deliveryLinemanUrl}
                      onChange={(e) => setDeliveryLinemanUrl(e.target.value)}
                      placeholder="https://lineman.line.me/..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ShopeeFood URL</Label>
                    <Input
                      value={deliveryShopeeUrl}
                      onChange={(e) => setDeliveryShopeeUrl(e.target.value)}
                      placeholder="https://shopeefood.th/..."
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveDeliverySettings()} disabled={deliverySaving || !canEdit}>
                    {deliverySaving ? t("mpAdmin_saving") : t("mpAdmin_deliverySave")}
                  </Button>
                  <Button variant="outline" onClick={() => loadDeliverySettings().catch(() => {})}>
                    {t("mpAdmin_reload")}
                  </Button>
                </div>
                </fieldset>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("mpAdmin_prepayTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("mpAdmin_prepayDesc")}</p>
                {prepayStats ? (
                  <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">{t("mpAdmin_prepayStatsTotal")}</p>
                      <p className="font-semibold">{prepayStats.totalOrders}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("mpAdmin_prepayStatsPaid")}</p>
                      <p className="font-semibold">{prepayStats.paidOrders}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("mpAdmin_prepayStatsExpired")}</p>
                      <p className="font-semibold">{prepayStats.expiredOrders}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("mpAdmin_prepayStatsConversion")}</p>
                      <p className="font-semibold">{prepayStats.conversionRate}%</p>
                    </div>
                  </div>
                ) : null}
                {prepayEnvOverride ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {t("mpAdmin_prepayEnvOverride")}
                  </div>
                ) : null}
                <fieldset disabled={!canEdit || prepayEnvOverride} className="space-y-4 disabled:opacity-60">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={prepayEnabled}
                      onChange={(e) => setPrepayEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {t("mpAdmin_prepayEnabled")}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={prepayAllPublic}
                      onChange={(e) => setPrepayAllPublic(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {t("mpAdmin_prepayAllPublic")}
                  </label>
                  <div className="space-y-1.5">
                    <Label>{t("mpAdmin_prepayStoreCodes")}</Label>
                    <Input
                      value={prepayStoreCodesText}
                      onChange={(e) => setPrepayStoreCodesText(e.target.value)}
                      placeholder={t("mpAdmin_prepayStoreCodesPh")}
                      disabled={prepayAllPublic}
                    />
                    {prepayAdminStores.length > 0 ? (
                      <div className="space-y-2 pt-1">
                        <p className="text-xs text-muted-foreground">{t("mpAdmin_prepayStorePickHint")}</p>
                        <div className="flex flex-wrap gap-2">
                          {prepayAdminStores.map((store) => {
                            const selected = prepaySelectedStoreCodes.includes(store.storeCode)
                            return (
                              <button
                                key={store.storeCode}
                                type="button"
                                disabled={prepayAllPublic}
                                onClick={() => togglePrepayStoreCode(store.storeCode)}
                                className={`rounded-full border px-3 py-1 text-xs transition ${
                                  selected
                                    ? "border-amber-500 bg-amber-50 text-amber-900"
                                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                                } disabled:cursor-not-allowed disabled:opacity-50`}
                              >
                                {store.displayName || store.storeCode}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => savePrepaySettings()} disabled={prepaySaving || !canEdit || prepayEnvOverride}>
                      {prepaySaving ? t("mpAdmin_saving") : t("mpAdmin_prepaySave")}
                    </Button>
                    <Button variant="outline" onClick={() => loadPrepaySettings().catch(() => {})}>
                      {t("mpAdmin_reload")}
                    </Button>
                  </div>
                </fieldset>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("mpAdmin_pickupTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("mpAdmin_pickupDesc")}</p>
                <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
                  <div className="space-y-1.5">
                    <Label>{t("mpAdmin_pickupMinLead")}</Label>
                    <Input
                      type="number"
                      min={5}
                      max={240}
                      value={pickupMinLeadMinutes}
                      onChange={(e) => setPickupMinLeadMinutes(Number(e.target.value || 30))}
                    />
                  </div>
                  {prepayAdminStores.length > 0 ? (
                    <div className="space-y-2">
                      <Label>{t("mpAdmin_pickupStoreOverrides")}</Label>
                      <p className="text-xs text-muted-foreground">{t("mpAdmin_pickupStoreOverridesHint")}</p>
                      <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                        {prepayAdminStores.map((store) => (
                          <div key={store.storeCode} className="flex items-center gap-2 text-sm">
                            <span className="min-w-0 flex-1 truncate font-medium">{store.displayName}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{store.storeCode}</span>
                            <Input
                              type="number"
                              min={5}
                              max={240}
                              className="h-8 w-20 shrink-0"
                              placeholder={String(pickupMinLeadMinutes)}
                              value={pickupStoreMinLead[store.storeCode] ?? ""}
                              onChange={(e) =>
                                setPickupStoreMinLead((prev) => ({
                                  ...prev,
                                  [store.storeCode]: e.target.value,
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pickupLineNotifyEnabled}
                      onChange={(e) => setPickupLineNotifyEnabled(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300"
                    />
                    <span>
                      <span className="font-medium">{t("mpAdmin_pickupLineNotify")}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t("mpAdmin_pickupLineNotifyDesc")}
                      </span>
                    </span>
                  </label>
                  <Button onClick={() => savePickupSettings()} disabled={pickupSaving || !canEdit}>
                    {pickupSaving ? t("mpAdmin_saving") : t("mpAdmin_pickupSave")}
                  </Button>
                </fieldset>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all" className={cn(adminTabsContentCn, "space-y-4")}>
            <MemberPortalContentAdminPanel
              variant="all"
              items={items}
              loading={loading}
              canEdit={canEdit}
              onSaved={refresh}
              onNotice={setNotice}
              onError={setError}
            />
          </TabsContent>

          <TabsContent value="promo" className={cn(adminTabsContentCn, "space-y-4")}>
            <MemberPortalContentAdminPanel
              variant="promo"
              items={items}
              loading={loading}
              canEdit={canEdit}
              onSaved={refresh}
              onNotice={setNotice}
              onError={setError}
            />
          </TabsContent>

          <TabsContent value="new_menu" className={cn(adminTabsContentCn, "space-y-4")}>
            <MemberPortalContentAdminPanel
              variant="new_menu"
              items={items}
              loading={loading}
              canEdit={canEdit}
              onSaved={refresh}
              onNotice={setNotice}
              onError={setError}
            />
          </TabsContent>

          <TabsContent value="popup" className={cn(adminTabsContentCn, "space-y-4")}>
            <MemberPortalContentAdminPanel
              variant="popup"
              items={items}
              loading={loading}
              canEdit={canEdit}
              onSaved={refresh}
              onNotice={setNotice}
              onError={setError}
            />
          </TabsContent>

          <TabsContent value="info" className={cn(adminTabsContentCn, "space-y-4")}>
            <MemberPortalContentAdminPanel
              variant="info"
              items={items}
              loading={loading}
              canEdit={canEdit}
              onSaved={refresh}
              onNotice={setNotice}
              onError={setError}
            />
          </TabsContent>

          <TabsContent value="stores" className={cn(adminTabsContentCn, "space-y-4")}>
            <MemberPortalStoresPanel
              canEdit={canEdit}
              onNotice={(msg) => {
                setNotice(msg)
                setError("")
              }}
              onError={(msg) => {
                setError(msg)
                setNotice("")
              }}
            />
          </TabsContent>

        </Tabs>
      </div>
    </div>
  )
}


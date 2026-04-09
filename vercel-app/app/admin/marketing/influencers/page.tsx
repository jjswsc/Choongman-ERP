"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { Users, Save, Plus, Trash2, LayoutGrid, X, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMarketingInfluencers,
  getMarketingCampaigns,
  getPosMenus,
  saveMarketingInfluencer,
  saveMarketingCampaignDesignDates,
  deleteMarketingInfluencer,
  useStoreList,
  type MarketingInfluencer,
  type MarketingCampaign,
  type PosMenu,
  type InfluencerProvidedMenuSnapshot,
} from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"
import { MarketingHubCampaignContextStrip } from "@/components/marketing/marketing-hub-campaign-context-strip"
import { MarketingInfluencersOverviewTab } from "@/components/marketing/marketing-influencers-overview-tab"
import { MarketingInfluencersDirectoryTab } from "@/components/marketing/marketing-influencers-directory-tab"
import { MarketingLinkedCampaignStrip } from "@/components/marketing/marketing-linked-campaign-strip"
import { MarketingHubRecordScheduleCard } from "@/components/marketing/marketing-hub-record-schedule-card"

const HIRE_TYPE_OPTIONS = [
  { value: "pay", labelKey: "marketingHireTypePay" as const },
  { value: "free", labelKey: "marketingHireTypeFree" as const },
]

const PLATFORM_KEYS = ["instagram", "facebook", "tiktok", "youtube", "lemon8"] as const

function posMenuMainCategory(m: PosMenu, otherLabel: string): string {
  const c = (m.categoryMain || m.category || "").trim()
  return c || otherLabel
}

function normalizeProvidedMenusFromApi(
  rows: InfluencerProvidedMenuSnapshot[] | undefined,
  otherLabel: string,
  menuById: Map<string, PosMenu>
): InfluencerProvidedMenuSnapshot[] {
  if (!Array.isArray(rows) || !rows.length) return []
  return rows.map((pm) => {
    const live = menuById.get(String(pm.id))
    const cat =
      (pm.categoryMain || "").trim() ||
      (live ? posMenuMainCategory(live, otherLabel) : "")
    return {
      id: String(pm.id),
      code: pm.code ?? "",
      name: pm.name ?? "",
      price: Number(pm.price) || 0,
      quantity: Math.max(1, Math.floor(Number(pm.quantity) || 1)),
      categoryMain: cat,
    }
  })
}

function parseFollowers(s: string): number {
  const t = String(s || "").trim().toUpperCase()
  if (!t) return 0
  const m = t.match(/^([\d.]+)\s*([KM])?$/i)
  if (!m) return 0
  let n = parseFloat(m[1])
  if (m[2] === "K") n *= 1000
  else if (m[2] === "M") n *= 1000000
  return Math.floor(n)
}

function getCpf(budget: number, followersStr: string): number | null {
  const f = parseFollowers(followersStr)
  if (f <= 0 || budget <= 0) return null
  return budget / f
}

type MainTab = "compose" | "inquiry" | "directory"

export default function MarketingInfluencersPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""
  const { auth } = useAuth()
  const { stores, loading: storesLoading } = useStoreList()
  const [mainTab, setMainTab] = React.useState<MainTab>("compose")
  const [inquirySearchApplyToken, setInquirySearchApplyToken] = React.useState(0)
  const [inquirySearchApplyQuery, setInquirySearchApplyQuery] = React.useState("")
  const [list, setList] = React.useState<MarketingInfluencer[]>([])
  const [allInfs, setAllInfs] = React.useState<MarketingInfluencer[]>([])
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)
  const [inquiryLoading, setInquiryLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [sortBy, setSortBy] = React.useState<"name" | "cpf">("name")
  const [posMenus, setPosMenus] = React.useState<PosMenu[]>([])
  const [posMenusLoading, setPosMenusLoading] = React.useState(false)
  const [menuPickerValue, setMenuPickerValue] = React.useState("")
  const [menuCategoryKey, setMenuCategoryKey] = React.useState("")
  const [menuSearchDraft, setMenuSearchDraft] = React.useState("")
  const [form, setForm] = React.useState({
    campaignId: "",
    name: "",
    contactName: "",
    contactPhone: "",
    providedMenus: [] as InfluencerProvidedMenuSnapshot[],
    followers: "",
    contentFormat: "",
    contentTopic: "",
    status: "finish",
    branchReview: "",
    hireType: "pay",
    budget: "",
    actualCost: "",
    shootingDate: "",
    publishDate: "",
    instagram: "",
    facebook: "",
    tiktok: "",
    youtube: "",
    lemon8: "",
    note: "",
  })
  const [hubDesignStart, setHubDesignStart] = React.useState("")
  const [hubDesignEnd, setHubDesignEnd] = React.useState("")

  const posMenuById = React.useMemo(() => {
    const m = new Map<string, PosMenu>()
    for (const x of posMenus) m.set(String(x.id), x)
    return m
  }, [posMenus])

  const menuCategoryOther = t("marketingInfluencersMenuCategoryOther")

  const posMenuMainCategories = React.useMemo(() => {
    const set = new Set<string>()
    for (const m of posMenus) set.add(posMenuMainCategory(m, menuCategoryOther))
    return [...set].sort((a, b) => a.localeCompare(b, "ko"))
  }, [posMenus, menuCategoryOther])

  const posMenusForPicker = React.useMemo(() => {
    const q = menuSearchDraft.trim().toLowerCase()
    let rows = posMenus
    if (menuCategoryKey) {
      rows = rows.filter((m) => posMenuMainCategory(m, menuCategoryOther) === menuCategoryKey)
    }
    if (q) {
      rows = rows.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) || (m.code || "").toLowerCase().includes(q)
      )
    }
    return [...rows].sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"))
  }, [posMenus, menuCategoryKey, menuSearchDraft, menuCategoryOther])

  const providedMenusTotals = React.useMemo(() => {
    let qty = 0
    let amount = 0
    for (const m of form.providedMenus) {
      const q = Math.max(1, Math.floor(Number(m.quantity) || 1))
      const p = Number(m.price) || 0
      qty += q
      amount += p * q
    }
    return { qty, amount }
  }, [form.providedMenus])

  React.useEffect(() => {
    if (mainTab !== "compose") return
    let cancelled = false
    setPosMenusLoading(true)
    getPosMenus()
      .then((rows: PosMenu[]) => {
        if (!cancelled) setPosMenus(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setPosMenus([])
      })
      .finally(() => {
        if (!cancelled) setPosMenusLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mainTab])

  const formatInfPeriodLine = React.useCallback((shooting: string | null | undefined, publish: string | null | undefined) => {
    const a = (shooting || "").trim()
    const b = (publish || "").trim()
    if (!a && !b) return ""
    if (a && b) return `${a} ~ ${b}`
    if (a) return `${a} ~`
    return `~ ${b}`
  }, [])

  const loadData = React.useCallback(() => {
    const cid = campaignFilter.trim()
    setLoading(true)
    return Promise.all([
      cid ? getMarketingInfluencers({ campaignId: cid }) : Promise.resolve([] as MarketingInfluencer[]),
      getMarketingCampaigns(),
    ])
      .then(([infs, camps]) => {
        setList(infs)
        setCampaigns(camps)
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [campaignFilter])

  const loadInquiryInfs = React.useCallback(async () => {
    setInquiryLoading(true)
    try {
      const [infs, camps] = await Promise.all([getMarketingInfluencers(), getMarketingCampaigns()])
      setAllInfs(infs)
      setCampaigns(camps)
    } catch {
      setAllInfs([])
    } finally {
      setInquiryLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    if (mainTab === "inquiry" || mainTab === "directory") void loadInquiryInfs()
  }, [mainTab, loadInquiryInfs])

  const inquiryApplySearch = React.useMemo(
    () => ({ token: inquirySearchApplyToken, query: inquirySearchApplyQuery }),
    [inquirySearchApplyToken, inquirySearchApplyQuery]
  )

  const openInquiryWithNameSearch = React.useCallback((name: string) => {
    setInquirySearchApplyQuery(name)
    setInquirySearchApplyToken((t) => t + 1)
    setMainTab("inquiry")
  }, [])

  React.useEffect(() => {
    if (!campaignIdFromQuery) return
    setCampaignFilter(campaignIdFromQuery)
    setForm((f) => ({ ...f, campaignId: campaignIdFromQuery }))
  }, [campaignIdFromQuery])

  /** 캠페인만 바꿔도 저장 폼의 캠페인이 맞게 따라가도록 (신규 등록 중일 때만) */
  React.useEffect(() => {
    if (editingId != null) return
    const cid = campaignFilter.trim()
    if (!cid) return
    setForm((f) => (f.campaignId === cid ? f : { ...f, campaignId: cid }))
  }, [campaignFilter, editingId])

  const refreshAllLists = React.useCallback(async () => {
    await loadData()
    await loadInquiryInfs()
  }, [loadData, loadInquiryInfs])

  const campaignById = React.useMemo(() => {
    const m = new Map<string, MarketingCampaign>()
    for (const c of campaigns) m.set(String(c.id), c)
    return m
  }, [campaigns])

  const campaignLabel = React.useCallback(
    (id: string | null | undefined) => {
      if (!id) return ""
      const c = campaignById.get(String(id))
      if (!c) return ""
      return `${c.campaignNo ? `[${c.campaignNo}] ` : ""}${c.topic}`
    },
    [campaignById]
  )
  const activeCampaign = React.useMemo(() => {
    const cid = (form.campaignId || campaignFilter).trim()
    return cid ? campaignById.get(cid) : undefined
  }, [campaignById, form.campaignId, campaignFilter])

  React.useEffect(() => {
    setHubDesignStart((activeCampaign?.designStartDate ?? "").trim())
    setHubDesignEnd((activeCampaign?.designEndDate ?? "").trim())
  }, [activeCampaign?.id, activeCampaign?.designStartDate, activeCampaign?.designEndDate])

  const todayBangkokYmd = React.useMemo(
    () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }),
    []
  )
  const designOutOfRange = React.useMemo(() => {
    const s = (hubDesignStart.trim() || (activeCampaign?.designStartDate ?? "")).trim()
    const e = (hubDesignEnd.trim() || (activeCampaign?.designEndDate ?? "")).trim()
    if (!s || !e) return false
    return todayBangkokYmd < s || todayBangkokYmd > e
  }, [hubDesignStart, hubDesignEnd, activeCampaign, todayBangkokYmd])

  const campaignStatusLabel = React.useCallback(
    (status: string) => {
      switch (status) {
        case "draft":
          return t("marketingAdsStatusDraft")
        case "ongoing":
          return t("marketingAdsStatusOngoing")
        case "finish":
          return t("marketingAdsStatusFinish")
        default:
          return status
      }
    },
    [t]
  )

  const campaignStatusBadgeClass = (status: string) => {
    switch (status) {
      case "ongoing":
        return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-200"
      case "finish":
        return "bg-muted text-muted-foreground"
      case "draft":
        return "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100"
      default:
        return "bg-border text-foreground"
    }
  }

  const addProvidedMenuById = React.useCallback(
    (menuId: string) => {
      const m = posMenuById.get(menuId)
      if (!m) return
      const cat = posMenuMainCategory(m, menuCategoryOther)
      setForm((f) => {
        const idx = f.providedMenus.findIndex((x) => x.id === menuId)
        if (idx >= 0) {
          const next = [...f.providedMenus]
          const cur = next[idx]!
          const q = Math.max(1, Math.floor(Number(cur.quantity) || 1))
          next[idx] = { ...cur, quantity: q + 1 }
          return { ...f, providedMenus: next }
        }
        const snap: InfluencerProvidedMenuSnapshot = {
          id: String(m.id),
          code: m.code || "",
          name: m.name || "",
          price: Number(m.price) || 0,
          quantity: 1,
          categoryMain: cat,
        }
        return { ...f, providedMenus: [...f.providedMenus, snap] }
      })
    },
    [posMenuById, menuCategoryOther]
  )

  const setProvidedMenuQuantity = React.useCallback((menuId: string, raw: string) => {
    const n = Math.floor(Number(raw))
    const q = Number.isFinite(n) && n >= 1 ? n : 1
    setForm((f) => ({
      ...f,
      providedMenus: f.providedMenus.map((x) => (x.id === menuId ? { ...x, quantity: q } : x)),
    }))
  }, [])

  const removeProvidedMenuById = React.useCallback((menuId: string) => {
    setForm((f) => ({ ...f, providedMenus: f.providedMenus.filter((x) => x.id !== menuId) }))
  }, [])

  const handleNew = () => {
    setEditingId(null)
    setMenuCategoryKey("")
    setMenuSearchDraft("")
    setMenuPickerValue("")
    setForm({
      campaignId: campaignFilter || "",
      name: "",
      contactName: "",
      contactPhone: "",
      providedMenus: [],
      followers: "",
      contentFormat: "",
      contentTopic: "",
      status: "finish",
      branchReview: "",
      hireType: "pay",
      budget: "",
      actualCost: "",
      shootingDate: "",
      publishDate: "",
      instagram: "",
      facebook: "",
      tiktok: "",
      youtube: "",
      lemon8: "",
      note: "",
    })
  }

  const handleEdit = (i: MarketingInfluencer) => {
    if (i.campaignId) setCampaignFilter(String(i.campaignId))
    setEditingId(i.id)
    const links = i.platformLinks || {}
    setForm({
      campaignId: i.campaignId || "",
      name: i.name || "",
      contactName: (i.contactName ?? "").trim(),
      contactPhone: (i.contactPhone ?? "").trim(),
      providedMenus: normalizeProvidedMenusFromApi(
        i.providedMenus,
        t("marketingInfluencersMenuCategoryOther"),
        posMenuById
      ),
      followers: i.followers || "",
      contentFormat: i.contentFormat || "",
      contentTopic: i.contentTopic || "",
      status: i.status || "finish",
      branchReview: i.branchReview || "",
      hireType: i.hireType || "pay",
      budget: String(i.budget ?? ""),
      actualCost: String(i.actualCost ?? ""),
      shootingDate: i.shootingDate || "",
      publishDate: i.publishDate || "",
      instagram: links.instagram || "",
      facebook: links.facebook || "",
      tiktok: links.tiktok || "",
      youtube: links.youtube || "",
      lemon8: links.lemon8 || "",
      note: i.note || "",
    })
  }

  const openInfInCompose = (i: MarketingInfluencer) => {
    setMainTab("compose")
    if (i.campaignId) setCampaignFilter(String(i.campaignId))
    handleEdit(i)
    requestAnimationFrame(() => {
      document.getElementById("marketing-influencer-compose-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const handleComposeQuickEdit = (i: MarketingInfluencer) => {
    setMainTab("compose")
    if (i.campaignId) setCampaignFilter(String(i.campaignId))
    handleEdit(i)
  }

  const handleSave = async () => {
    if (!form.campaignId.trim()) {
      await appAlert(t("marketingAlertSelectCampaignHubToSave"))
      return
    }
    const name = form.name.trim()
    if (!name) {
      await appAlert(t("marketingAlertEnterName"))
      return
    }
    setSaving(true)
    try {
      const cid = form.campaignId.trim()
      if (activeCampaign?.id && cid === activeCampaign.id) {
        const norm = (s: string) => s.trim()
        const dDirty =
          norm(hubDesignStart) !== norm(activeCampaign.designStartDate ?? "") ||
          norm(hubDesignEnd) !== norm(activeCampaign.designEndDate ?? "")
        if (dDirty) {
          const dr = await saveMarketingCampaignDesignDates({
            campaignId: cid,
            designStartDate: norm(hubDesignStart) || null,
            designEndDate: norm(hubDesignEnd) || null,
          })
          if (!dr.success) {
            await appAlert(dr.message || t("marketingCollabDetailSaveError"))
            return
          }
          refreshAllLists()
        }
      }

      const platformLinks: Record<string, string> = {}
      if (form.instagram.trim()) platformLinks.instagram = form.instagram.trim()
      if (form.facebook.trim()) platformLinks.facebook = form.facebook.trim()
      if (form.tiktok.trim()) platformLinks.tiktok = form.tiktok.trim()
      if (form.youtube.trim()) platformLinks.youtube = form.youtube.trim()
      if (form.lemon8.trim()) platformLinks.lemon8 = form.lemon8.trim()

      const res = await saveMarketingInfluencer({
        id: editingId ?? undefined,
        campaignId: form.campaignId.trim() || null,
        name,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        providedMenus: form.providedMenus,
        followers: form.followers.trim(),
        contentFormat: form.contentFormat.trim(),
        contentTopic: form.contentTopic.trim(),
        status: form.status,
        branchReview: form.branchReview.trim(),
        hireType: form.hireType,
        budget: Number(form.budget) || 0,
        actualCost: Number(form.actualCost) || 0,
        shootingDate: form.shootingDate.trim() || null,
        publishDate: form.publishDate.trim() || null,
        platformLinks: Object.keys(platformLinks).length > 0 ? platformLinks : undefined,
        note: form.note.trim(),
        userRole: auth?.role,
        userName: auth?.user,
        userStore: auth?.store,
      })
      if (res.success) {
        const extra = res.expenseSyncMessage ? `\n\n${res.expenseSyncMessage}` : ""
        await appAlert((t("itemsAlertSaved") || "저장되었습니다.") + extra)
        refreshAllLists()
        handleNew()
      } else {
        await appAlert(res.message)
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (i: MarketingInfluencer) => {
    if (!(await appConfirm(`"${i.name}" ${t("posMenuConfirmDelete") || "삭제하시겠습니까?"}`))) return
    const res = await deleteMarketingInfluencer({ id: i.id })
    if (res.success) {
      refreshAllLists()
      if (editingId === i.id) handleNew()
    } else {
      await appAlert(res.message)
    }
  }

  return (
    <MarketingPageShell maxWidthClass="max-w-6xl">
        <MarketingPageHero icon={Users} title={t("adminMarketingInfluencers")} />
        {campaignIdFromQuery && (
          <div className="mb-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground/90">
            {t("marketingHubFilteredAutoLinkNew")}
          </div>
        )}

        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)} className={adminTabsRootCn}>
          <div className={cn(adminTabsBarCn, "px-2 py-2.5 sm:px-4")}>
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="compose" className={adminTabsTriggerCn}>
                  {t("marketingInfluencersTabCompose")}
                </TabsTrigger>
                <TabsTrigger value="inquiry" className={adminTabsTriggerCn}>
                  {t("marketingInfluencersTabInquiry")}
                </TabsTrigger>
                <TabsTrigger value="directory" className={adminTabsTriggerCn}>
                  {t("marketingInfluencersTabDirectory")}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <MarketingHubCampaignContextStrip
            value={campaignFilter}
            onChange={setCampaignFilter}
            campaigns={campaigns}
            onRefresh={refreshAllLists}
            maxListHeightClass="max-h-52"
            disabled={loading}
          />

          <TabsContent value="compose" className={adminTabsContentCn}>
            {loading && (
              <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t("loading")}</div>
            )}

            <div className="space-y-4">
              {!campaignFilter.trim() && (
                <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("marketingSelectCampaignForFormBelow")}
                </p>
              )}
              {(editingId !== null || Boolean(campaignFilter.trim())) && (
                <Card
                  id="marketing-influencer-compose-anchor"
                  className="overflow-hidden border-primary/15 shadow-md ring-1 ring-primary/5"
                >
                  <CardHeader className="border-b border-border/60 bg-gradient-to-r from-muted/40 to-transparent py-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Pencil className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-base">
                        {editingId ? t("marketingInfluencerFormTitleEdit") : t("marketingInfluencerFormTitleNew")}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                  {form.campaignId.trim() ? (
                    <MarketingLinkedCampaignStrip
                      label={t("marketingAdsOptionsLinkedCampaign")}
                      title={campaignLabel(form.campaignId) || form.campaignId}
                    />
                  ) : (
                    <div className="mb-1 rounded-lg border-2 border-dashed border-amber-500/50 bg-amber-500/[0.08] px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/25 dark:text-amber-100">
                      {t("marketingAdsEmptyNeedCampaign")}
                    </div>
                  )}
                  <MarketingHubRecordScheduleCard
                    disabled={saving}
                    designOutOfRange={designOutOfRange}
                    campaignId={form.campaignId}
                    hubDesignStartDate={hubDesignStart}
                    hubDesignEndDate={hubDesignEnd}
                    onHubDesignStartDateChange={setHubDesignStart}
                    onHubDesignEndDateChange={setHubDesignEnd}
                    executionTitle={t("marketingRecordPeriodTitle")}
                    executionNote={<span>{t("marketingInfluencerPeriodNote")}</span>}
                    executionFromLabel={t("marketingRecordPeriodFrom")}
                    executionToLabel={t("marketingRecordPeriodTo")}
                    executionFromValue={form.shootingDate}
                    executionToValue={form.publishDate}
                    onExecutionFromChange={(v) => setForm((f) => ({ ...f, shootingDate: v }))}
                    onExecutionToChange={(v) => setForm((f) => ({ ...f, publishDate: v }))}
                  />
                  {designOutOfRange ? (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">{t("marketingDesignTodayOutsidePeriod")}</p>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted-foreground">{t("marketingInfluencersFieldSocialId")} *</label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="@j.chachaa"
                        className="mt-1"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">{t("marketingInfluencersFieldSocialIdHint")}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{t("marketingInfluencersFieldContactName")}</label>
                      <Input
                        value={form.contactName}
                        onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{t("marketingInfluencersFieldContactPhone")}</label>
                      <Input
                        value={form.contactPhone}
                        onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                        type="tel"
                        inputMode="tel"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{t("marketingFieldFollowers")}</label>
                      <Input
                        value={form.followers}
                        onChange={(e) => setForm((f) => ({ ...f, followers: e.target.value }))}
                        placeholder="181.4K"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{t("marketingInfluencersFieldStore")}</label>
                      <select
                        value={form.branchReview}
                        onChange={(e) => setForm((f) => ({ ...f, branchReview: e.target.value }))}
                        disabled={storesLoading}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm disabled:opacity-60"
                      >
                        <option value="">{t("marketingInfluencersStorePlaceholder")}</option>
                        {stores.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2 space-y-3 rounded-lg border border-border/60 bg-muted/15 p-3">
                      <div>
                        <label className="text-xs font-medium text-foreground">{t("marketingInfluencersFieldProvidedMenus")}</label>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{t("marketingInfluencersProvidedMenusPriceNote")}</p>
                      </div>
                      {posMenusLoading ? (
                        <p className="text-xs text-muted-foreground">{t("marketingInfluencersPosMenusLoading")}</p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">{t("marketingInfluencersProvidedMenusCategory")}</Label>
                            <select
                              value={menuCategoryKey}
                              onChange={(e) => setMenuCategoryKey(e.target.value)}
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                            >
                              <option value="">{t("marketingInfluencersProvidedMenusCategoryAll")}</option>
                              {posMenuMainCategories.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                            <Label className="text-[10px] text-muted-foreground">{t("search")}</Label>
                            <Input
                              className="h-9"
                              value={menuSearchDraft}
                              onChange={(e) => setMenuSearchDraft(e.target.value)}
                              placeholder={t("marketingInfluencersProvidedMenusSearchPh")}
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                            <Label className="text-[10px] text-muted-foreground">{t("marketingInfluencersProvidedMenusPick")}</Label>
                            <select
                              value={menuPickerValue}
                              onChange={(e) => {
                                const v = e.target.value
                                setMenuPickerValue("")
                                if (v) addProvidedMenuById(v)
                              }}
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                            >
                              <option value="">{t("marketingInfluencersProvidedMenusPick")}</option>
                              {posMenusForPicker.map((m) => (
                                <option key={m.id} value={m.id}>
                                  [{posMenuMainCategory(m, menuCategoryOther)}] {m.name} — ฿
                                  {Number(m.price || 0).toLocaleString()}
                                  {!m.isActive ? ` (${t("marketingInfluencersMenuInactive")})` : ""}
                                </option>
                              ))}
                            </select>
                            {!posMenusForPicker.length && posMenus.length > 0 ? (
                              <p className="text-[10px] text-muted-foreground">{t("marketingInfluencersProvidedMenusNoMatch")}</p>
                            ) : null}
                          </div>
                        </div>
                      )}
                      {form.providedMenus.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t("marketingInfluencersProvidedMenusEmpty")}</p>
                      ) : (
                        <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
                          <table className="w-full min-w-[420px] border-collapse text-xs">
                            <thead>
                              <tr className="border-b bg-muted/40 text-left text-[10px] font-medium text-muted-foreground">
                                <th className="px-2 py-2">{t("marketingInfluencersFieldProvidedMenus")}</th>
                                <th className="whitespace-nowrap px-2 py-2">{t("marketingInfluencersProvidedMenusUnitPrice")}</th>
                                <th className="whitespace-nowrap px-2 py-2">{t("marketingInfluencersProvidedMenusQty")}</th>
                                <th className="whitespace-nowrap px-2 py-2 text-right">{t("marketingInfluencersProvidedMenusLineTotal")}</th>
                                <th className="w-10 px-1 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {form.providedMenus.map((m) => {
                                const q = Math.max(1, Math.floor(Number(m.quantity) || 1))
                                const unit = Number(m.price) || 0
                                const line = unit * q
                                return (
                                  <tr key={m.id} className="border-b border-border/30 last:border-0">
                                    <td className="px-2 py-2 align-middle">
                                      <div className="font-medium text-foreground">{m.name}</div>
                                      {(m.categoryMain || "").trim() ? (
                                        <div className="text-[10px] text-muted-foreground">{m.categoryMain}</div>
                                      ) : null}
                                    </td>
                                    <td className="px-2 py-2 align-middle tabular-nums text-muted-foreground">
                                      ฿{unit.toLocaleString()}
                                    </td>
                                    <td className="px-2 py-2 align-middle">
                                      <Input
                                        type="number"
                                        min={1}
                                        className="h-8 w-16 px-1 text-xs tabular-nums"
                                        value={q}
                                        onChange={(e) => setProvidedMenuQuantity(m.id, e.target.value)}
                                      />
                                    </td>
                                    <td className="px-2 py-2 align-middle text-right font-medium tabular-nums">
                                      ฿{line.toLocaleString()}
                                    </td>
                                    <td className="px-1 py-2 align-middle text-right">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                        onClick={() => removeProvidedMenuById(m.id)}
                                        aria-label={t("posCancel")}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t bg-muted/25">
                                <td colSpan={3} className="px-2 py-2 text-[11px]">
                                  <span className="text-muted-foreground">{t("marketingInfluencersProvidedMenusGrandTotal")}</span>
                                  <span className="mx-1.5 text-muted-foreground">·</span>
                                  <span className="text-muted-foreground">{t("marketingInfluencersProvidedMenusTotalQty")}</span>
                                  <span className="ml-1 tabular-nums font-semibold text-foreground">
                                    {providedMenusTotals.qty}
                                  </span>
                                </td>
                                <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                                  ฿{providedMenusTotals.amount.toLocaleString()}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{t("marketingFieldFormat")}</label>
                      <Input
                        value={form.contentFormat}
                        onChange={(e) => setForm((f) => ({ ...f, contentFormat: e.target.value }))}
                        placeholder="Reels, Album"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{t("marketingFieldTopic")}</label>
                      <Input
                        value={form.contentTopic}
                        onChange={(e) => setForm((f) => ({ ...f, contentTopic: e.target.value }))}
                        placeholder="Event Special"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{t("marketingFieldHireType")}</label>
                      <select
                        value={form.hireType}
                        onChange={(e) => setForm((f) => ({ ...f, hireType: e.target.value }))}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      >
                        {HIRE_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {t(o.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{t("marketingFieldBudgetBaht")}</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.budget}
                        onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-muted-foreground">{t("marketingFieldActualCostPayable")}</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.actualCost}
                        onChange={(e) => setForm((f) => ({ ...f, actualCost: e.target.value }))}
                        className="mt-1"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">{t("marketingFieldHqPayableSyncHint")}</p>
                    </div>
                    {PLATFORM_KEYS.map((key) => (
                      <div key={key} className="sm:col-span-2">
                        <label className="text-xs text-muted-foreground">
                          {t("marketingSocialLinkLabel").replace("{channel}", key)}
                        </label>
                        <Input
                          value={form[key as keyof typeof form] as string}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                          placeholder="https://..."
                          className="mt-1"
                        />
                      </div>
                    ))}
                    <div className="sm:col-span-2">
                      <label className="text-xs text-muted-foreground">{t("marketingFieldMemo")}</label>
                      <Textarea
                        value={form.note}
                        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                        className="mt-1 min-h-[60px]"
                        rows={2}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button onClick={handleSave} disabled={saving}>
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? t("marketingSavingShort") : t("itemsBtnSave")}
                    </Button>
                    <Button variant="outline" onClick={handleNew}>
                      {t("posCancel")}
                    </Button>
                  </div>
                  </CardContent>
                </Card>
              )}

              <div className="rounded-xl border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h3 className="text-sm font-semibold">{t("marketingInfluencerListHeading")}</h3>
                  <div className="flex gap-1">
                    <Button variant={sortBy === "name" ? "default" : "outline"} size="sm" onClick={() => setSortBy("name")}>
                      {t("marketingSortName")}
                    </Button>
                    <Button variant={sortBy === "cpf" ? "default" : "outline"} size="sm" onClick={() => setSortBy("cpf")}>
                      {t("marketingSortCpfValue")}
                    </Button>
                  </div>
                </div>
                <div className="divide-y overflow-x-auto">
                  {list.length === 0 && !loading && (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {!campaignFilter.trim()
                        ? t("marketingEmptySelectCampaignInfluencers")
                        : t("marketingEmptyNoInfluencers")}
                    </p>
                  )}
                  {[...list]
                    .sort((a, b) => {
                      if (sortBy === "cpf") {
                        const cpfA = getCpf(a.budget ?? 0, a.followers ?? "")
                        const cpfB = getCpf(b.budget ?? 0, b.followers ?? "")
                        if (cpfA == null && cpfB == null) return 0
                        if (cpfA == null) return 1
                        if (cpfB == null) return -1
                        return cpfA - cpfB
                      }
                      const na = ((a.contactName || a.name) ?? "").trim()
                      const nb = ((b.contactName || b.name) ?? "").trim()
                      return na.localeCompare(nb, "ko")
                    })
                    .map((i) => {
                      const cpf = getCpf(i.budget ?? 0, i.followers ?? "")
                      const periodLine = formatInfPeriodLine(i.shootingDate, i.publishDate)
                      const menuBrief =
                        (i.providedMenus ?? []).length > 0
                          ? (i.providedMenus ?? [])
                              .slice(0, 2)
                              .map((m) => {
                                const q = Math.max(1, Math.floor(Number(m.quantity) || 1))
                                return q > 1 ? `${q}×${m.name}` : m.name
                              })
                              .join(", ") + ((i.providedMenus ?? []).length > 2 ? "…" : "")
                          : ""
                      return (
                        <div
                          key={i.id}
                          className={cn(
                            "flex flex-wrap items-center justify-between gap-2 px-4 py-3",
                            editingId === i.id && "bg-primary/5"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold">
                              {(i.contactName || "").trim() || i.name}
                            </div>
                            {(i.contactName || "").trim() && (i.name || "").trim() ? (
                              <div className="text-[11px] text-muted-foreground">@{i.name}</div>
                            ) : null}
                            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                              {periodLine && <span className="font-medium text-foreground">{periodLine}</span>}
                              {i.followers && <span>{i.followers} followers</span>}
                              {i.campaignId && (
                                <span className="rounded bg-muted px-1 font-mono text-[10px]">
                                  {i.campaignNo?.trim() || campaignLabel(i.campaignId)}
                                </span>
                              )}
                              {i.branchReview && <span>{i.branchReview}</span>}
                              {menuBrief ? <span className="max-w-[240px] truncate" title={menuBrief}>{menuBrief}</span> : null}
                              {i.budget > 0 && (
                                <span>
                                  {t("marketingListBudget")} ฿{i.budget.toLocaleString()}
                                </span>
                              )}
                              {(i.actualCost ?? 0) > 0 && (
                                <span className="text-foreground">
                                  {t("marketingListActualCost")} ฿{(i.actualCost ?? 0).toLocaleString()}
                                </span>
                              )}
                              {cpf != null && <span className="font-medium text-primary">CPF ฿{cpf.toFixed(2)}</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(i)}>
                              {t("posEdit")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(i)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="inquiry" className={adminTabsContentCn}>
            <Card>
              <CardContent className="p-4 sm:p-5">
                <MarketingInfluencersOverviewTab
                  influencers={allInfs}
                  campaigns={campaigns}
                  loading={inquiryLoading}
                  t={t}
                  formatInfPeriodLine={formatInfPeriodLine}
                  campaignLabel={campaignLabel}
                  campaignStatusLabel={campaignStatusLabel}
                  campaignStatusBadgeClass={campaignStatusBadgeClass}
                  onOpenComposeGoTo={openInfInCompose}
                  onComposeQuickEdit={handleComposeQuickEdit}
                  onDelete={handleDelete}
                  applySearchRequest={inquiryApplySearch}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="directory" className={adminTabsContentCn}>
            <Card>
              <CardContent className="p-4 sm:p-5">
                <MarketingInfluencersDirectoryTab
                  influencers={allInfs}
                  campaigns={campaigns}
                  stores={stores}
                  storesLoading={storesLoading}
                  loading={inquiryLoading}
                  t={t}
                  campaignLabel={campaignLabel}
                  onComposeQuickEdit={handleComposeQuickEdit}
                  onOpenInquiryWithSearch={openInquiryWithNameSearch}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </MarketingPageShell>
  )
}

"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import {
  TrendingUp,
  Save,
  Plus,
  Trash2,
  RotateCw,
  LayoutGrid,
  Wallet,
  Link2,
  Pencil,
  Settings2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMarketingAds,
  getMarketingCampaigns,
  saveMarketingAd,
  saveMarketingCampaignDesignDates,
  deleteMarketingAd,
  type MarketingAd,
  type MarketingCampaign,
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
import { MarketingAdsOverviewTab } from "@/components/marketing/marketing-ads-overview-tab"
import { MarketingAdOptionsDialog } from "@/components/marketing/marketing-ad-options-dialog"
import { MarketingLinkedCampaignStrip } from "@/components/marketing/marketing-linked-campaign-strip"
import { MarketingHubRecordScheduleCard } from "@/components/marketing/marketing-hub-record-schedule-card"
import {
  loadMarketingAdUiOptions,
  type MarketingAdLabelOption,
  type MarketingAdPlatformOption,
  type MarketingAdUiOptions,
} from "@/lib/marketing-ad-ui-options"

function mergePlatformOptions(opts: MarketingAdPlatformOption[], current: string): MarketingAdPlatformOption[] {
  const m = new Map(opts.map((o) => [o.value, o]))
  const c = current.trim()
  if (c && !m.has(c)) m.set(c, { value: c, label: c })
  return [...m.values()]
}

function mergeSimpleOptions(opts: MarketingAdLabelOption[], current: string): MarketingAdLabelOption[] {
  const m = new Map(opts.map((o) => [o.value, o]))
  const c = current.trim()
  if (c && !m.has(c)) m.set(c, { value: c, label: c })
  return [...m.values()]
}

const selectTriggerClass =
  "h-10 w-full cursor-pointer appearance-none rounded-lg border border-input bg-background px-3 text-sm shadow-sm transition-[box-shadow,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

function platformBadgeClass(platform: string) {
  const p = platform.toLowerCase()
  if (p === "instagram")
    return "border-0 bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888] text-white shadow-sm"
  if (p === "facebook") return "border-0 bg-[#1877F2] text-white shadow-sm"
  if (p === "tiktok") return "border-0 bg-gradient-to-br from-[#00f2ea] to-[#ff0050] text-white shadow-sm"
  if (p === "line_oa") return "border-0 bg-[#06C755] text-white shadow-sm"
  if (p === "twitter") return "border-0 bg-[#1d9bf0] text-white shadow-sm"
  return "border-border bg-muted/80 text-foreground"
}

type MainTab = "compose" | "inquiry"

export default function MarketingAdsPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""
  const { auth } = useAuth()
  const [mainTab, setMainTab] = React.useState<MainTab>("compose")
  const [list, setList] = React.useState<MarketingAd[]>([])
  const [allAds, setAllAds] = React.useState<MarketingAd[]>([])
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)
  const [inquiryLoading, setInquiryLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [form, setForm] = React.useState({
    campaignId: "",
    contentFormat: "",
    contentPillar: "",
    contentTopic: "",
    contentDetail: "",
    publishDate: "",
    periodEndDate: "",
    platform: "instagram",
    postLink: "",
    boostBudget: "",
    actualSpent: "",
  })

  const formatAdPeriodLine = React.useCallback(
    (start: string | null | undefined, end: string | null | undefined) => {
      const a = (start || "").trim()
      const b = (end || "").trim()
      if (!a && !b) return ""
      if (a && b) return `${a} ~ ${b}`
      if (a) return `${a} ~`
      return `~ ${b}`
    },
    []
  )

  const [uiOptions, setUiOptions] = React.useState<MarketingAdUiOptions>(() => loadMarketingAdUiOptions())
  const [optionsDialogOpen, setOptionsDialogOpen] = React.useState(false)
  const [hubDesignStart, setHubDesignStart] = React.useState("")
  const [hubDesignEnd, setHubDesignEnd] = React.useState("")

  const loadData = React.useCallback(() => {
    const cid = campaignFilter.trim()
    setLoading(true)
    return Promise.all([
      cid ? getMarketingAds({ campaignId: cid }) : Promise.resolve([] as MarketingAd[]),
      getMarketingCampaigns(),
    ])
      .then(([ads, camps]) => {
        setList(ads)
        setCampaigns(camps)
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [campaignFilter])

  const loadInquiryAds = React.useCallback(async () => {
    setInquiryLoading(true)
    try {
      const [ads, camps] = await Promise.all([getMarketingAds(), getMarketingCampaigns()])
      setAllAds(ads)
      setCampaigns(camps)
    } catch {
      setAllAds([])
    } finally {
      setInquiryLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    if (mainTab === "inquiry") loadInquiryAds()
  }, [mainTab, loadInquiryAds])

  React.useEffect(() => {
    if (!campaignIdFromQuery) return
    setMainTab("compose")
    setCampaignFilter(campaignIdFromQuery)
    setForm((f) => ({ ...f, campaignId: campaignIdFromQuery }))
  }, [campaignIdFromQuery])

  /** 상단 캠페인 찾기만 사용 — 신규 등록 시 선택 캠페인과 동기화 */
  React.useEffect(() => {
    if (editingId !== null) return
    setForm((f) => (f.campaignId === campaignFilter ? f : { ...f, campaignId: campaignFilter }))
  }, [campaignFilter, editingId])

  const refreshAllLists = React.useCallback(async () => {
    await loadData()
    await loadInquiryAds()
  }, [loadData, loadInquiryAds])

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

  const platformSelectOptions = React.useMemo(
    () => mergePlatformOptions(uiOptions.platforms, form.platform),
    [uiOptions.platforms, form.platform]
  )
  const formatSelectOptions = React.useMemo(
    () => mergeSimpleOptions(uiOptions.formats, form.contentFormat),
    [uiOptions.formats, form.contentFormat]
  )
  const pillarSelectOptions = React.useMemo(
    () => mergeSimpleOptions(uiOptions.pillars, form.contentPillar),
    [uiOptions.pillars, form.contentPillar]
  )
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

  const handleNew = () => {
    setEditingId(null)
    const defaultPlat = uiOptions.platforms[0]?.value ?? "instagram"
    setForm({
      campaignId: campaignFilter || "",
      contentFormat: "",
      contentPillar: "",
      contentTopic: "",
      contentDetail: "",
      publishDate: "",
      periodEndDate: "",
      platform: defaultPlat,
      postLink: "",
      boostBudget: "",
      actualSpent: "",
    })
  }

  const handleEdit = (a: MarketingAd) => {
    if (a.campaignId) setCampaignFilter(String(a.campaignId))
    setEditingId(a.id)
    setForm({
      campaignId: a.campaignId || "",
      contentFormat: a.contentFormat || "",
      contentPillar: a.contentPillar || "",
      contentTopic: a.contentTopic || "",
      contentDetail: (a.contentDetail || "").trim(),
      publishDate: a.publishDate || "",
      periodEndDate: (a.periodEndDate ?? "").trim(),
      platform: a.platform || "instagram",
      postLink: a.postLink || "",
      boostBudget: String(a.boostBudget ?? ""),
      actualSpent: String(a.actualSpent ?? ""),
    })
  }

  const openAdInCompose = (a: MarketingAd) => {
    setMainTab("compose")
    if (a.campaignId) setCampaignFilter(String(a.campaignId))
    handleEdit(a)
    requestAnimationFrame(() => {
      document.getElementById("marketing-ad-compose-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const handleComposeQuickEdit = (a: MarketingAd) => {
    setMainTab("compose")
    if (a.campaignId) setCampaignFilter(String(a.campaignId))
    handleEdit(a)
  }

  const handleSave = async () => {
    if (!form.campaignId.trim()) {
      await appAlert(t("marketingAlertSelectCampaignHubToSave"))
      return
    }
    if (!form.platform.trim()) {
      await appAlert(t("marketingAlertSelectPlatform"))
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

      const res = await saveMarketingAd({
        id: editingId ?? undefined,
        campaignId: form.campaignId.trim() || null,
        contentFormat: form.contentFormat.trim(),
        contentPillar: form.contentPillar.trim(),
        contentTopic: form.contentTopic.trim(),
        contentDetail: form.contentDetail.trim(),
        publishDate: form.publishDate.trim() || null,
        periodEndDate: form.periodEndDate.trim() || null,
        platform: form.platform,
        postLink: form.postLink.trim(),
        boostBudget: Number(form.boostBudget) || 0,
        actualSpent: Number(form.actualSpent) || 0,
        userRole: auth?.role,
        userName: auth?.user,
        userStore: auth?.store,
      })
      if (res.success) {
        const extra = res.expenseSyncMessage ? `\n\n${res.expenseSyncMessage}` : ""
        await appAlert(t("itemsAlertSaved") + extra)
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

  const handleDelete = async (a: MarketingAd) => {
    if (!(await appConfirm(t("marketingDeleteAdConfirm").replace("{platform}", a.platform)))) return
    const res = await deleteMarketingAd({ id: a.id })
    if (res.success) {
      refreshAllLists()
      if (editingId === a.id) handleNew()
    } else {
      await appAlert(res.message)
    }
  }

  return (
    <MarketingPageShell>
        <MarketingPageHero icon={TrendingUp} title={t("adminMarketingAds")} />
        {campaignIdFromQuery && (
          <div className="mb-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground/90">
            {t("marketingAdsQueryBanner")}
          </div>
        )}

        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)} className={adminTabsRootCn}>
          <div className={cn(adminTabsBarCn, "px-2 py-2.5 sm:px-4")}>
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="compose" className={adminTabsTriggerCn}>
                  {t("marketingAdsTabCompose")}
                </TabsTrigger>
                <TabsTrigger value="inquiry" className={adminTabsTriggerCn}>
                  {t("marketingAdsTabInquiry")}
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
              <div className="mb-6 space-y-3 rounded-xl border bg-card/50 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            )}

            <div className="space-y-6">
              {(editingId !== null || form.platform) && (
                <Card
                  id="marketing-ad-compose-anchor"
                  className="overflow-hidden border-primary/15 shadow-md ring-1 ring-primary/5"
                >
                  <CardHeader className="border-b border-border/60 bg-gradient-to-r from-muted/40 to-transparent py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Pencil className="h-4 w-4 text-primary" />
                        </div>
                        <CardTitle className="text-base">
                          {editingId ? t("marketingAdsFormEdit") : t("marketingAdsFormNew")}
                        </CardTitle>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:ms-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5"
                          onClick={refreshAllLists}
                          disabled={loading}
                        >
                          <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
                          {t("posRefresh")}
                        </Button>
                        <Button variant="default" size="sm" className="h-9 gap-1.5 shadow-sm" onClick={handleNew}>
                          <Plus className="h-4 w-4" />
                          {t("marketingAdsAddBtn")}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-6">
                    <div>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                          {t("marketingAdsSectionContent")}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => setOptionsDialogOpen(true)}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          {t("marketingAdsOptionsEditBtn")}
                        </Button>
                      </div>
                      {form.campaignId.trim() ? (
                        <MarketingLinkedCampaignStrip
                          label={t("marketingAdsOptionsLinkedCampaign")}
                          title={campaignLabel(form.campaignId) || form.campaignId}
                        />
                      ) : (
                        <div className="mb-3 rounded-lg border-2 border-dashed border-amber-500/50 bg-amber-500/[0.08] px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/25 dark:text-amber-100">
                          {t("marketingAdsEmptyNeedCampaign")}
                        </div>
                      )}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">{t("marketingAdsLabelPlatformRequired")}</Label>
                          <select
                            value={form.platform}
                            onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                            className={selectTriggerClass}
                            disabled={saving}
                          >
                            {platformSelectOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">{t("marketingAdsLabelContentFormat")}</Label>
                          <select
                            value={form.contentFormat}
                            onChange={(e) => setForm((f) => ({ ...f, contentFormat: e.target.value }))}
                            className={selectTriggerClass}
                            disabled={saving}
                          >
                            <option value="">{t("marketingSelectOptionPlaceholder")}</option>
                            {formatSelectOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">{t("marketingAdsLabelContentPillar")}</Label>
                          <select
                            value={form.contentPillar}
                            onChange={(e) => setForm((f) => ({ ...f, contentPillar: e.target.value }))}
                            className={selectTriggerClass}
                            disabled={saving}
                          >
                            <option value="">{t("marketingSelectOptionPlaceholder")}</option>
                            {pillarSelectOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">{t("marketingAdsLabelContentTopic")}</Label>
                          <Input
                            value={form.contentTopic}
                            onChange={(e) => setForm((f) => ({ ...f, contentTopic: e.target.value }))}
                            placeholder="Post Promote : ..."
                            className="h-10"
                            disabled={saving}
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">{t("marketingAdsContentDetailLabel")}</Label>
                          <Textarea
                            value={form.contentDetail}
                            onChange={(e) => setForm((f) => ({ ...f, contentDetail: e.target.value }))}
                            placeholder={t("marketingAdsContentDetailPlaceholder")}
                            className="min-h-[88px] resize-y text-sm"
                            disabled={saving}
                            rows={4}
                          />
                        </div>
                      </div>
                    </div>

                    <MarketingHubRecordScheduleCard
                      disabled={saving}
                      designOutOfRange={designOutOfRange}
                      campaignId={form.campaignId}
                      hubDesignStartDate={hubDesignStart}
                      hubDesignEndDate={hubDesignEnd}
                      onHubDesignStartDateChange={setHubDesignStart}
                      onHubDesignEndDateChange={setHubDesignEnd}
                      executionTitle={t("marketingRecordPeriodTitle")}
                      executionFromLabel={t("marketingRecordPeriodFrom")}
                      executionToLabel={t("marketingRecordPeriodTo")}
                      executionFromValue={form.publishDate}
                      executionToValue={form.periodEndDate}
                      onExecutionFromChange={(v) => setForm((f) => ({ ...f, publishDate: v }))}
                      onExecutionToChange={(v) => setForm((f) => ({ ...f, periodEndDate: v }))}
                    />
                    {designOutOfRange ? (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">{t("marketingDesignTodayOutsidePeriod")}</p>
                    ) : null}

                    <Separator />

                    <div>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        {t("marketingAdsSectionBudget")}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Link2 className="h-3 w-3" />
                            Post Link
                          </Label>
                          <Input
                            value={form.postLink}
                            onChange={(e) => setForm((f) => ({ ...f, postLink: e.target.value }))}
                            placeholder="https://..."
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">{t("marketingAdsBoostBudgetBaht")}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={form.boostBudget}
                            onChange={(e) => setForm((f) => ({ ...f, boostBudget: e.target.value }))}
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">{t("marketingAdsActualCostPayable")}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={form.actualSpent}
                            onChange={(e) => setForm((f) => ({ ...f, actualSpent: e.target.value }))}
                            className="h-10"
                          />
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            {t("marketingAdsPayableSyncLongHint")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button onClick={handleSave} disabled={saving} className="gap-2 shadow-sm">
                        <Save className="h-4 w-4" />
                        {saving ? "..." : t("itemsBtnSave") || "저장"}
                      </Button>
                      <Button variant="outline" onClick={handleNew}>
                        {t("posCancel") || "취소"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <MarketingAdOptionsDialog
                open={optionsDialogOpen}
                onOpenChange={setOptionsDialogOpen}
                options={uiOptions}
                onApplied={setUiOptions}
                labels={{
                  title: t("marketingAdsOptionsDialogTitle"),
                  hint: t("marketingAdsOptionsDialogHint"),
                  platformTab: t("marketingAdsOptionsTabPlatform"),
                  formatTab: t("marketingAdsOptionsTabFormat"),
                  pillarTab: t("marketingAdsOptionsTabPillar"),
                  displayName: t("marketingAdsOptionsTabPlatform"),
                  save: t("itemsBtnSave"),
                  cancel: t("posCancel"),
                }}
              />

              <Card className="overflow-hidden shadow-sm">
                <CardHeader className="border-b border-border/80 bg-muted/15 py-4">
                  <CardTitle className="text-base">{t("marketingAdsListTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/80">
                    {list.length === 0 && !loading && (
                      <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
                        <div className="rounded-full bg-muted/80 p-3">
                          <TrendingUp className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="max-w-sm text-sm text-muted-foreground">
                          {!campaignFilter.trim() ? t("marketingAdsEmptyNeedCampaign") : t("marketingAdsEmptyNoRows")}
                        </p>
                      </div>
                    )}
                    {list.map((a) => (
                      <div
                        key={a.id}
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition-colors sm:px-5",
                          editingId === a.id ? "bg-primary/[0.06]" : "hover:bg-muted/30"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={cn("px-2 py-0.5 text-[11px] font-semibold capitalize", platformBadgeClass(a.platform || ""))}>
                              {a.platform}
                            </Badge>
                            {a.campaignId && (
                              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                                {a.campaignNo?.trim() || campaignLabel(a.campaignId)}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {formatAdPeriodLine(a.publishDate, a.periodEndDate) && (
                              <span className="font-medium text-foreground">
                                {formatAdPeriodLine(a.publishDate, a.periodEndDate)}
                              </span>
                            )}
                            {a.contentTopic && <span className="line-clamp-2">{a.contentTopic}</span>}
                            {(a.contentDetail || "").trim() && (
                              <span className="line-clamp-2 text-muted-foreground">{(a.contentDetail || "").trim()}</span>
                            )}
                            {(a.boostBudget > 0 || a.actualSpent > 0) && (
                              <span className="tabular-nums">
                                {t("marketingListBudget")} ฿{(a.boostBudget || 0).toLocaleString()} ·{" "}
                                {t("marketingListActualCost")} ฿{(a.actualSpent || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button variant="secondary" size="sm" className="h-8" onClick={() => handleEdit(a)}>
                            {t("posEdit")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDelete(a)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="inquiry" className={adminTabsContentCn}>
            <Card>
              <CardContent className="p-4 sm:p-5">
                <MarketingAdsOverviewTab
                  ads={allAds}
                  campaigns={campaigns}
                  loading={inquiryLoading}
                  t={t}
                  formatAdPeriodLine={formatAdPeriodLine}
                  campaignLabel={campaignLabel}
                  campaignStatusLabel={campaignStatusLabel}
                  campaignStatusBadgeClass={campaignStatusBadgeClass}
                  platformBadgeClass={platformBadgeClass}
                  onOpenComposeGoTo={openAdInCompose}
                  onComposeQuickEdit={handleComposeQuickEdit}
                  onDelete={handleDelete}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </MarketingPageShell>
  )
}

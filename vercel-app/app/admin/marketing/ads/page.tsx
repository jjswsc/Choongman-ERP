"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import {
  TrendingUp,
  Save,
  Plus,
  Trash2,
  RotateCw,
  Sparkles,
  CalendarRange,
  LayoutGrid,
  Wallet,
  Link2,
  Search,
  Filter,
  Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

const PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "line_oa", label: "Line OA" },
  { value: "twitter", label: "Twitter" },
]

const PILLAR_OPTIONS = [
  { value: "Product", label: "Product" },
  { value: "Promotion", label: "Promotion" },
  { value: "Branding", label: "Branding" },
]

const FORMAT_OPTIONS = [
  { value: "Album", label: "Album" },
  { value: "Single Banner", label: "Single Banner" },
  { value: "Video", label: "Video" },
  { value: "Reels", label: "Reels" },
]

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
type InquiryStatusFilter = "all" | "draft" | "ongoing" | "finish" | "unlinked"

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

  const [inquirySearch, setInquirySearch] = React.useState("")
  const [inquiryStatusFilter, setInquiryStatusFilter] = React.useState<InquiryStatusFilter>("all")
  const [inquiryCampaignId, setInquiryCampaignId] = React.useState("")

  const loadData = React.useCallback(() => {
    const cid = campaignFilter.trim()
    setLoading(true)
    Promise.all([
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
    setCampaignFilter(campaignIdFromQuery)
    setForm((f) => ({ ...f, campaignId: campaignIdFromQuery }))
  }, [campaignIdFromQuery])

  const refreshAllLists = React.useCallback(() => {
    loadData()
    void loadInquiryAds()
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

  const filteredInquiryAds = React.useMemo(() => {
    let rows = allAds
    const q = inquirySearch.trim().toLowerCase()
    if (q) {
      rows = rows.filter((a) => {
        const camp = a.campaignId ? campaignById.get(String(a.campaignId)) : undefined
        const blob = [
          a.platform,
          a.contentTopic,
          a.postLink,
          a.campaignNo,
          camp?.topic,
          camp?.campaignNo,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return blob.includes(q)
      })
    }
    if (inquiryCampaignId.trim()) {
      rows = rows.filter((a) => String(a.campaignId ?? "") === inquiryCampaignId.trim())
    }
    if (inquiryStatusFilter !== "all") {
      rows = rows.filter((a) => {
        const cid = a.campaignId ? String(a.campaignId) : ""
        const camp = cid ? campaignById.get(cid) : undefined
        if (inquiryStatusFilter === "unlinked") {
          return !cid || !camp
        }
        const st = camp?.status ?? ""
        if (!camp) return false
        return st === inquiryStatusFilter
      })
    }
    return rows
  }, [allAds, inquirySearch, inquiryCampaignId, inquiryStatusFilter, campaignById])

  const handleNew = () => {
    setEditingId(null)
    setForm({
      campaignId: campaignFilter || "",
      contentFormat: "",
      contentPillar: "",
      contentTopic: "",
      publishDate: "",
      periodEndDate: "",
      platform: "instagram",
      postLink: "",
      boostBudget: "",
      actualSpent: "",
    })
  }

  const handleEdit = (a: MarketingAd) => {
    setEditingId(a.id)
    setForm({
      campaignId: a.campaignId || "",
      contentFormat: a.contentFormat || "",
      contentPillar: a.contentPillar || "",
      contentTopic: a.contentTopic || "",
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

  const handleSave = async () => {
    if (!form.campaignId.trim()) {
      await appAlert("캠페인을 선택하세요. 캠페인 허브에서 연결 후 저장해야 합니다.")
      return
    }
    if (!form.platform.trim()) {
      await appAlert("플랫폼을 선택하세요.")
      return
    }
    setSaving(true)
    try {
      const res = await saveMarketingAd({
        id: editingId ?? undefined,
        campaignId: form.campaignId.trim() || null,
        contentFormat: form.contentFormat.trim(),
        contentPillar: form.contentPillar.trim(),
        contentTopic: form.contentTopic.trim(),
        publishDate: form.publishDate.trim() || null,
        periodEndDate: form.periodEndDate.trim() || null,
        platform: form.platform,
        postLink: form.postLink.trim(),
        boostBudget: Number(form.boostBudget) || 0,
        actualSpent: Number(form.actualSpent) || 0,
        userRole: auth?.role,
        userName: auth?.user,
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

  const handleDelete = async (a: MarketingAd) => {
    if (!(await appConfirm(`${a.platform} 광고를 삭제하시겠습니까?`))) return
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
      <MarketingPageHero
        icon={TrendingUp}
        title={t("adminMarketingAds") || "광고 ROAS"}
        description={t("marketingAdsPageDesc")}
        badge={
          <Badge variant="secondary" className="gap-1 font-normal">
            <Sparkles className="h-3 w-3" />
            ROAS
          </Badge>
        }
      />

        {campaignIdFromQuery && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm shadow-sm">
            <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="leading-relaxed text-foreground/90">{t("marketingAdsQueryBanner")}</p>
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

          <TabsContent value="compose" className={adminTabsContentCn}>
            <Card id="marketing-ad-compose-anchor" className="mb-6 overflow-hidden shadow-sm">
              <CardHeader className="border-b border-border/80 bg-muted/20 pb-4">
                <div className="flex flex-col gap-1">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <LayoutGrid className="h-4 w-4 text-primary" />
                    {t("marketingAdsTabCompose")}
                  </CardTitle>
                  <CardDescription>{t("marketingAdsToolbarSubtitle")}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="min-w-[min(100%,240px)] flex-1 space-y-2">
                    <Label htmlFor="compose-campaign-filter" className="text-xs text-muted-foreground">
                      {t("adminMarketingCampaigns")}
                    </Label>
                    <select
                      id="compose-campaign-filter"
                      value={campaignFilter}
                      onChange={(e) => setCampaignFilter(e.target.value)}
                      className={selectTriggerClass}
                    >
                      <option value="">캠페인 선택…</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.campaignNo ? `[${c.campaignNo}] ` : ""}
                          {c.topic}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 gap-1.5"
                      onClick={refreshAllLists}
                      disabled={loading}
                    >
                      <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
                      {t("posRefresh") || "새로고침"}
                    </Button>
                    <Button variant="default" size="sm" className="h-10 gap-1.5 shadow-sm" onClick={handleNew}>
                      <Plus className="h-4 w-4" />
                      추가
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {loading && (
              <div className="mb-6 space-y-3 rounded-xl border bg-card/50 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            )}

            <div className="space-y-6">
              {(editingId !== null || form.platform) && (
                <Card className="overflow-hidden border-primary/15 shadow-md ring-1 ring-primary/5">
                  <CardHeader className="border-b border-border/60 bg-gradient-to-r from-muted/40 to-transparent py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Pencil className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-base">
                        {editingId ? t("marketingAdsFormEdit") : t("marketingAdsFormNew")}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-6">
                    <div className="rounded-xl border border-dashed border-primary/25 bg-muted/20 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                        <CalendarRange className="h-4 w-4 text-primary" />
                        {t("marketingRecordPeriodTitle")}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">{t("marketingRecordPeriodFrom")}</Label>
                          <Input
                            type="date"
                            value={form.publishDate}
                            onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))}
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">{t("marketingRecordPeriodTo")}</Label>
                          <Input
                            type="date"
                            value={form.periodEndDate}
                            onChange={(e) => setForm((f) => ({ ...f, periodEndDate: e.target.value }))}
                            className="h-10"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                        {t("marketingAdsSectionContent")}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">플랫폼 *</Label>
                          <select
                            value={form.platform}
                            onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                            className={selectTriggerClass}
                          >
                            {PLATFORM_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">캠페인</Label>
                          <select
                            value={form.campaignId}
                            onChange={(e) => setForm((f) => ({ ...f, campaignId: e.target.value }))}
                            className={selectTriggerClass}
                          >
                            <option value="">캠페인 선택 *</option>
                            {campaigns.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.campaignNo ? `[${c.campaignNo}] ` : ""}
                                {c.topic}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Content Format</Label>
                          <select
                            value={form.contentFormat}
                            onChange={(e) => setForm((f) => ({ ...f, contentFormat: e.target.value }))}
                            className={selectTriggerClass}
                          >
                            <option value="">선택</option>
                            {FORMAT_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Content Pillar</Label>
                          <select
                            value={form.contentPillar}
                            onChange={(e) => setForm((f) => ({ ...f, contentPillar: e.target.value }))}
                            className={selectTriggerClass}
                          >
                            <option value="">선택</option>
                            {PILLAR_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">Content Topic</Label>
                          <Input
                            value={form.contentTopic}
                            onChange={(e) => setForm((f) => ({ ...f, contentTopic: e.target.value }))}
                            placeholder="Post Promote : ..."
                            className="h-10"
                          />
                        </div>
                      </div>
                    </div>

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
                          <Label className="text-xs text-muted-foreground">Boost 예산 (฿)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={form.boostBudget}
                            onChange={(e) => setForm((f) => ({ ...f, boostBudget: e.target.value }))}
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">실제 비용 (฿) · 지출관리 지급예정</Label>
                          <Input
                            type="number"
                            min={0}
                            value={form.actualSpent}
                            onChange={(e) => setForm((f) => ({ ...f, actualSpent: e.target.value }))}
                            className="h-10"
                          />
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            본사 권한으로 저장하면 이 금액이 지출관리 「지급예정」에 자동 등록·갱신됩니다. 0으로 저장 시 연동 건이 요청 상태면 삭제됩니다.
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
                            {(a.boostBudget > 0 || a.actualSpent > 0) && (
                              <span className="tabular-nums">
                                예산 ฿{(a.boostBudget || 0).toLocaleString()} · 실비 ฿{(a.actualSpent || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button variant="secondary" size="sm" className="h-8" onClick={() => handleEdit(a)}>
                            {t("posEdit") || "수정"}
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
            <Card className="mb-6 overflow-hidden shadow-sm">
              <CardHeader className="border-b border-border/80 bg-muted/15 py-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background shadow-sm ring-1 ring-border/50">
                      <Filter className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{t("marketingAdsTabInquiry")}</CardTitle>
                      <CardDescription className="text-xs">{t("marketingAdsToolbarSubtitle")}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="w-fit font-mono text-xs tabular-nums" title={t("marketingAdsTabInquiry")}>
                    {filteredInquiryAds.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-12">
                <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                  <Label className="text-xs text-muted-foreground">{t("marketingAdsFilterCampaignOptional")}</Label>
                  <select
                    value={inquiryCampaignId}
                    onChange={(e) => setInquiryCampaignId(e.target.value)}
                    className={selectTriggerClass}
                  >
                    <option value="">{t("all")}</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.campaignNo ? `[${c.campaignNo}] ` : ""}
                        {c.topic}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs text-muted-foreground">{t("marketingAdsFilterStatus")}</Label>
                  <select
                    value={inquiryStatusFilter}
                    onChange={(e) => setInquiryStatusFilter(e.target.value as InquiryStatusFilter)}
                    className={selectTriggerClass}
                  >
                    <option value="all">{t("all")}</option>
                    <option value="ongoing">{t("marketingAdsStatusOngoing")}</option>
                    <option value="draft">{t("marketingAdsStatusDraft")}</option>
                    <option value="finish">{t("marketingAdsStatusFinish")}</option>
                    <option value="unlinked">{t("marketingAdsStatusUnlinked")}</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                  <Label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Search className="h-3.5 w-3.5" />
                    {t("search")}
                  </Label>
                  <Input
                    className="h-10"
                    value={inquirySearch}
                    onChange={(e) => setInquirySearch(e.target.value)}
                    placeholder={t("marketingAdsSearchPlaceholder")}
                  />
                </div>
                <div className="flex items-end sm:col-span-2 lg:col-span-1">
                  <Button
                    variant="outline"
                    className="h-10 w-full gap-1.5 lg:w-auto"
                    onClick={() => void loadInquiryAds()}
                    disabled={inquiryLoading}
                  >
                    <RotateCw className={cn("h-4 w-4", inquiryLoading && "animate-spin")} />
                    {t("posRefresh") || "새로고침"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {inquiryLoading && (
              <div className="mb-6 space-y-3 rounded-xl border bg-card/50 p-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
            )}

            <Card className="overflow-hidden shadow-sm">
              <CardHeader className="border-b border-border/80 bg-muted/10 py-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("marketingAdsTabInquiry")} · {filteredInquiryAds.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/80">
                  {!inquiryLoading && filteredInquiryAds.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
                      <div className="rounded-full bg-muted/80 p-3">
                        <Search className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="max-w-md text-sm text-muted-foreground">{t("marketingAdsInquiryEmpty")}</p>
                    </div>
                  )}
                  {filteredInquiryAds.map((a) => {
                    const cid = a.campaignId ? String(a.campaignId) : ""
                    const camp = cid ? campaignById.get(cid) : undefined
                    const st = camp?.status ?? ""
                    const unlinked = !cid || !camp
                    const statusText = unlinked ? t("marketingAdsStatusUnlinked") : campaignStatusLabel(st)

                    return (
                      <div
                        key={a.id}
                        className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-muted/20 sm:flex-row sm:items-start sm:justify-between sm:px-5"
                      >
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              className={cn("px-2 py-0.5 text-[11px] font-semibold capitalize", platformBadgeClass(a.platform || ""))}
                            >
                              {a.platform}
                            </Badge>
                            <span
                              className={cn(
                                "rounded-md px-2 py-0.5 text-[11px] font-medium",
                                unlinked
                                  ? "border border-dashed border-amber-500/60 text-amber-800 dark:text-amber-200"
                                  : campaignStatusBadgeClass(st)
                              )}
                              title={t("marketingAdsColCampaignStatus")}
                            >
                              {statusText}
                            </span>
                            {cid && (
                              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                                {a.campaignNo?.trim() || campaignLabel(cid)}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {formatAdPeriodLine(a.publishDate, a.periodEndDate) && (
                              <span className="font-medium text-foreground">
                                {formatAdPeriodLine(a.publishDate, a.periodEndDate)}
                              </span>
                            )}
                            {camp?.topic && <span>{camp.topic}</span>}
                            {a.contentTopic && <span className="text-foreground">{a.contentTopic}</span>}
                          </div>
                          {(a.boostBudget > 0 || a.actualSpent > 0) && (
                            <div className="text-xs tabular-nums text-muted-foreground">
                              예산 ฿{(a.boostBudget || 0).toLocaleString()} · 실비 ฿{(a.actualSpent || 0).toLocaleString()}
                            </div>
                          )}
                          {a.postLink && (
                            <a
                              href={a.postLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex max-w-full items-center gap-1 truncate text-xs text-primary underline-offset-4 hover:underline"
                            >
                              <Link2 className="h-3 w-3 shrink-0" />
                              {a.postLink}
                            </a>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-border/50 pt-3 sm:border-0 sm:pt-0">
                          <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={() => openAdInCompose(a)}>
                            {t("marketingAdsOpenComposeTab")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                              setMainTab("compose")
                              if (a.campaignId) setCampaignFilter(String(a.campaignId))
                              handleEdit(a)
                            }}
                          >
                            {t("posEdit") || "수정"}
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
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </MarketingPageShell>
  )
}

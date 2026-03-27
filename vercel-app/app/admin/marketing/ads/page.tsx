"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { TrendingUp, Save, Plus, Trash2, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t("adminMarketingAds") || "광고 ROAS"}</h1>
            <p className="text-xs text-muted-foreground">광고 포스트 및 비용 관리</p>
          </div>
        </div>

        <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          광고·비용은 <strong className="text-foreground">캠페인 고유번호</strong>로 묶입니다. 캠페인 허브에서 캠페인을 만든 뒤, 여기서 해당 캠페인을 선택해 주세요.
        </div>

        {campaignIdFromQuery && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            캠페인 허브에서 전달된 항목으로 필터되었습니다. 새 등록은 이 캠페인으로 자동 연결됩니다.
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
            <div id="marketing-ad-compose-anchor" className="mb-4 flex flex-wrap gap-2">
              <select
                value={campaignFilter}
                onChange={(e) => setCampaignFilter(e.target.value)}
                className="h-10 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">캠페인 선택…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaignNo ? `[${c.campaignNo}] ` : ""}
                    {c.topic}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={refreshAllLists} disabled={loading}>
                <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
                {t("posRefresh") || "새로고침"}
              </Button>
              <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={handleNew}>
                <Plus className="h-4 w-4" />
                추가
              </Button>
            </div>

            {loading && (
              <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t("loading")}</div>
            )}

            <div className="space-y-4">
              {(editingId !== null || form.platform) && (
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="mb-3 text-sm font-semibold">{editingId ? "광고 수정" : "광고 등록"}</h3>
                  <div className="mb-4 rounded-lg border border-dashed bg-muted/25 p-3 sm:col-span-2">
                    <p className="mb-2 text-xs font-semibold text-foreground">{t("marketingRecordPeriodTitle")}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-foreground">{t("marketingRecordPeriodFrom")}</label>
                        <Input
                          type="date"
                          value={form.publishDate}
                          onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-foreground">{t("marketingRecordPeriodTo")}</label>
                        <Input
                          type="date"
                          value={form.periodEndDate}
                          onChange={(e) => setForm((f) => ({ ...f, periodEndDate: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted-foreground">플랫폼 *</label>
                      <select
                        value={form.platform}
                        onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      >
                        {PLATFORM_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">캠페인</label>
                      <select
                        value={form.campaignId}
                        onChange={(e) => setForm((f) => ({ ...f, campaignId: e.target.value }))}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
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
                    <div>
                      <label className="text-xs text-muted-foreground">Content Format</label>
                      <select
                        value={form.contentFormat}
                        onChange={(e) => setForm((f) => ({ ...f, contentFormat: e.target.value }))}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      >
                        <option value="">선택</option>
                        {FORMAT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Content Pillar</label>
                      <select
                        value={form.contentPillar}
                        onChange={(e) => setForm((f) => ({ ...f, contentPillar: e.target.value }))}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      >
                        <option value="">선택</option>
                        {PILLAR_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-muted-foreground">Content Topic</label>
                      <Input
                        value={form.contentTopic}
                        onChange={(e) => setForm((f) => ({ ...f, contentTopic: e.target.value }))}
                        placeholder="Post Promote : ..."
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Post Link</label>
                      <Input
                        value={form.postLink}
                        onChange={(e) => setForm((f) => ({ ...f, postLink: e.target.value }))}
                        placeholder="https://..."
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Boost 예산 (฿)</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.boostBudget}
                        onChange={(e) => setForm((f) => ({ ...f, boostBudget: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-muted-foreground">실제 비용 (฿) · 지출관리 지급예정</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.actualSpent}
                        onChange={(e) => setForm((f) => ({ ...f, actualSpent: e.target.value }))}
                        className="mt-1"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        본사 권한으로 저장하면 이 금액이 지출관리 「지급예정」에 자동 등록·갱신됩니다. 0으로 저장 시 연동 건이 요청 상태면 삭제됩니다.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button onClick={handleSave} disabled={saving}>
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? "..." : t("itemsBtnSave") || "저장"}
                    </Button>
                    <Button variant="outline" onClick={handleNew}>
                      {t("posCancel") || "취소"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border bg-card">
                <h3 className="border-b px-4 py-3 text-sm font-semibold">광고 목록</h3>
                <div className="divide-y overflow-x-auto">
                  {list.length === 0 && !loading && (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {!campaignFilter.trim()
                        ? "캠페인을 선택하면 해당 캠페인의 광고 목록이 표시됩니다."
                        : "등록된 광고가 없습니다."}
                    </p>
                  )}
                  {list.map((a) => (
                    <div
                      key={a.id}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-2 px-4 py-3",
                        editingId === a.id && "bg-primary/5"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{a.platform}</span>
                          {a.campaignId && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              {a.campaignNo?.trim() || campaignLabel(a.campaignId)}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {formatAdPeriodLine(a.publishDate, a.periodEndDate) && (
                            <span className="font-medium text-foreground">{formatAdPeriodLine(a.publishDate, a.periodEndDate)}</span>
                          )}
                          {a.contentTopic && <span>{a.contentTopic}</span>}
                          {(a.boostBudget > 0 || a.actualSpent > 0) && (
                            <span>
                              예산 ฿{(a.boostBudget || 0).toLocaleString()} / 실비 ฿{(a.actualSpent || 0).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(a)}>
                          {t("posEdit") || "수정"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(a)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="inquiry" className={adminTabsContentCn}>
            <div className="mb-4 flex flex-wrap items-end gap-2">
              <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("marketingAdsFilterCampaignOptional")}
                </label>
                <select
                  value={inquiryCampaignId}
                  onChange={(e) => setInquiryCampaignId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
              <div className="flex min-w-[140px] flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("marketingAdsFilterStatus")}
                </label>
                <select
                  value={inquiryStatusFilter}
                  onChange={(e) => setInquiryStatusFilter(e.target.value as InquiryStatusFilter)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">{t("all")}</option>
                  <option value="ongoing">{t("marketingAdsStatusOngoing")}</option>
                  <option value="draft">{t("marketingAdsStatusDraft")}</option>
                  <option value="finish">{t("marketingAdsStatusFinish")}</option>
                  <option value="unlinked">{t("marketingAdsStatusUnlinked")}</option>
                </select>
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("search")}
                </label>
                <Input
                  className="mt-1 h-10"
                  value={inquirySearch}
                  onChange={(e) => setInquirySearch(e.target.value)}
                  placeholder={t("marketingAdsSearchPlaceholder")}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-10 gap-1.5"
                onClick={() => void loadInquiryAds()}
                disabled={inquiryLoading}
              >
                <RotateCw className={cn("h-4 w-4", inquiryLoading && "animate-spin")} />
                {t("posRefresh") || "새로고침"}
              </Button>
            </div>

            {inquiryLoading && (
              <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t("loading")}</div>
            )}

            <div className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="text-sm font-semibold">
                  {t("marketingAdsTabInquiry")} ({filteredInquiryAds.length})
                </h3>
              </div>
              <div className="divide-y overflow-x-auto">
                {!inquiryLoading && filteredInquiryAds.length === 0 && (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("marketingAdsInquiryEmpty")}</p>
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
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium capitalize">{a.platform}</span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium",
                              unlinked ? "border border-dashed border-amber-500/60 text-amber-800 dark:text-amber-200" : campaignStatusBadgeClass(st)
                            )}
                            title={t("marketingAdsColCampaignStatus")}
                          >
                            {statusText}
                          </span>
                          {cid && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              {a.campaignNo?.trim() || campaignLabel(cid)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {formatAdPeriodLine(a.publishDate, a.periodEndDate) && (
                            <span className="font-medium text-foreground">
                              {formatAdPeriodLine(a.publishDate, a.periodEndDate)}
                            </span>
                          )}
                          {camp?.topic && <span>{camp.topic}</span>}
                          {a.contentTopic && <span className="text-foreground">{a.contentTopic}</span>}
                        </div>
                        {(a.boostBudget > 0 || a.actualSpent > 0) && (
                          <div className="text-xs text-muted-foreground">
                            예산 ฿{(a.boostBudget || 0).toLocaleString()} / 실비 ฿{(a.actualSpent || 0).toLocaleString()}
                          </div>
                        )}
                        {a.postLink && (
                          <a
                            href={a.postLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-xs text-primary underline-offset-2 hover:underline"
                          >
                            {a.postLink}
                          </a>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={() => openAdInCompose(a)}>
                          {t("marketingAdsOpenComposeTab")}
                        </Button>
                        <Button
                          variant="ghost"
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
                          className="h-8 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleDelete(a)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

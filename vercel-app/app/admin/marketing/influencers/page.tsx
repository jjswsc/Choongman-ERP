"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { Users, Save, Plus, Trash2, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMarketingInfluencers,
  getMarketingCampaigns,
  saveMarketingInfluencer,
  deleteMarketingInfluencer,
  type MarketingInfluencer,
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

const HIRE_TYPE_OPTIONS = [
  { value: "pay", label: "Pay" },
  { value: "free", label: "Free" },
]

const PLATFORM_KEYS = ["instagram", "facebook", "tiktok", "youtube", "lemon8"] as const

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

type MainTab = "compose" | "inquiry"
type InquiryStatusFilter = "all" | "draft" | "ongoing" | "finish" | "unlinked"

export default function MarketingInfluencersPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""
  const { auth } = useAuth()
  const [mainTab, setMainTab] = React.useState<MainTab>("compose")
  const [list, setList] = React.useState<MarketingInfluencer[]>([])
  const [allInfs, setAllInfs] = React.useState<MarketingInfluencer[]>([])
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)
  const [inquiryLoading, setInquiryLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [sortBy, setSortBy] = React.useState<"name" | "cpf">("name")
  const [form, setForm] = React.useState({
    campaignId: "",
    name: "",
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

  const [inquirySearch, setInquirySearch] = React.useState("")
  const [inquiryStatusFilter, setInquiryStatusFilter] = React.useState<InquiryStatusFilter>("all")
  const [inquiryCampaignId, setInquiryCampaignId] = React.useState("")

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
    Promise.all([
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
    if (mainTab === "inquiry") void loadInquiryInfs()
  }, [mainTab, loadInquiryInfs])

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

  const refreshAllLists = React.useCallback(() => {
    loadData()
    void loadInquiryInfs()
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

  const filteredInquiryInfs = React.useMemo(() => {
    let rows = allInfs
    const q = inquirySearch.trim().toLowerCase()
    if (q) {
      rows = rows.filter((i) => {
        const camp = i.campaignId ? campaignById.get(String(i.campaignId)) : undefined
        const blob = [
          i.name,
          i.followers,
          i.contentTopic,
          i.contentFormat,
          i.branchReview,
          i.note,
          i.campaignNo,
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
      rows = rows.filter((i) => String(i.campaignId ?? "") === inquiryCampaignId.trim())
    }
    if (inquiryStatusFilter !== "all") {
      rows = rows.filter((i) => {
        const cid = i.campaignId ? String(i.campaignId) : ""
        const camp = cid ? campaignById.get(cid) : undefined
        if (inquiryStatusFilter === "unlinked") {
          return !cid || !camp
        }
        if (!camp) return false
        return camp.status === inquiryStatusFilter
      })
    }
    return rows
  }, [allInfs, inquirySearch, inquiryCampaignId, inquiryStatusFilter, campaignById])

  const handleNew = () => {
    setEditingId(null)
    setForm({
      campaignId: campaignFilter || "",
      name: "",
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
    setEditingId(i.id)
    const links = i.platformLinks || {}
    setForm({
      campaignId: i.campaignId || "",
      name: i.name || "",
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

  const handleSave = async () => {
    if (!form.campaignId.trim()) {
      await appAlert("캠페인을 선택하세요. 캠페인 허브에서 연결 후 저장해야 합니다.")
      return
    }
    const name = form.name.trim()
    if (!name) {
      await appAlert("이름을 입력하세요.")
      return
    }
    setSaving(true)
    try {
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
    <MarketingPageShell maxWidthClass="max-w-4xl">
        <MarketingPageHero
          icon={Users}
          title={t("adminMarketingInfluencers") || "인플루언서"}
          description="인플루언서 협업 이력 및 비용"
        />

        <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          인플루언서 활동은 <strong className="text-foreground">캠페인 고유번호</strong>로 묶입니다. 캠페인 허브에서 캠페인을 만든 뒤 선택해 주세요.
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
                  {t("marketingInfluencersTabCompose")}
                </TabsTrigger>
                <TabsTrigger value="inquiry" className={adminTabsTriggerCn}>
                  {t("marketingInfluencersTabInquiry")}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="compose" className={adminTabsContentCn}>
            <div id="marketing-influencer-compose-anchor" className="mb-4 flex flex-wrap gap-2">
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
              {!campaignFilter.trim() && (
                <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                  위에서 캠페인을 선택하면 아래에 등록·입력 양식이 표시됩니다.
                </p>
              )}
              {(editingId !== null || Boolean(campaignFilter.trim())) && (
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="mb-3 text-sm font-semibold">{editingId ? "인플루언서 수정" : "인플루언서 등록"}</h3>
                  <div className="mb-4 rounded-lg border border-dashed bg-muted/25 p-3">
                    <p className="text-xs font-semibold text-foreground">{t("marketingRecordPeriodTitle")}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{t("marketingInfluencerPeriodNote")}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-foreground">{t("marketingRecordPeriodFrom")}</label>
                        <Input
                          type="date"
                          value={form.shootingDate}
                          onChange={(e) => setForm((f) => ({ ...f, shootingDate: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-foreground">{t("marketingRecordPeriodTo")}</label>
                        <Input
                          type="date"
                          value={form.publishDate}
                          onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted-foreground">이름 *</label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="j.chachaa"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">팔로워</label>
                      <Input
                        value={form.followers}
                        onChange={(e) => setForm((f) => ({ ...f, followers: e.target.value }))}
                        placeholder="181.4K"
                        className="mt-1"
                      />
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
                      <label className="text-xs text-muted-foreground">지점 (Branch Review)</label>
                      <Input
                        value={form.branchReview}
                        onChange={(e) => setForm((f) => ({ ...f, branchReview: e.target.value }))}
                        placeholder="Union, Bizzo Bangna"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">형식</label>
                      <Input
                        value={form.contentFormat}
                        onChange={(e) => setForm((f) => ({ ...f, contentFormat: e.target.value }))}
                        placeholder="Reels, Album"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">토픽</label>
                      <Input
                        value={form.contentTopic}
                        onChange={(e) => setForm((f) => ({ ...f, contentTopic: e.target.value }))}
                        placeholder="Event Special"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Hire Type</label>
                      <select
                        value={form.hireType}
                        onChange={(e) => setForm((f) => ({ ...f, hireType: e.target.value }))}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      >
                        {HIRE_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">예산 (฿)</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.budget}
                        onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-muted-foreground">실제 비용 (฿) · 지출관리 지급예정</label>
                      <Input
                        type="number"
                        min={0}
                        value={form.actualCost}
                        onChange={(e) => setForm((f) => ({ ...f, actualCost: e.target.value }))}
                        className="mt-1"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">본사 권한으로 저장 시 지급예정에 자동 반영됩니다.</p>
                    </div>
                    {PLATFORM_KEYS.map((key) => (
                      <div key={key} className="sm:col-span-2">
                        <label className="text-xs text-muted-foreground">{key} 링크</label>
                        <Input
                          value={form[key as keyof typeof form] as string}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                          placeholder="https://..."
                          className="mt-1"
                        />
                      </div>
                    ))}
                    <div className="sm:col-span-2">
                      <label className="text-xs text-muted-foreground">메모</label>
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
                      {saving ? "..." : t("itemsBtnSave") || "저장"}
                    </Button>
                    <Button variant="outline" onClick={handleNew}>
                      {t("posCancel") || "취소"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h3 className="text-sm font-semibold">인플루언서 목록</h3>
                  <div className="flex gap-1">
                    <Button variant={sortBy === "name" ? "default" : "outline"} size="sm" onClick={() => setSortBy("name")}>
                      이름순
                    </Button>
                    <Button variant={sortBy === "cpf" ? "default" : "outline"} size="sm" onClick={() => setSortBy("cpf")}>
                      CPF 가성비순
                    </Button>
                  </div>
                </div>
                <div className="divide-y overflow-x-auto">
                  {list.length === 0 && !loading && (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {!campaignFilter.trim()
                        ? "캠페인을 선택하면 해당 캠페인의 인플루언서가 표시됩니다."
                        : "등록된 인플루언서가 없습니다."}
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
                      return (a.name ?? "").localeCompare(b.name ?? "")
                    })
                    .map((i) => {
                      const cpf = getCpf(i.budget ?? 0, i.followers ?? "")
                      const periodLine = formatInfPeriodLine(i.shootingDate, i.publishDate)
                      return (
                        <div
                          key={i.id}
                          className={cn(
                            "flex flex-wrap items-center justify-between gap-2 px-4 py-3",
                            editingId === i.id && "bg-primary/5"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold">{i.name}</div>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                              {periodLine && <span className="font-medium text-foreground">{periodLine}</span>}
                              {i.followers && <span>{i.followers} followers</span>}
                              {i.campaignId && (
                                <span className="rounded bg-muted px-1 font-mono text-[10px]">
                                  {i.campaignNo?.trim() || campaignLabel(i.campaignId)}
                                </span>
                              )}
                              {i.branchReview && <span>{i.branchReview}</span>}
                              {i.budget > 0 && <span>예산 ฿{i.budget.toLocaleString()}</span>}
                              {(i.actualCost ?? 0) > 0 && (
                                <span className="text-foreground">실비 ฿{(i.actualCost ?? 0).toLocaleString()}</span>
                              )}
                              {cpf != null && <span className="font-medium text-primary">CPF ฿{cpf.toFixed(2)}</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(i)}>
                              {t("posEdit") || "수정"}
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
            <div className="mb-4 flex flex-wrap items-end gap-2">
              <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("search")}</label>
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
                onClick={() => void loadInquiryInfs()}
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
              <div className="border-b px-4 py-3">
                <h3 className="text-sm font-semibold">
                  {t("marketingInfluencersTabInquiry")} ({filteredInquiryInfs.length})
                </h3>
              </div>
              <div className="divide-y overflow-x-auto">
                {!inquiryLoading && filteredInquiryInfs.length === 0 && (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("marketingInfluencersInquiryEmpty")}</p>
                )}
                {filteredInquiryInfs.map((i) => {
                  const cid = i.campaignId ? String(i.campaignId) : ""
                  const camp = cid ? campaignById.get(cid) : undefined
                  const st = camp?.status ?? ""
                  const unlinked = !cid || !camp
                  const statusText = unlinked ? t("marketingAdsStatusUnlinked") : campaignStatusLabel(st)
                  const cpf = getCpf(i.budget ?? 0, i.followers ?? "")
                  const periodLine = formatInfPeriodLine(i.shootingDate, i.publishDate)

                  return (
                    <div
                      key={i.id}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{i.name}</span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium",
                              unlinked
                                ? "border border-dashed border-amber-500/60 text-amber-800 dark:text-amber-200"
                                : campaignStatusBadgeClass(st)
                            )}
                          >
                            {statusText}
                          </span>
                          {cid && (
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {i.campaignNo?.trim() || campaignLabel(cid)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {periodLine && <span className="font-medium text-foreground">{periodLine}</span>}
                          {i.followers && <span>{i.followers}</span>}
                          {camp?.topic && <span>{camp.topic}</span>}
                          {i.budget > 0 && <span>예산 ฿{i.budget.toLocaleString()}</span>}
                          {(i.actualCost ?? 0) > 0 && <span>실비 ฿{(i.actualCost ?? 0).toLocaleString()}</span>}
                          {cpf != null && <span className="text-primary">CPF ฿{cpf.toFixed(2)}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={() => openInfInCompose(i)}>
                          {t("marketingAdsOpenComposeTab")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            setMainTab("compose")
                            if (i.campaignId) setCampaignFilter(String(i.campaignId))
                            handleEdit(i)
                          }}
                        >
                          {t("posEdit") || "수정"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-destructive hover:text-destructive"
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
          </TabsContent>
        </Tabs>
    </MarketingPageShell>
  )
}

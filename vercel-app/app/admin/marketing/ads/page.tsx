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
} from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

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

export default function MarketingAdsPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""
  const { auth } = useAuth()
  const [list, setList] = React.useState<MarketingAd[]>([])
  const [campaigns, setCampaigns] = React.useState<{ id: string; topic: string; campaignNo?: string }[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [form, setForm] = React.useState({
    campaignId: "",
    contentFormat: "",
    contentPillar: "",
    contentTopic: "",
    publishDate: "",
    platform: "instagram",
    postLink: "",
    boostBudget: "",
    actualSpent: "",
  })

  const loadData = React.useCallback(() => {
    const cid = campaignFilter.trim()
    setLoading(true)
    Promise.all([
      cid ? getMarketingAds({ campaignId: cid }) : Promise.resolve([] as MarketingAd[]),
      getMarketingCampaigns(),
    ])
      .then(([ads, camps]) => {
        setList(ads)
        setCampaigns(camps.map((c) => ({ id: c.id, topic: c.topic, campaignNo: c.campaignNo })))
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [campaignFilter])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    if (!campaignIdFromQuery) return
    setCampaignFilter(campaignIdFromQuery)
    setForm((f) => ({ ...f, campaignId: campaignIdFromQuery }))
  }, [campaignIdFromQuery])

  const handleNew = () => {
    setEditingId(null)
    setForm({
      campaignId: campaignFilter || "",
      contentFormat: "",
      contentPillar: "",
      contentTopic: "",
      publishDate: "",
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
      platform: a.platform || "instagram",
      postLink: a.postLink || "",
      boostBudget: String(a.boostBudget ?? ""),
      actualSpent: String(a.actualSpent ?? ""),
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
        loadData()
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
    if (!await appConfirm(`${a.platform} 광고를 삭제하시겠습니까?`)) return
    const res = await deleteMarketingAd({ id: a.id })
    if (res.success) {
      loadData()
      if (editingId === a.id) handleNew()
    } else {
      await appAlert(res.message)
    }
  }

  const campaignLabel = React.useCallback(
    (id: string | null | undefined) => {
      if (!id) return ''
      const c = campaigns.find((x) => x.id === id)
      if (!c) return ''
      return `${c.campaignNo ? `[${c.campaignNo}] ` : ''}${c.topic}`
    },
    [campaigns]
  )

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {t("adminMarketingAds") || "광고 ROAS"}
            </h1>
            <p className="text-xs text-muted-foreground">광고 포스트 및 비용 관리</p>
          </div>
        </div>

        <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          광고·비용은 <strong className="text-foreground">캠페인 고유번호</strong>로 묶입니다. 캠페인 허브에서 캠페인을 만든 뒤, 여기서 해당 캠페인을 선택해 주세요.
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={loadData} disabled={loading}>
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t("posRefresh") || "새로고침"}
          </Button>
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">캠페인 선택…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.campaignNo ? `[${c.campaignNo}] ` : ''}
                {c.topic}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={handleNew}>
            <Plus className="h-4 w-4" />
            추가
          </Button>
        </div>
        {campaignIdFromQuery && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            캠페인 허브에서 전달된 항목으로 필터되었습니다. 새 등록은 이 캠페인으로 자동 연결됩니다.
          </div>
        )}

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        <div className="space-y-4">
          {(editingId !== null || form.platform) && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">{editingId ? "광고 수정" : "광고 등록"}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">플랫폼 *</label>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    {PLATFORM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
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
                        {c.campaignNo ? `[${c.campaignNo}] ` : ''}
                        {c.topic}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">게시일</label>
                  <Input
                    type="date"
                    value={form.publishDate}
                    onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))}
                    className="mt-1"
                  />
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
                      <option key={o.value} value={o.value}>{o.label}</option>
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
                      <option key={o.value} value={o.value}>{o.label}</option>
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
                    ? '캠페인을 선택하면 해당 캠페인의 광고 목록이 표시됩니다.'
                    : '등록된 광고가 없습니다.'}
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
                      {a.publishDate && <span>{a.publishDate}</span>}
                      {a.contentTopic && <span>{a.contentTopic}</span>}
                      {(a.boostBudget > 0 || a.actualSpent > 0) && (
                        <span>예산 ฿{(a.boostBudget || 0).toLocaleString()} / 실비 ฿{(a.actualSpent || 0).toLocaleString()}</span>
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
      </div>
    </div>
  )
}

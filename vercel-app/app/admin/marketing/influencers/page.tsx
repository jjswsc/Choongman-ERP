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
} from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

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

export default function MarketingInfluencersPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""
  const { auth } = useAuth()
  const [list, setList] = React.useState<MarketingInfluencer[]>([])
  const [campaigns, setCampaigns] = React.useState<{ id: string; topic: string; campaignNo?: string }[]>([])
  const [loading, setLoading] = React.useState(true)
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

  const loadData = React.useCallback(() => {
    const cid = campaignFilter.trim()
    setLoading(true)
    Promise.all([
      cid ? getMarketingInfluencers({ campaignId: cid }) : Promise.resolve([] as MarketingInfluencer[]),
      getMarketingCampaigns(),
    ])
      .then(([infs, camps]) => {
        setList(infs)
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

  const handleDelete = async (i: MarketingInfluencer) => {
    if (!await appConfirm(`"${i.name}" ${t("posMenuConfirmDelete") || "삭제하시겠습니까?"}`)) return
    const res = await deleteMarketingInfluencer({ id: i.id })
    if (res.success) {
      loadData()
      if (editingId === i.id) handleNew()
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
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {t("adminMarketingInfluencers") || "인플루언서"}
            </h1>
            <p className="text-xs text-muted-foreground">인플루언서 협업 이력 및 비용</p>
          </div>
        </div>

        <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          인플루언서 활동은 <strong className="text-foreground">캠페인 고유번호</strong>로 묶입니다. 캠페인 허브에서 캠페인을 만든 뒤 선택해 주세요.
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
          {(editingId !== null || form.name) && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">{editingId ? "인플루언서 수정" : "인플루언서 등록"}</h3>
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
                        {c.campaignNo ? `[${c.campaignNo}] ` : ''}
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
                      <option key={o.value} value={o.value}>{o.label}</option>
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
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    본사 권한으로 저장 시 지급예정에 자동 반영됩니다.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">촬영일</label>
                  <Input
                    type="date"
                    value={form.shootingDate}
                    onChange={(e) => setForm((f) => ({ ...f, shootingDate: e.target.value }))}
                    className="mt-1"
                  />
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
            <div className="border-b px-4 py-3 flex justify-between items-center">
              <h3 className="text-sm font-semibold">인플루언서 목록</h3>
              <div className="flex gap-1">
                <Button variant={sortBy === "name" ? "default" : "outline"} size="sm" onClick={() => setSortBy("name")}>이름순</Button>
                <Button variant={sortBy === "cpf" ? "default" : "outline"} size="sm" onClick={() => setSortBy("cpf")}>CPF 가성비순</Button>
              </div>
            </div>
            <div className="divide-y overflow-x-auto">
              {list.length === 0 && !loading && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {!campaignFilter.trim()
                    ? '캠페인을 선택하면 해당 캠페인의 인플루언서가 표시됩니다.'
                    : '등록된 인플루언서가 없습니다.'}
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
                      {cpf != null && <span className="text-primary font-medium">CPF ฿{cpf.toFixed(2)}</span>}
                      {i.publishDate && <span>{i.publishDate}</span>}
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
              )})}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

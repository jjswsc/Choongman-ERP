"use client"

import * as React from "react"
import { Package, RotateCw, ExternalLink, LayoutGrid, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getMarketingMaterials,
  getMarketingCampaigns,
  useStoreList,
  type MarketingMaterial,
  type MarketingCampaign,
} from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { getBangkokDateStr } from "@/lib/pos-business-day"
import { addDaysYmd } from "@/lib/pos-business-day"

const MATERIAL_STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-700",
  producing: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
  distributed: "bg-green-100 text-green-800",
}

type ViewMode = "store" | "material"

export default function MarketingMaterialsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { lang } = useLang()
  const t = useT(lang)
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""

  const [materials, setMaterials] = React.useState<MarketingMaterial[]>([])
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)
  const [viewMode, setViewMode] = React.useState<ViewMode>("store")
  const [storeFilter, setStoreFilter] = React.useState("")
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [searchQuery, setSearchQuery] = React.useState("")

  const { stores } = useStoreList()

  const tr = React.useCallback(
    (ko: string, en: string, th: string) => {
      if (lang === "en") return en
      if (lang === "th") return th
      return ko
    },
    [lang]
  )

  const materialTypeLabel = React.useCallback(
    (value: string) => {
      switch (value) {
        case "tentcard":
          return tr("텐트카드", "Tent Card", "เทนท์การ์ด")
        case "standee":
          return tr("스탠디", "Standee", "สแตนดี้")
        case "coupon":
          return tr("쿠폰/전단", "Coupon/Flyer", "คูปอง/ใบปลิว")
        case "flyer":
          return tr("플라이어", "Flyer", "ใบปลิว")
        case "banner":
          return tr("배너", "Banner", "แบนเนอร์")
        case "prop":
          return tr("프롭", "Props", "พร็อพ")
        case "other":
          return tr("기타", "Other", "อื่นๆ")
        default:
          return value
      }
    },
    [tr]
  )

  const materialStatusLabel = React.useCallback(
    (value: string) => {
      switch (value) {
        case "planning":
          return tr("계획중", "Planning", "วางแผน")
        case "producing":
          return tr("제작중", "Producing", "กำลังผลิต")
        case "completed":
          return tr("완료", "Completed", "เสร็จแล้ว")
        case "distributed":
          return tr("배포완료", "Distributed", "แจกจ่ายแล้ว")
        default:
          return value
      }
    },
    [tr]
  )

  const loadData = React.useCallback(() => {
    setLoading(true)
    const campaignParam = campaignFilter || campaignIdFromQuery || undefined
    Promise.all([
      getMarketingMaterials(
        campaignParam ? { campaignId: campaignParam } : undefined
      ),
      getMarketingCampaigns(),
    ])
      .then(([mats, camps]) => {
        setMaterials(mats)
        setCampaigns(camps)
      })
      .catch(() => setMaterials([]))
      .finally(() => setLoading(false))
  }, [campaignFilter, campaignIdFromQuery])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    if (campaignIdFromQuery) {
      setCampaignFilter(campaignIdFromQuery)
    }
  }, [campaignIdFromQuery])

  const campaignMap = React.useMemo(() => {
    const m: Record<string, MarketingCampaign> = {}
    campaigns.forEach((c) => {
      m[c.id] = c
    })
    return m
  }, [campaigns])

  const filteredMaterials = React.useMemo(() => {
    let list = materials
    if (storeFilter) {
      list = list.filter((m) =>
        (m.branches || []).some((b) => b === storeFilter)
      )
    }
    if (campaignFilter) {
      list = list.filter((m) => m.campaignId === campaignFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.type || "").toLowerCase().includes(q)
      )
    }
    return list
  }, [materials, storeFilter, campaignFilter, searchQuery])

  const byStore = React.useMemo(() => {
    const map: Record<string, { material: MarketingMaterial; campaign: MarketingCampaign | undefined }[]> = {}
    for (const mat of filteredMaterials) {
      const campaign = mat.campaignId ? campaignMap[mat.campaignId] : undefined
      const branches = mat.branches && mat.branches.length > 0 ? mat.branches : [tr("미지정", "Unassigned", "ยังไม่ระบุ")]
      for (const branch of branches) {
        if (!map[branch]) map[branch] = []
        map[branch].push({ material: mat, campaign })
      }
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredMaterials, campaignMap, tr])

  const todayBangkok = getBangkokDateStr()
  const cutoffDate = addDaysYmd(todayBangkok, -30)

  const isLongInstalled = React.useCallback(
    (endDate: string | null | undefined) => {
      if (!endDate || !endDate.trim()) return false
      return endDate < cutoffDate
    },
    [cutoffDate]
  )

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {t("adminMarketingMaterials") || "홍보물"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {tr("마케팅 홍보물 현황", "Marketing Materials Overview", "ภาพรวมสื่อโปรโมชัน")}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            onClick={loadData}
            disabled={loading}
          >
            <RotateCw
              className={cn("h-4 w-4", loading && "animate-spin")}
            />
            {t("posRefresh") || "새로고침"}
          </Button>

          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">
              {tr("전체 매장", "All Stores", "ทุกสาขา")}
            </option>
            {stores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">
              {tr("전체 캠페인", "All Campaigns", "ทุกแคมเปญ")}
            </option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.topic}
              </option>
            ))}
          </select>

          <Input
            placeholder={tr("홍보물명 검색", "Search material name", "ค้นหาชื่อสื่อ")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-48"
          />

          <div className="ml-2 flex rounded-md border border-input p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("store")}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded px-3 text-sm",
                viewMode === "store"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Store className="h-4 w-4" />
              {tr("매장별", "By Store", "ตามสาขา")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("material")}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded px-3 text-sm",
                viewMode === "material"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              {tr("홍보물별", "By Material", "ตามสื่อ")}
            </button>
          </div>
        </div>

        {campaignIdFromQuery && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            {tr("캠페인 허브에서 전달된 항목으로 필터되었습니다.", "Filtered by campaign from hub.", "กรองตามแคมเปญจากฮับ")}
          </div>
        )}

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        <div className="space-y-4">
          {viewMode === "store" && (
            <div className="space-y-4">
              {byStore.length === 0 && !loading && (
                <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                  {tr("등록된 홍보물이 없습니다.", "No materials registered.", "ไม่มีสื่อที่ลงทะเบียน")}
                </p>
              )}
              {byStore.map(([storeName, items]) => (
                <div
                  key={storeName}
                  className="rounded-xl border bg-card overflow-hidden"
                >
                  <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">
                    {storeName}
                  </div>
                  <div className="divide-y">
                    {items.map(({ material, campaign }) => (
                      <div
                        key={material.id}
                        className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{material.name}</span>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                MATERIAL_STATUS_COLORS[material.status] ||
                                  "bg-gray-100 text-gray-700"
                              )}
                            >
                              {materialStatusLabel(material.status)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {materialTypeLabel(material.type)}
                            </span>
                            {campaign &&
                              isLongInstalled(campaign.endDate) && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                  {tr("오래 설치됨", "Long installed", "ติดตั้งมานาน")}
                                </span>
                              )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            <span>
                              {tr("수량", "Qty", "จำนวน")}: {material.quantity}
                            </span>
                            {campaign && (
                              <>
                                <span>{campaign.topic}</span>
                                <span>
                                  {campaign.startDate || "-"} ~{" "}
                                  {campaign.endDate || "-"}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {material.campaignId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 gap-1 text-xs"
                            onClick={() =>
                              router.push(
                                `/admin/marketing/campaigns?openCampaign=${material.campaignId}&tab=materials`
                              )
                            }
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {tr("캠페인에서 수정", "Edit in Campaign", "แก้ไขในแคมเปญ")}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === "material" && (
            <div className="rounded-xl border bg-card">
              <div className="divide-y">
                {filteredMaterials.length === 0 && !loading && (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {tr("등록된 홍보물이 없습니다.", "No materials registered.", "ไม่มีสื่อที่ลงทะเบียน")}
                  </p>
                )}
                {filteredMaterials.map((mat) => {
                  const campaign = mat.campaignId
                    ? campaignMap[mat.campaignId]
                    : undefined
                  return (
                    <div
                      key={mat.id}
                      className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{mat.name}</span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium",
                              MATERIAL_STATUS_COLORS[mat.status] ||
                                "bg-gray-100 text-gray-700"
                            )}
                          >
                            {materialStatusLabel(mat.status)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {materialTypeLabel(mat.type)}
                          </span>
                          {campaign &&
                            isLongInstalled(campaign.endDate) && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                {tr("오래 설치됨", "Long installed", "ติดตั้งมานาน")}
                              </span>
                            )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span>
                            {tr("수량", "Qty", "จำนวน")}: {mat.quantity}
                          </span>
                          {mat.branches && mat.branches.length > 0 && (
                            <span>
                              {tr("매장", "Stores", "สาขา")}:{" "}
                              {mat.branches.join(", ")}
                            </span>
                          )}
                          {campaign && (
                            <>
                              <span>{campaign.topic}</span>
                              <span>
                                {campaign.startDate || "-"} ~{" "}
                                {campaign.endDate || "-"}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {mat.campaignId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 gap-1 text-xs"
                          onClick={() =>
                            router.push(
                              `/admin/marketing/campaigns?openCampaign=${mat.campaignId}&tab=materials`
                            )
                          }
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {tr("캠페인에서 수정", "Edit in Campaign", "แก้ไขในแคมเปญ")}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

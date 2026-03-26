"use client"

import * as React from "react"
import { appAlert } from "@/lib/app-message"
import { Package, RotateCw, ExternalLink, LayoutGrid, Store, Plus, Save, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  getMarketingMaterials,
  getMarketingCampaigns,
  getMarketingMaterialGifts,
  saveMarketingMaterial,
  useStoreList,
  type MarketingMaterial,
  type MarketingCampaign,
  type MarketingMaterialGift,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { getBangkokDateStr } from "@/lib/pos-business-day"
import { addDaysYmd } from "@/lib/pos-business-day"
import { MarketingMaterialGiftsPanel } from "@/components/marketing/material-gifts-panel"

const MATERIAL_STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-700",
  producing: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
  distributed: "bg-green-100 text-green-800",
}

const MATERIAL_PLACEMENT_SPOTS = [
  { value: "counter", ko: "카운터", en: "Counter", th: "เคาน์เตอร์" },
  { value: "tv", ko: "TV", en: "TV", th: "ทีวี" },
  { value: "table", ko: "테이블", en: "Table", th: "โต๊ะ" },
  { value: "entrance", ko: "입구", en: "Entrance", th: "ทางเข้า" },
]

const MATERIAL_TYPE_VALUES = [
  "tentcard",
  "standee",
  "coupon",
  "flyer",
  "banner",
  "prop",
  "other",
] as const

const MATERIAL_STATUS_VALUES = ["planning", "producing", "completed", "distributed"] as const

function defaultMaterialAddForm() {
  return {
    type: "tentcard" as string,
    name: "",
    quantity: "1",
    unitCost: "",
    actualCost: "",
    branches: [] as string[],
    isHqWide: false,
    displayStartDate: "",
    displayEndDate: "",
    placementSpots: [] as string[],
    status: "planning" as string,
    note: "",
  }
}

type ViewMode = "store" | "material"
type MainTab = "overview" | "gifts"

export default function MarketingMaterialsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""
  const mainTab: MainTab = searchParams.get("tab") === "gifts" ? "gifts" : "overview"

  const setMainTab = React.useCallback(
    (tab: MainTab) => {
      const p = new URLSearchParams(searchParams.toString())
      if (tab === "gifts") p.set("tab", "gifts")
      else p.delete("tab")
      const qs = p.toString()
      router.replace(qs ? `/admin/marketing/materials?${qs}` : "/admin/marketing/materials")
    },
    [router, searchParams]
  )

  const [materials, setMaterials] = React.useState<MarketingMaterial[]>([])
  const [materialGifts, setMaterialGifts] = React.useState<MarketingMaterialGift[]>([])
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)
  const [viewMode, setViewMode] = React.useState<ViewMode>("store")
  const [storeFilter, setStoreFilter] = React.useState("")
  const [hqFilter, setHqFilter] = React.useState<"" | "hq" | "store">("")
  const [spotFilter, setSpotFilter] = React.useState("")
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [materialAddOpen, setMaterialAddOpen] = React.useState(false)
  const [materialAddForm, setMaterialAddForm] = React.useState(defaultMaterialAddForm)
  const [savingMaterialAdd, setSavingMaterialAdd] = React.useState(false)

  const { stores } = useStoreList()

  const activeCampaignId = (campaignFilter || campaignIdFromQuery || "").trim()

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
  const materialPlacementSpotLabel = React.useCallback(
    (value: string) => {
      const found = MATERIAL_PLACEMENT_SPOTS.find((x) => x.value === value)
      if (!found) return value
      if (lang === "en") return found.en
      if (lang === "th") return found.th
      return found.ko
    },
    [lang]
  )

  const loadData = React.useCallback(() => {
    setLoading(true)
    const campaignParam = (campaignFilter || campaignIdFromQuery || "").trim()
    if (!campaignParam) {
      setMaterials([])
      setMaterialGifts([])
      getMarketingCampaigns()
        .then((camps) => setCampaigns(Array.isArray(camps) ? camps : []))
        .catch(() => setCampaigns([]))
        .finally(() => setLoading(false))
      return
    }
    Promise.all([
      getMarketingMaterials({ campaignId: campaignParam }),
      getMarketingCampaigns(),
      getMarketingMaterialGifts({ campaignId: campaignParam }),
    ])
      .then(([mats, camps, gifts]) => {
        setMaterials(mats)
        setCampaigns(camps)
        setMaterialGifts(Array.isArray(gifts) ? gifts : [])
      })
      .catch(() => {
        setMaterials([])
        setMaterialGifts([])
      })
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

  React.useEffect(() => {
    if (!activeCampaignId) setMaterialAddOpen(false)
  }, [activeCampaignId])

  const toggleMaterialAddBranch = (store: string) => {
    setMaterialAddForm((f) => ({
      ...f,
      branches: f.branches.includes(store)
        ? f.branches.filter((b) => b !== store)
        : [...f.branches, store],
    }))
  }

  const toggleMaterialAddSpot = (spot: string) => {
    setMaterialAddForm((f) => ({
      ...f,
      placementSpots: f.placementSpots.includes(spot)
        ? f.placementSpots.filter((x) => x !== spot)
        : [...f.placementSpots, spot],
    }))
  }

  const handleMaterialAddSave = async () => {
    const name = materialAddForm.name.trim()
    if (!activeCampaignId) {
      await appAlert(tr("캠페인을 먼저 선택하세요.", "Select a campaign first.", "กรุณาเลือกแคมเปญก่อน"))
      return
    }
    if (!name) {
      await appAlert(tr("홍보물 이름을 입력하세요.", "Enter a material name.", "กรุณากรอกชื่อสื่อ"))
      return
    }
    setSavingMaterialAdd(true)
    try {
      const res = await saveMarketingMaterial({
        campaignId: activeCampaignId,
        type: materialAddForm.type,
        name,
        quantity: Number(materialAddForm.quantity) || 1,
        unitCost: Number(materialAddForm.unitCost) || 0,
        actualCost: Number(materialAddForm.actualCost) || 0,
        branches: materialAddForm.isHqWide ? [] : materialAddForm.branches,
        isHqWide: materialAddForm.isHqWide,
        displayStartDate: materialAddForm.displayStartDate.trim() || null,
        displayEndDate: materialAddForm.displayEndDate.trim() || null,
        placementSpots: materialAddForm.placementSpots,
        status: materialAddForm.status,
        note: materialAddForm.note.trim(),
        userRole: auth?.role,
        userName: auth?.user,
      })
      if (res.success) {
        const extra = res.expenseSyncMessage ? `\n\n${res.expenseSyncMessage}` : ""
        await appAlert(tr("저장되었습니다.", "Saved.", "บันทึกแล้ว") + extra)
        setMaterialAddForm(defaultMaterialAddForm())
        void loadData()
      } else {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSavingMaterialAdd(false)
    }
  }

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
        m.isHqWide || (m.branches || []).some((b) => b === storeFilter)
      )
    }
    if (hqFilter === "hq") {
      list = list.filter((m) => m.isHqWide)
    } else if (hqFilter === "store") {
      list = list.filter((m) => !m.isHqWide)
    }
    if (spotFilter) {
      list = list.filter((m) => (m.placementSpots || []).includes(spotFilter))
    }
    if (campaignFilter) {
      list = list.filter((m) => m.campaignId === campaignFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.type || "").toLowerCase().includes(q) ||
          (m.campaignNo || "").toLowerCase().includes(q)
      )
    }
    return list
  }, [materials, storeFilter, hqFilter, spotFilter, campaignFilter, searchQuery])

  const hqLabel = tr("본사공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")

  const sumGiftQty = React.useCallback((rows: MarketingMaterialGift[]) => {
    return rows.reduce(
      (a, g) => ({
        alloc: a.alloc + g.allocatedQty,
        dist: a.dist + g.distributedQty,
        rem: a.rem + g.remainingQty,
      }),
      { alloc: 0, dist: 0, rem: 0 }
    )
  }, [])

  const giftsForDisplay = React.useCallback(
    (mat: MarketingMaterial, storeBucket: string) => {
      const isHqBucket = mat.isHqWide && storeBucket === hqLabel
      return materialGifts.filter((g) => {
        if (g.materialId !== mat.id) return false
        if (isHqBucket) return true
        if (storeFilter && g.storeName !== storeFilter) return false
        return g.storeName === storeBucket
      })
    },
    [materialGifts, hqLabel, storeFilter]
  )

  const giftsForMaterialRow = React.useCallback(
    (mat: MarketingMaterial) => {
      return materialGifts.filter((g) => {
        if (g.materialId !== mat.id) return false
        if (!storeFilter) return true
        if (mat.isHqWide) return true
        return g.storeName === storeFilter
      })
    },
    [materialGifts, storeFilter]
  )

  const byStore = React.useMemo(() => {
    const map: Record<string, { material: MarketingMaterial; campaign: MarketingCampaign | undefined }[]> = {}
    for (const mat of filteredMaterials) {
      const campaign = mat.campaignId ? campaignMap[mat.campaignId] : undefined
      const branches = mat.isHqWide
        ? [hqLabel]
        : mat.branches && mat.branches.length > 0
          ? mat.branches
          : [tr("미지정", "Unassigned", "ยังไม่ระบุ")]
      for (const branch of branches) {
        if (!map[branch]) map[branch] = []
        map[branch].push({ material: mat, campaign })
      }
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredMaterials, campaignMap, tr, hqLabel])

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
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
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

        <div className="mb-4 flex rounded-lg border border-input bg-muted/30 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setMainTab("overview")}
            className={cn(
              "flex flex-1 items-center justify-center rounded-md py-2.5 transition-colors",
              mainTab === "overview"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tr("홍보물 현황", "Materials overview", "ภาพรวมสื่อ")}
          </button>
          <button
            type="button"
            onClick={() => setMainTab("gifts")}
            className={cn(
              "flex flex-1 items-center justify-center rounded-md py-2.5 transition-colors",
              mainTab === "gifts"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("adminMarketingMaterialGifts") || tr("사은품", "Gifts", "ของแถม")}
          </button>
        </div>

        {mainTab === "gifts" ? (
          campaignFilter || campaignIdFromQuery ? (
            <MarketingMaterialGiftsPanel
              syncCampaignId={campaignFilter || campaignIdFromQuery}
              showPageHeader={false}
            />
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
              {tr("사은품을 보려면 캠페인을 선택하세요.", "Select a campaign to manage gifts.", "เลือกแคมเปญเพื่อจัดการของแถม")}
            </div>
          )
        ) : (
          <>
        <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {tr(
            "홍보물은 캠페인 허브의 고유번호(campaign_no)로 연결됩니다. 캠페인을 선택한 뒤 조회하세요.",
            "Materials are linked by the campaign code from Campaign Hub. Select a campaign to load data.",
            "สื่อเชื่อมด้วยรหัสแคมเปญจากศูนย์กลาง — เลือกแคมเปญก่อน"
          )}
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

          <Button
            type="button"
            size="sm"
            className="h-10 gap-1.5"
            disabled={!activeCampaignId || loading}
            title={
              !activeCampaignId
                ? tr("캠페인을 선택한 뒤 추가할 수 있습니다.", "Select a campaign to add.", "เลือกแคมเปญก่อนเพิ่ม")
                : undefined
            }
            variant={materialAddOpen ? "secondary" : "default"}
            onClick={() => setMaterialAddOpen((o) => !o)}
          >
            <Plus className="h-4 w-4" />
            {tr("홍보물 추가", "Add material", "เพิ่มสื่อ")}
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
            value={hqFilter}
            onChange={(e) => setHqFilter(e.target.value as "" | "hq" | "store")}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{tr("본사/매장 전체", "HQ/Store All", "ทั้งหมด (สำนักงานใหญ่/สาขา)")}</option>
            <option value="hq">{tr("본사공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")}</option>
            <option value="store">{tr("매장별 운영", "Store-based", "ตามสาขา")}</option>
          </select>

          <select
            value={spotFilter}
            onChange={(e) => setSpotFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{tr("매장 위치 전체", "All Placements", "ตำแหน่งทั้งหมด")}</option>
            {MATERIAL_PLACEMENT_SPOTS.map((spot) => (
              <option key={spot.value} value={spot.value}>
                {materialPlacementSpotLabel(spot.value)}
              </option>
            ))}
          </select>

          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">
              {tr("캠페인 선택…", "Select campaign…", "เลือกแคมเปญ…")}
            </option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.campaignNo ? `[${c.campaignNo}] ` : ""}
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

        {materialAddOpen && activeCampaignId && (
          <div className="mb-4 rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">
              {tr("새 홍보물 등록", "Register new material", "ลงทะเบียนสื่อใหม่")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] text-muted-foreground">{tr("종류", "Type", "ประเภท")}</label>
                <select
                  value={materialAddForm.type}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, type: e.target.value }))}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {MATERIAL_TYPE_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {materialTypeLabel(v)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{tr("상태", "Status", "สถานะ")}</label>
                <select
                  value={materialAddForm.status}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, status: e.target.value }))}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {MATERIAL_STATUS_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {materialStatusLabel(v)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">{tr("이름/설명 *", "Name *", "ชื่อ *")}</label>
                <Input
                  value={materialAddForm.name}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 h-9"
                  placeholder={tr("예: 여름 시즌 스탠디", "e.g. Summer standee", "เช่น สแตนดี้ซัมเมอร์")}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{tr("수량", "Qty", "จำนวน")}</label>
                <Input
                  type="number"
                  min={1}
                  value={materialAddForm.quantity}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{tr("단가 (฿)", "Unit (฿)", "ราคาต่อหน่วย (฿)")}</label>
                <Input
                  type="number"
                  min={0}
                  value={materialAddForm.unitCost}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, unitCost: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">
                  {tr("실제 비용 (฿)", "Actual cost (฿)", "ค่าใช้จ่ายจริง (฿)")}
                </label>
                <Input
                  type="number"
                  min={0}
                  value={materialAddForm.actualCost}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, actualCost: e.target.value }))}
                  className="mt-1 h-9"
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {tr(
                    "본사 권한이면 지출관리 지급예정에 연동됩니다.",
                    "Office role: links to expense planned payments.",
                    "สิทธิ์สำนักงาน: เชื่อมค่าใช้จ่ายที่กำหนดจ่าย"
                  )}
                </p>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{tr("게시 시작", "Display from", "เริ่มแสดง")}</label>
                <Input
                  type="date"
                  value={materialAddForm.displayStartDate}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, displayStartDate: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{tr("게시 종료", "Display until", "สิ้นสุดแสดง")}</label>
                <Input
                  type="date"
                  value={materialAddForm.displayEndDate}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, displayEndDate: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={materialAddForm.isHqWide}
                    onCheckedChange={(v) =>
                      setMaterialAddForm((f) => ({ ...f, isHqWide: v === true }))
                    }
                  />
                  {tr("본사 공용 홍보물", "HQ-wide material", "สื่อส่วนกลางสำนักงานใหญ่")}
                </label>
              </div>
              {!materialAddForm.isHqWide && stores.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="mb-1 text-[10px] text-muted-foreground">{tr("배포 매장", "Branches", "สาขา")}</p>
                  <div className="flex flex-wrap gap-2">
                    {stores.map((store) => (
                      <label key={store} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={materialAddForm.branches.includes(store)}
                          onCheckedChange={() => toggleMaterialAddBranch(store)}
                        />
                        {store}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="sm:col-span-2">
                <p className="mb-1 text-[10px] text-muted-foreground">{tr("매장 위치", "Placement", "ตำแหน่ง")}</p>
                <div className="flex flex-wrap gap-2">
                  {MATERIAL_PLACEMENT_SPOTS.map((spot) => (
                    <label key={spot.value} className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={materialAddForm.placementSpots.includes(spot.value)}
                        onCheckedChange={() => toggleMaterialAddSpot(spot.value)}
                      />
                      {materialPlacementSpotLabel(spot.value)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">{tr("메모", "Note", "บันทึก")}</label>
                <Input
                  value={materialAddForm.note}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, note: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void handleMaterialAddSave()} disabled={savingMaterialAdd}>
                {savingMaterialAdd ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                {tr("저장", "Save", "บันทึก")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMaterialAddOpen(false)
                  setMaterialAddForm(defaultMaterialAddForm())
                }}
              >
                {tr("닫기", "Close", "ปิด")}
              </Button>
            </div>
          </div>
        )}

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
                  {!(campaignFilter || campaignIdFromQuery)
                    ? tr("캠페인을 선택하면 홍보물이 표시됩니다.", "Select a campaign to view materials.", "เลือกแคมเปญเพื่อดูสื่อ")
                    : tr("등록된 홍보물이 없습니다.", "No materials registered.", "ไม่มีสื่อที่ลงทะเบียน")}
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
                    {items.map(({ material, campaign }) => {
                      const giftRows = giftsForDisplay(material, storeName)
                      const giftSum = giftRows.length > 0 ? sumGiftQty(giftRows) : null
                      return (
                      <div
                        key={`${storeName}-${material.id}`}
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
                            {material.isHqWide && (
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
                                {tr("본사공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")}
                              </span>
                            )}
                            {campaign &&
                              isLongInstalled(material.displayEndDate || campaign.endDate) && (
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
                                <span className="font-mono text-[10px] text-foreground">
                                  {material.campaignNo?.trim() || campaign.campaignNo
                                    ? `[${material.campaignNo?.trim() || campaign.campaignNo}] `
                                    : ""}
                                  {campaign.topic}
                                </span>
                                <span>
                                  {material.displayStartDate || campaign.startDate || "-"} ~{" "}
                                  {material.displayEndDate || campaign.endDate || "-"}
                                </span>
                              </>
                            )}
                            {material.placementSpots && material.placementSpots.length > 0 && (
                              <span>
                                {tr("위치", "Placement", "ตำแหน่ง")}:{" "}
                                {material.placementSpots.map((spot) => materialPlacementSpotLabel(spot)).join(", ")}
                              </span>
                            )}
                            {giftSum && (
                              <span>
                                {tr("사은품", "Gifts", "ของแถม")}: {tr("배정", "Alloc", "จัดสรร")}{" "}
                                {giftSum.alloc} · {tr("배포", "Dist", "แจกจ่าย")} {giftSum.dist} ·{" "}
                                {tr("잔여", "Left", "คงเหลือ")} {giftSum.rem}
                              </span>
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
                    )})}
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
                    {!(campaignFilter || campaignIdFromQuery)
                      ? tr("캠페인을 선택하면 홍보물이 표시됩니다.", "Select a campaign to view materials.", "เลือกแคมเปญเพื่อดูสื่อ")
                      : tr("등록된 홍보물이 없습니다.", "No materials registered.", "ไม่มีสื่อที่ลงทะเบียน")}
                  </p>
                )}
                {filteredMaterials.map((mat) => {
                  const campaign = mat.campaignId
                    ? campaignMap[mat.campaignId]
                    : undefined
                  const giftRowsMat = giftsForMaterialRow(mat)
                  const giftSumMat =
                    giftRowsMat.length > 0 ? sumGiftQty(giftRowsMat) : null
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
                          {mat.isHqWide && (
                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
                              {tr("본사공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")}
                            </span>
                          )}
                          {campaign &&
                            isLongInstalled(mat.displayEndDate || campaign.endDate) && (
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
                          {mat.placementSpots && mat.placementSpots.length > 0 && (
                            <span>
                              {tr("위치", "Placement", "ตำแหน่ง")}:{" "}
                              {mat.placementSpots.map((spot) => materialPlacementSpotLabel(spot)).join(", ")}
                            </span>
                          )}
                          {campaign && (
                            <>
                              <span className="font-mono text-[10px] text-foreground">
                                {mat.campaignNo?.trim() || campaign.campaignNo
                                  ? `[${mat.campaignNo?.trim() || campaign.campaignNo}] `
                                  : ""}
                                {campaign.topic}
                              </span>
                              <span>
                                {mat.displayStartDate || campaign.startDate || "-"} ~{" "}
                                {mat.displayEndDate || campaign.endDate || "-"}
                              </span>
                            </>
                          )}
                          {giftSumMat && (
                            <span>
                              {tr("사은품", "Gifts", "ของแถม")}: {tr("배정", "Alloc", "จัดสรร")}{" "}
                              {giftSumMat.alloc} · {tr("배포", "Dist", "แจกจ่าย")} {giftSumMat.dist} ·{" "}
                              {tr("잔여", "Left", "คงเหลือ")} {giftSumMat.rem}
                            </span>
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
          </>
        )}
      </div>
    </div>
  )
}

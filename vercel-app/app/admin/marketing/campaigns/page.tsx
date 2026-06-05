"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import {
  Megaphone, Save, Plus, Trash2, RotateCw, Upload, Calculator, Copy,
  Users, Package, BarChart2, ExternalLink, Loader2, CheckCheck, X,
  List, ClipboardPen, Search, Tag, TrendingUp, ChevronDown, ChevronUp,
  GitCompare, Filter, AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMarketingCampaign,
  getNextCampaignNumber,
  saveMarketingCampaign,
  deleteMarketingCampaign,
  importMarketingExcel,
  getMarketingCampaignResults,
  getMarketingCampaignCosts,
  getMarketingAds,
  getMarketingInfluencers,
  getPosPromos,
  getMarketingMaterials,
  saveMarketingMaterial,
  deleteMarketingMaterial,
  getMarketingMaterialGifts,
  saveMarketingMaterialGift,
  deleteMarketingMaterialGift,
  useStoreList,
  type MarketingCampaign,
  type MarketingInfluencer,
  type MarketingMaterial,
  type MarketingMaterialGift,
} from "@/lib/api-client"
import { computedGiftRemaining, giftRowQtyMismatch } from "@/lib/marketing-material-gift-inventory"
import { cn } from "@/lib/utils"
import { getBangkokRolling30DayRangeYmd } from "@/lib/collab-overview-period"
import { PromoSetSimulator } from "@/components/marketing/promo-set-simulator"
import { CampaignAbComparePanel } from "@/components/marketing/campaign-ab-compare-panel"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"
import {
  defaultMarketingMaterialTypeOptions,
  loadMarketingMaterialTypeOptions,
  materialTypeSelectOptions,
  resolveMaterialTypeLabel,
  type MarketingMaterialTypeOption,
} from "@/lib/marketing-material-type-options"
import {
  defaultMarketingMaterialPlacementOptions,
  loadMarketingMaterialPlacementOptions,
  resolvePlacementLabel,
  type MarketingMaterialPlacementOption,
} from "@/lib/marketing-material-placement-options"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import { buildMarketingCampaignHubLinkSetsFromRows } from "@/lib/marketing-campaign-hub-link-data"
import {
  applyMarketingCampaignListFilters,
  marketingCampaignListFiltersActive,
  type CampaignListSearchScope,
} from "@/lib/marketing-campaign-list-query"
import { apiFetchWithOffline } from "@/lib/api/fetch-offline"
import {
  CAMPAIGN_TYPE_OPTIONS,
  KPI_UNIT_OPTIONS,
  getCampaignTypeLabel,
  toCampaignTypeFormState,
  toCampaignTypeStorageValue,
} from "@/lib/marketing-campaign-type-utils"

// ─── 상수 ────────────────────────────────────────────────────────────────────
const DEFAULT_DELIVERY_APPS = ["그랩", "라인맨", "쇼피", "기타"]

type ChannelState = {
  online: boolean
  hall: boolean
  takeout: boolean
  apps: string[]
}

const dedupeNames = (values: string[]) =>
  Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)))

const parseCampaignFormat = (raw: string): ChannelState => {
  const text = (raw || "").trim()
  if (!text) return { online: false, hall: false, takeout: false, apps: [] }

  const lower = text.toLowerCase()
  const online = /온라인|delivery/.test(lower) || /grab|line ?man|lineman|shopee/.test(lower)
  const hall = /홀|dine[\s-]?in/.test(lower)
  const takeout = /포장|carry[\s-]?out/.test(lower)

  const apps: string[] = []
  const appGroup = text.match(/온라인\s*\(([^)]*)\)/i) || text.match(/delivery\s*\(([^)]*)\)/i)
  if (appGroup?.[1]) {
    apps.push(...appGroup[1].split(/[,&/]/).map((s) => s.trim()).filter(Boolean))
  } else {
    if (/grab/i.test(text)) apps.push("그랩")
    if (/line ?man|lineman/i.test(text)) apps.push("라인맨")
    if (/shopee/i.test(text)) apps.push("쇼피")
    if (/기타|other/i.test(text)) apps.push("기타")
  }

  return { online, hall, takeout, apps: dedupeNames(apps) }
}

const serializeCampaignFormat = (state: ChannelState) => {
  const parts: string[] = []
  if (state.online) {
    parts.push(state.apps.length > 0 ? `온라인(${state.apps.join(", ")})` : "온라인")
  }
  if (state.hall) parts.push("홀")
  if (state.takeout) parts.push("포장")
  return parts.join(" / ")
}

const STATUS_OPTIONS = [
  { value: "draft", label: "준비" },
  { value: "ongoing", label: "진행중" },
  { value: "finish", label: "완료" },
]

type CostFieldKey = "costAdsOnline" | "costAdsOffline" | "costProduction" | "costFood" | "costInfluencer" | "costOther"

const COST_FIELD_OPTIONS: { key: CostFieldKey; labelKey: string }[] = [
  { key: "costAdsOnline", labelKey: "costAdsOnline" },
  { key: "costAdsOffline", labelKey: "costAdsOffline" },
  { key: "costProduction", labelKey: "costProduction" },
  { key: "costFood", labelKey: "costFood" },
  { key: "costInfluencer", labelKey: "costInfluencer" },
  { key: "costOther", labelKey: "costOther" },
]

const buildCostFlags = (values: {
  costAdsOnline?: number | string
  costAdsOffline?: number | string
  costProduction?: number | string
  costFood?: number | string
  costInfluencer?: number | string
  costOther?: number | string
  costOtherLabel?: string
}) => ({
  costAdsOnline: Number(values.costAdsOnline) > 0,
  costAdsOffline: Number(values.costAdsOffline) > 0,
  costProduction: Number(values.costProduction) > 0,
  costFood: Number(values.costFood) > 0,
  costInfluencer: Number(values.costInfluencer) > 0,
  costOther: Number(values.costOther) > 0 || String(values.costOtherLabel ?? "").trim().length > 0,
})

const MATERIAL_STATUSES = [
  { value: "planning", label: "계획중" },
  { value: "producing", label: "제작중" },
  { value: "completed", label: "완료" },
  { value: "distributed", label: "배포완료" },
]

const MATERIAL_STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-700",
  producing: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
  distributed: "bg-green-100 text-green-800",
}

type CampaignPhaseFormRow = { label: string; startDate: string; endDate: string }

// ─── 기본값 ──────────────────────────────────────────────────────────────────
const defaultForm = {
  campaignNo: "",
  topic: "",
  format: "",
  campaignType: "menu_discount",
  status: "draft",
  detail: "",
  startDate: "",
  endDate: "",
  designStartDate: "",
  designEndDate: "",
  designNote: "",
  phasePeriods: [] as CampaignPhaseFormRow[],
  branches: [] as string[],
  discountType: "percent",
  discountValue: "",
  discountPricePromotion: "",
  discountTargetAudience: "",
  collabManagement: false,
  costAdsOnline: "",
  costAdsOffline: "",
  costProduction: "",
  costFood: "",
  costInfluencer: "",
  costOther: "",
  costOtherLabel: "",
  budgetTotal: "",
  kpiTarget: "",
  kpiUnit: "order",
  campaignPerformance: "",
  conclusion: "",
}

const defaultMatForm = {
  type: "tentcard",
  name: "",
  quantity: "1",
  unitCost: "",
  actualCost: "",
  branches: [] as string[],
  isHqWide: false,
  displayStartDate: "",
  displayEndDate: "",
  placementSpots: [] as string[],
  status: "planning",
  note: "",
}

const defaultGiftDraft = {
  storeName: "",
  giftName: "",
  allocatedQty: "",
  distributedQty: "",
  ruleNote: "",
}

// ─── 페이지 ──────────────────────────────────────────────────────────────────
export default function MarketingCampaignsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const { stores, loading: storesLoading, formatStoreLabel, resolveStoreKey } = useStoreList()
  const normalizeBranchCodes = React.useCallback(
    (codes: string[]) => {
      const seen = new Set<string>()
      const out: string[] = []
      for (const c of codes) {
        const n = resolveStoreKey(String(c || "").trim())
        if (!n || seen.has(n)) continue
        seen.add(n)
        out.push(n)
      }
      return out
    },
    [resolveStoreKey]
  )
  const formatBranchList = React.useCallback(
    (codes: string[]) => normalizeBranchCodes(codes).map((c) => formatStoreLabel(c)).join(", "),
    [formatStoreLabel, normalizeBranchCodes]
  )
  const [materialTypeOptions, setMaterialTypeOptions] = React.useState<MarketingMaterialTypeOption[]>(
    defaultMarketingMaterialTypeOptions
  )
  const [placementOptions, setPlacementOptions] = React.useState<MarketingMaterialPlacementOption[]>(
    defaultMarketingMaterialPlacementOptions
  )
  const tr = React.useCallback((ko: string, en: string, th: string) => {
    if (lang === "en") return en
    if (lang === "th") return th
    if (lang === "ko") return ko
    return en
  }, [lang])
  const costLabel = React.useCallback((labelKey: string) => {
    switch (labelKey) {
      case "costAdsOnline":
        return tr("광고 온라인 (฿)", "Online Ads (฿)", "โฆษณาออนไลน์ (฿)")
      case "costAdsOffline":
        return tr("오프라인 홍보물/광고 (฿)", "Offline Promo/Ads (฿)", "สื่อออฟไลน์/โฆษณา (฿)")
      case "costProduction":
        return tr("제작비 (฿)", "Production Cost (฿)", "ค่าผลิต (฿)")
      case "costFood":
        return tr("재료비/식품비 (฿)", "Ingredient/Food Cost (฿)", "ค่าวัตถุดิบ/อาหาร (฿)")
      case "costInfluencer":
        return tr("협업 마케팅/인플루언서 (฿)", "Collab Marketing/Influencer (฿)", "การตลาดร่วมมือ/อินฟลูเอนเซอร์ (฿)")
      case "costOther":
        return tr("기타 비용 (฿)", "Other Cost (฿)", "ค่าใช้จ่ายอื่นๆ (฿)")
      default:
        return labelKey
    }
  }, [tr])
  const statusLabel = React.useCallback((value: string) => {
    switch (value) {
      case "draft":
        return tr("준비", "Draft", "เตรียมการ")
      case "ongoing":
        return tr("진행중", "Ongoing", "กำลังดำเนินการ")
      case "finish":
        return tr("완료", "Done", "เสร็จสิ้น")
      default:
        return value
    }
  }, [tr])
  const kpiUnitLabel = React.useCallback((value: string) => {
    switch (value) {
      case "order":
        return tr("주문", "Orders", "ออเดอร์")
      case "sales":
        return tr("매출", "Sales", "ยอดขาย")
      case "customer":
        return tr("고객수", "Customers", "จำนวนลูกค้า")
      case "new_customer":
        return tr("신규고객", "New Customers", "ลูกค้าใหม่")
      case "repeat_customer":
        return tr("재방문고객", "Returning Customers", "ลูกค้ากลับมาซื้อ")
      case "coupon":
        return tr("쿠폰사용", "Coupon Uses", "การใช้คูปอง")
      case "member":
        return tr("회원가입", "Sign-ups", "การสมัครสมาชิก")
      case "impression":
        return tr("노출수", "Impressions", "จำนวนการมองเห็น")
      case "reach":
        return tr("도달수", "Reach", "จำนวนการเข้าถึง")
      case "click":
        return tr("클릭수", "Clicks", "จำนวนคลิก")
      case "ctr":
        return tr("클릭률(CTR)", "CTR", "อัตราคลิก (CTR)")
      case "conversion":
        return tr("전환수", "Conversions", "จำนวนคอนเวอร์ชัน")
      case "cvr":
        return tr("전환율(CVR)", "CVR", "อัตราคอนเวอร์ชัน (CVR)")
      case "roas":
        return "ROAS"
      case "aov":
        return tr("객단가(AOV)", "AOV", "มูลค่าต่อออเดอร์ (AOV)")
      case "followers":
        return tr("팔로워증가", "Follower Growth", "ยอดผู้ติดตามเพิ่ม")
      case "engagement":
        return tr("참여수", "Engagements", "จำนวนการมีส่วนร่วม")
      default:
        return value
    }
  }, [tr])
  const materialTypeLabel = React.useCallback(
    (value: string) => resolveMaterialTypeLabel(value, materialTypeOptions, tr),
    [materialTypeOptions, tr]
  )
  const materialStatusLabel = React.useCallback((value: string) => {
    switch (value) {
      case "planning": return tr("계획중", "Planning", "วางแผน")
      case "producing": return tr("제작중", "Producing", "กำลังผลิต")
      case "completed": return tr("완료", "Completed", "เสร็จแล้ว")
      case "distributed": return tr("배포완료", "Distributed", "แจกจ่ายแล้ว")
      default: return value
    }
  }, [tr])
  const materialPlacementSpotLabel = React.useCallback(
    (value: string) => resolvePlacementLabel(value, placementOptions, tr),
    [placementOptions, tr]
  )

  // 캠페인 목록
  const [list, setList] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)
  /** getMarketingCampaigns는 HTTP 오류 시에도 []를 반환해 원인이 안 보였음 → 목록 탭에서만 별도 표시 */
  const [listLoadError, setListLoadError] = React.useState<string | null>(null)

  // 캠페인 폼
  const [saving, setSaving] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState(defaultForm)
  const [costFlags, setCostFlags] = React.useState<Record<CostFieldKey, boolean>>({
    costAdsOnline: false,
    costAdsOffline: false,
    costProduction: false,
    costFood: false,
    costInfluencer: false,
    costOther: false,
  })
  const [customCampaignType, setCustomCampaignType] = React.useState("")
  const [channelState, setChannelState] = React.useState<ChannelState>({
    online: false,
    hall: false,
    takeout: false,
    apps: [],
  })
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  /** loadList 동시 호출 시 마지막 요청만 반영 (이전 응답이 목록을 비우는 것 방지) */
  const loadListGenerationRef = React.useRef(0)
  const [showSimulator, setShowSimulator] = React.useState(false)

  // 하위 활동 탭
  const [activeTab, setActiveTab] = React.useState<"influencers" | "materials" | "results">("influencers")

  // 허브: 등록·수정 / 목록 / A·B 비교
  const [hubTab, setHubTab] = React.useState<"form" | "list" | "compare">(() => {
    if (typeof window === "undefined") return "form"
    return new URLSearchParams(window.location.search).get("view") === "compare" ? "compare" : "form"
  })
  const [listSearch, setListSearch] = React.useState("")
  const [listSearchScope, setListSearchScope] = React.useState<CampaignListSearchScope>("all")
  const [listFiltersOpen, setListFiltersOpen] = React.useState(false)
  const [listPeriodFrom, setListPeriodFrom] = React.useState(() => getBangkokRolling30DayRangeYmd().from)
  const [listPeriodTo, setListPeriodTo] = React.useState(() => getBangkokRolling30DayRangeYmd().to)
  const [listDesignFrom, setListDesignFrom] = React.useState("")
  const [listDesignTo, setListDesignTo] = React.useState("")
  const [listCampaignTypeFilter, setListCampaignTypeFilter] = React.useState("")
  const [listStatusDraft, setListStatusDraft] = React.useState(true)
  const [listStatusOngoing, setListStatusOngoing] = React.useState(true)
  const [listStatusFinish, setListStatusFinish] = React.useState(true)
  const [listBranchFilter, setListBranchFilter] = React.useState("")
  const [listHubLinkFilter, setListHubLinkFilter] = React.useState("")
  const [hubLinkSets, setHubLinkSets] = React.useState({
    promo: new Set<string>(),
    ads: new Set<string>(),
    influencer: new Set<string>(),
    materials: new Set<string>(),
  })
  const [listBudgetMin, setListBudgetMin] = React.useState("")
  const [listBudgetMax, setListBudgetMax] = React.useState("")
  const [listKpiMin, setListKpiMin] = React.useState("")
  const [listKpiMax, setListKpiMax] = React.useState("")
  const [listKpiUnitFilter, setListKpiUnitFilter] = React.useState("")
  const [listDiscountFilter, setListDiscountFilter] = React.useState<"any" | "none" | "percent" | "amount">("any")
  /** 필터 조합으로 0건일 때 서버에서 받은 전체 목록을 그대로 보기 */
  const [listFilterBypass, setListFilterBypass] = React.useState(false)

  const [linkedInfluencers, setLinkedInfluencers] = React.useState<MarketingInfluencer[]>([])

  // 홍보물 인라인
  const [materials, setMaterials] = React.useState<MarketingMaterial[]>([])
  const [matForm, setMatForm] = React.useState({ ...defaultMatForm })
  const [savingMat, setSavingMat] = React.useState(false)
  const [materialGifts, setMaterialGifts] = React.useState<MarketingMaterialGift[]>([])
  const [expandedGiftMatId, setExpandedGiftMatId] = React.useState<string | null>(null)
  const [giftAddDraft, setGiftAddDraft] = React.useState({ ...defaultGiftDraft })
  const [editingGiftId, setEditingGiftId] = React.useState<string | null>(null)
  const [giftEditDraft, setGiftEditDraft] = React.useState({ ...defaultGiftDraft })
  const [savingGift, setSavingGift] = React.useState(false)

  // 성과/비용
  const [linkedCounts, setLinkedCounts] = React.useState<{ ads: number; influencers: number; promos: number } | null>(null)
  const [costResults, setCostResults] = React.useState<{
    bankCosts: number; pettyCosts: number; totalCosts: number
    attributionMode?: string; attributionConfidence?: number
  } | null>(null)
  const [posResults, setPosResults] = React.useState<{
    dineInOrders: number; deliveryOrders: number; carryOutOrders: number; totalOrders: number
    dineInSales: number; deliverySales: number; carryOutSales: number; totalSales: number
    attributionMode?: string; attributionConfidence?: number
    linkedOrders?: number; fallbackOrders?: number
  } | null>(null)
  const [loadingResults, setLoadingResults] = React.useState(false)

  // ─── 데이터 로드 ────────────────────────────────────────────────────────────
  const loadList = React.useCallback((): Promise<void> => {
    const gen = ++loadListGenerationRef.current
    setLoading(true)
    setListLoadError(null)
    return Promise.allSettled([
      apiFetchWithOffline("/api/marketingCampaigns", { cache: "no-store" }),
      getPosPromos(),
      getMarketingAds(),
      getMarketingInfluencers(),
      getMarketingMaterials(),
    ])
      .then(async (results) => {
        if (gen !== loadListGenerationRef.current) return

        const campResult = results[0]
        let campaignsUpdate: MarketingCampaign[] | null = null

        if (campResult.status === "rejected") {
          setListLoadError(
            String(campResult.reason instanceof Error ? campResult.reason.message : campResult.reason)
          )
        } else {
          const campRes = campResult.value
          if (!campRes.ok) {
            setListLoadError(
              tr(
                `캠페인 목록을 불러오지 못했습니다 (HTTP ${campRes.status}). Vercel 환경 변수(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 등)와 Supabase RLS를 확인하세요.`,
                `Could not load campaigns (HTTP ${campRes.status}). Check Vercel env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and Supabase RLS.`,
                `โหลดแคมเปญไม่สำเร็จ (HTTP ${campRes.status}) ตรวจสอบ env บน Vercel และ RLS ของ Supabase`
              )
            )
          } else {
            try {
              const data = (await campRes.json()) as unknown
              campaignsUpdate = Array.isArray(data) ? (data as MarketingCampaign[]) : []
            } catch {
              setListLoadError(
                tr(
                  "캠페인 목록 응답 형식이 올바르지 않습니다.",
                  "Campaign list response was not valid JSON.",
                  "รูปแบบการตอบกลับรายการแคมเปญไม่ถูกต้อง"
                )
              )
            }
          }
        }

        if (gen !== loadListGenerationRef.current) return
        if (campaignsUpdate !== null) setList(campaignsUpdate)

        const promos = results[1].status === "fulfilled" ? results[1].value : []
        const ads = results[2].status === "fulfilled" ? results[2].value : []
        const influencers = results[3].status === "fulfilled" ? results[3].value : []
        const materials = results[4].status === "fulfilled" ? results[4].value : []
        setHubLinkSets(
          buildMarketingCampaignHubLinkSetsFromRows(
            promos || [],
            ads || [],
            influencers || [],
            materials || []
          )
        )
      })
      .finally(() => {
        if (gen === loadListGenerationRef.current) setLoading(false)
      })
  }, [tr])

  React.useEffect(() => {
    loadList()
  }, [loadList])

  React.useEffect(() => {
    setMaterialTypeOptions(loadMarketingMaterialTypeOptions())
  }, [])

  React.useEffect(() => {
    setPlacementOptions(loadMarketingMaterialPlacementOptions())
  }, [])

  React.useEffect(() => {
    setMatForm((f) => {
      if (materialTypeOptions.some((o) => o.value === f.type)) return f
      return { ...f, type: materialTypeOptions[0]?.value ?? "tentcard" }
    })
  }, [materialTypeOptions])

  React.useEffect(() => {
    const vals = new Set(placementOptions.map((o) => o.value))
    setMatForm((f) => ({
      ...f,
      placementSpots: f.placementSpots.filter((s) => vals.has(s)),
    }))
  }, [placementOptions])

  const openCampaignId = searchParams.get("openCampaign")?.trim()
  const openTab = searchParams.get("tab") as "influencers" | "materials" | "results" | null

  const navigateHubTab = React.useCallback(
    (tab: "form" | "list" | "compare") => {
      setHubTab(tab)
      const p = new URLSearchParams(searchParams.toString())
      if (tab === "compare") {
        p.set("view", "compare")
        p.delete("openCampaign")
        p.delete("tab")
      } else {
        p.delete("view")
      }
      const qs = p.toString()
      router.replace(qs ? `/admin/marketing/campaigns?${qs}` : "/admin/marketing/campaigns")
    },
    [router, searchParams]
  )

  React.useEffect(() => {
    if (searchParams.get("openCampaign")?.trim()) return
    if (searchParams.get("view") === "compare") setHubTab("compare")
  }, [searchParams])

  React.useEffect(() => {
    if (openCampaignId && list.length > 0) {
      const c = list.find((x) => x.id === openCampaignId)
      if (c) {
        setHubTab("form")
        setEditingId(c.id)
        setActiveTab(openTab === "materials" || openTab === "results" ? openTab : "influencers")
      }
    }
  }, [openCampaignId, openTab, list])

  React.useEffect(() => {
    const nextFormat = serializeCampaignFormat(channelState)
    setForm((prev) => (prev.format === nextFormat ? prev : { ...prev, format: nextFormat }))
  }, [channelState])

  const loadLinkedCounts = React.useCallback((id: string) => {
    Promise.allSettled([
      getMarketingAds({ campaignId: id }),
      getMarketingInfluencers({ campaignId: id }),
      getPosPromos({ campaignId: id }),
    ]).then(([adsRes, infRes, promoRes]) => {
      setLinkedCounts({
        ads: adsRes.status === "fulfilled" ? adsRes.value.length : 0,
        influencers: infRes.status === "fulfilled" ? infRes.value.length : 0,
        promos: promoRes.status === "fulfilled" ? promoRes.value.length : 0,
      })
    })
  }, [])

  const loadSubActivities = React.useCallback((id: string) => {
    getMarketingInfluencers({ campaignId: id })
      .then(setLinkedInfluencers)
      .catch(() => setLinkedInfluencers([]))
    getMarketingMaterials({ campaignId: id })
      .then(setMaterials)
      .catch(() => setMaterials([]))
    getMarketingMaterialGifts({ campaignId: id })
      .then(setMaterialGifts)
      .catch(() => setMaterialGifts([]))
  }, [])

  // 신규 등록 시 고유번호 즉시 표시
  React.useEffect(() => {
    if (editingId) return
    getNextCampaignNumber()
      .then((no) => { if (no) setForm((f) => ({ ...f, campaignNo: no })) })
      .catch(() => {})
  }, [editingId])

  React.useEffect(() => {
    if (!editingId) {
      setLinkedCounts(null)
      setLinkedInfluencers([])
      setMaterials([])
      setMaterialGifts([])
      setExpandedGiftMatId(null)
      setEditingGiftId(null)
      setGiftAddDraft({ ...defaultGiftDraft })
      setCostResults(null)
      setPosResults(null)
      return
    }
    getMarketingCampaign(editingId).then((c) => {
      if (c) {
        const parsedFormat = parseCampaignFormat(c.format ?? "")
        const parsedCampaignType = toCampaignTypeFormState(c.campaignType)
        setForm({
          campaignNo: c.campaignNo ?? "",
          topic: c.topic ?? "",
          format: c.format ?? "",
          campaignType: parsedCampaignType.type,
          status: c.status ?? "draft",
          detail: c.detail ?? "",
          startDate: c.startDate ?? "",
          endDate: c.endDate ?? "",
          designStartDate: c.designStartDate ?? "",
          designEndDate: c.designEndDate ?? "",
          designNote: c.designNote ?? "",
          phasePeriods: Array.isArray(c.phasePeriods)
            ? c.phasePeriods.map((p) => ({
                label: (p.label ?? "").trim(),
                startDate: p.startDate ?? "",
                endDate: p.endDate ?? "",
              }))
            : [],
          branches: normalizeBranchCodes(Array.isArray(c.branches) ? c.branches : []),
          discountType: ["amount", "fixed"].includes(c.discountType ?? "") ? "amount" : "percent",
          discountValue: String(c.discountValue ?? ""),
          discountPricePromotion: c.discountPricePromotion ?? "",
          discountTargetAudience: c.discountTargetAudience ?? "",
          collabManagement: c.collabManagement === true,
          costAdsOnline: String(c.costAdsOnline ?? ""),
          costAdsOffline: String(c.costAdsOffline ?? ""),
          costProduction: String(c.costProduction ?? ""),
          costFood: String(c.costFood ?? ""),
          costInfluencer: String(c.costInfluencer ?? ""),
          costOther: String(c.costOther ?? ""),
          costOtherLabel: c.costOtherLabel ?? "",
          budgetTotal: String(c.budgetTotal ?? ""),
          kpiTarget: String(c.kpiTarget ?? ""),
          kpiUnit: c.kpiUnit ?? "order",
          campaignPerformance: c.campaignPerformance ?? "",
          conclusion: c.conclusion ?? "",
        })
        setCostFlags(buildCostFlags({
          costAdsOnline: c.costAdsOnline ?? 0,
          costAdsOffline: c.costAdsOffline ?? 0,
          costProduction: c.costProduction ?? 0,
          costFood: c.costFood ?? 0,
          costInfluencer: c.costInfluencer ?? 0,
          costOther: c.costOther ?? 0,
          costOtherLabel: c.costOtherLabel ?? "",
        }))
        setCustomCampaignType(parsedCampaignType.custom)
        setChannelState(parsedFormat)
      }
    })
    loadLinkedCounts(editingId)
    loadSubActivities(editingId)
  }, [editingId, loadLinkedCounts, loadSubActivities])

  // ─── 캠페인 핸들러 ─────────────────────────────────────────────────────────
  const handleNew = () => {
    setHubTab("form")
    const p = new URLSearchParams(searchParams.toString())
    p.delete("view")
    const qs = p.toString()
    router.replace(qs ? `/admin/marketing/campaigns?${qs}` : "/admin/marketing/campaigns")
    setEditingId(null)
    setForm(defaultForm)
    setCostFlags({
      costAdsOnline: false,
      costAdsOffline: false,
      costProduction: false,
      costFood: false,
      costInfluencer: false,
      costOther: false,
    })
    setCustomCampaignType("")
    setChannelState({ online: false, hall: false, takeout: false, apps: [] })
    setMatForm({ ...defaultMatForm })
    setMaterialGifts([])
    setExpandedGiftMatId(null)
    setEditingGiftId(null)
    setGiftAddDraft({ ...defaultGiftDraft })
  }

  const handleEdit = (
    c: MarketingCampaign,
    tab: "influencers" | "materials" | "results" = "influencers",
  ) => {
    setHubTab("form")
    const p = new URLSearchParams(searchParams.toString())
    p.delete("view")
    const qs = p.toString()
    router.replace(qs ? `/admin/marketing/campaigns?${qs}` : "/admin/marketing/campaigns")
    setEditingId(c.id)
    setActiveTab(tab)
  }

  const listFiltersActive = React.useMemo(
    () =>
      marketingCampaignListFiltersActive({
        listSearchScope,
        listPeriodFrom,
        listPeriodTo,
        listDesignFrom,
        listDesignTo,
        listCampaignTypeFilter,
        listStatusDraft,
        listStatusOngoing,
        listStatusFinish,
        listBranchFilter,
        listHubLinkFilter,
        listBudgetMin,
        listBudgetMax,
        listKpiMin,
        listKpiMax,
        listKpiUnitFilter,
        listDiscountFilter,
      }),
    [
      listSearchScope,
      listPeriodFrom,
      listPeriodTo,
      listDesignFrom,
      listDesignTo,
      listCampaignTypeFilter,
      listStatusDraft,
      listStatusOngoing,
      listStatusFinish,
      listBranchFilter,
      listHubLinkFilter,
      listBudgetMin,
      listBudgetMax,
      listKpiMin,
      listKpiMax,
      listKpiUnitFilter,
      listDiscountFilter,
    ]
  )

  const resetListFilters = React.useCallback(() => {
    setListPeriodFrom("")
    setListPeriodTo("")
    setListDesignFrom("")
    setListDesignTo("")
    setListCampaignTypeFilter("")
    setListStatusDraft(true)
    setListStatusOngoing(true)
    setListStatusFinish(true)
    setListBranchFilter("")
    setListHubLinkFilter("")
    setListBudgetMin("")
    setListBudgetMax("")
    setListKpiMin("")
    setListKpiMax("")
    setListKpiUnitFilter("")
    setListDiscountFilter("any")
    setListSearchScope("all")
    setListSearch("")
    setListFilterBypass(false)
  }, [])

  React.useEffect(() => {
    setListFilterBypass(false)
  }, [
    listSearch,
    listSearchScope,
    listPeriodFrom,
    listPeriodTo,
    listDesignFrom,
    listDesignTo,
    listCampaignTypeFilter,
    listStatusDraft,
    listStatusOngoing,
    listStatusFinish,
    listBranchFilter,
    listHubLinkFilter,
    listBudgetMin,
    listBudgetMax,
    listKpiMin,
    listKpiMax,
    listKpiUnitFilter,
    listDiscountFilter,
  ])

  const filteredList = React.useMemo(
    () =>
      applyMarketingCampaignListFilters(list, hubLinkSets, {
        listSearch,
        listSearchScope,
        listPeriodFrom,
        listPeriodTo,
        listDesignFrom,
        listDesignTo,
        listCampaignTypeFilter,
        listStatusDraft,
        listStatusOngoing,
        listStatusFinish,
        listBranchFilter,
        listHubLinkFilter,
        listBudgetMin,
        listBudgetMax,
        listKpiMin,
        listKpiMax,
        listKpiUnitFilter,
        listDiscountFilter,
        lang,
        statusLabel,
      }),
    [
      list,
      listSearch,
      listSearchScope,
      listPeriodFrom,
      listPeriodTo,
      listDesignFrom,
      listDesignTo,
      listCampaignTypeFilter,
      listStatusDraft,
      listStatusOngoing,
      listStatusFinish,
      listBranchFilter,
      listHubLinkFilter,
      hubLinkSets,
      listBudgetMin,
      listBudgetMax,
      listKpiMin,
      listKpiMax,
      listKpiUnitFilter,
      listDiscountFilter,
      lang,
      statusLabel,
    ]
  )

  const campaignListForDisplay = listFilterBypass ? list : filteredList

  const handleCopyCampaign = (c: MarketingCampaign) => {
    getMarketingCampaign(c.id).then((detail) => {
      if (!detail) return
      const parsedFormat = parseCampaignFormat(detail.format ?? "")
      const parsedCampaignType = toCampaignTypeFormState(detail.campaignType)
      setEditingId(null)
      setForm({
        campaignNo: "",
        topic: (detail.topic ?? "") + ` (${tr("복사", "Copy", "คัดลอก")})`,
        format: detail.format ?? "",
        campaignType: parsedCampaignType.type,
        status: "draft",
        detail: detail.detail ?? "",
        startDate: "",
        endDate: "",
        designStartDate: "",
        designEndDate: "",
        designNote: "",
        phasePeriods: [],
        branches: normalizeBranchCodes(Array.isArray(detail.branches) ? detail.branches : []),
        discountType: ["amount", "fixed"].includes(detail.discountType ?? "") ? "amount" : "percent",
        discountValue: String(detail.discountValue ?? ""),
        discountPricePromotion: detail.discountPricePromotion ?? "",
        discountTargetAudience: detail.discountTargetAudience ?? "",
        collabManagement: detail.collabManagement === true,
        costAdsOnline: String(detail.costAdsOnline ?? ""),
        costAdsOffline: String(detail.costAdsOffline ?? ""),
        costProduction: String(detail.costProduction ?? ""),
        costFood: String(detail.costFood ?? ""),
        costInfluencer: String(detail.costInfluencer ?? ""),
        costOther: String(detail.costOther ?? ""),
        costOtherLabel: detail.costOtherLabel ?? "",
        budgetTotal: String(detail.budgetTotal ?? ""),
        kpiTarget: String(detail.kpiTarget ?? ""),
        kpiUnit: detail.kpiUnit ?? "order",
        campaignPerformance: "",
        conclusion: "",
      })
      setCostFlags(buildCostFlags({
        costAdsOnline: detail.costAdsOnline ?? 0,
        costAdsOffline: detail.costAdsOffline ?? 0,
        costProduction: detail.costProduction ?? 0,
        costFood: detail.costFood ?? 0,
        costInfluencer: detail.costInfluencer ?? 0,
        costOther: detail.costOther ?? 0,
        costOtherLabel: detail.costOtherLabel ?? "",
      }))
      setCustomCampaignType(parsedCampaignType.custom)
      setChannelState(parsedFormat)
    })
  }

  const toggleBranch = (store: string) => {
    setForm((f) => ({
      ...f,
      branches: f.branches.includes(store)
        ? f.branches.filter((b) => b !== store)
        : [...f.branches, store],
    }))
  }

  const toggleChannelType = (key: "online" | "hall" | "takeout") => {
    setChannelState((prev) => {
      if (key === "online") {
        const nextOnline = !prev.online
        return { ...prev, online: nextOnline, apps: nextOnline ? prev.apps : [] }
      }
      return { ...prev, [key]: !prev[key] }
    })
  }

  const toggleDeliveryApp = (app: string) => {
    setChannelState((prev) => {
      if (!prev.online) return prev
      const exists = prev.apps.includes(app)
      return {
        ...prev,
        apps: exists ? prev.apps.filter((x) => x !== app) : [...prev.apps, app],
      }
    })
  }

  const addCampaignPhaseRow = () => {
    setForm((f) => {
      const n = f.phasePeriods.length + 1
      return {
        ...f,
        phasePeriods: [
          ...f.phasePeriods,
          {
            label: tr(`${n}차`, `Round ${n}`, `รอบ ${n}`),
            startDate: "",
            endDate: "",
          },
        ],
      }
    })
  }

  const removeCampaignPhaseRow = (idx: number) => {
    setForm((f) => ({
      ...f,
      phasePeriods: f.phasePeriods.filter((_, i) => i !== idx),
    }))
  }

  const updateCampaignPhaseRow = (idx: number, patch: Partial<CampaignPhaseFormRow>) => {
    setForm((f) => ({
      ...f,
      phasePeriods: f.phasePeriods.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    }))
  }

  const handleSave = async () => {
    const topic = form.topic.trim()
    if (!topic) {
      await appAlert(tr("캠페인 제목을 입력하세요.", "Please enter campaign title.", "กรุณากรอกชื่อแคมเปญ"))
      return
    }
    const campaignTypeValue = toCampaignTypeStorageValue(form.campaignType, customCampaignType)
    if (form.campaignType === "other" && campaignTypeValue === "other") {
      await appAlert(tr("기타 유형명을 입력하세요.", "Please enter custom type.", "กรุณาระบุประเภทอื่นๆ"))
      return
    }
    const normalizedCosts = {
      costAdsOnline: costFlags.costAdsOnline ? Number(form.costAdsOnline) || 0 : 0,
      costAdsOffline: costFlags.costAdsOffline ? Number(form.costAdsOffline) || 0 : 0,
      costProduction: costFlags.costProduction ? Number(form.costProduction) || 0 : 0,
      costFood: costFlags.costFood ? Number(form.costFood) || 0 : 0,
      costInfluencer: costFlags.costInfluencer ? Number(form.costInfluencer) || 0 : 0,
      costOther: costFlags.costOther ? Number(form.costOther) || 0 : 0,
    }
    const normalizedCostOtherLabel = costFlags.costOther ? String(form.costOtherLabel ?? "").trim() : ""
    if (costFlags.costOther && normalizedCosts.costOther > 0 && !normalizedCostOtherLabel) {
      await appAlert(tr("기타 항목명을 입력하세요.", "Please enter other cost item name.", "กรุณาระบุชื่อค่าใช้จ่ายอื่นๆ"))
      return
    }

    setSaving(true)
    try {
      const res = await saveMarketingCampaign({
        id: editingId ?? undefined,
        campaignNo: form.campaignNo || undefined,
        topic,
        format: form.format.trim(),
        campaignType: campaignTypeValue,
        status: form.status,
        detail: form.detail.trim(),
        startDate: form.startDate.trim() || null,
        endDate: form.endDate.trim() || null,
        designStartDate: form.designStartDate.trim() || null,
        designEndDate: form.designEndDate.trim() || null,
        designNote: form.designNote.trim(),
        phasePeriods: form.phasePeriods
          .map((p) => ({
            label: p.label.trim(),
            startDate: p.startDate.trim() || null,
            endDate: p.endDate.trim() || null,
          }))
          .filter((p) => p.label || p.startDate || p.endDate),
        branches: form.branches,
        discountType: form.discountType,
        discountValue: Number(form.discountValue) || 0,
        discountPricePromotion: form.discountPricePromotion.trim(),
        discountTargetAudience: form.discountTargetAudience.trim(),
        collabManagement: form.collabManagement,
        costAdsOnline: normalizedCosts.costAdsOnline,
        costAdsOffline: normalizedCosts.costAdsOffline,
        costProduction: normalizedCosts.costProduction,
        costFood: normalizedCosts.costFood,
        costInfluencer: normalizedCosts.costInfluencer,
        costOther: normalizedCosts.costOther,
        costOtherLabel: normalizedCostOtherLabel,
        budgetTotal: Number(form.budgetTotal) || 0,
        kpiTarget: Number(form.kpiTarget) || 0,
        kpiUnit: form.kpiUnit,
        campaignPerformance: form.campaignPerformance.trim(),
        conclusion: form.conclusion.trim(),
        userRole: auth?.role,
        userStore: auth?.store,
      })
      if (res.success) {
        const savedId = String((editingId || res.id || "").trim())
        if (savedId) {
          const phasePeriodsNorm = form.phasePeriods
            .map((p) => ({
              label: p.label.trim(),
              startDate: p.startDate.trim() || null,
              endDate: p.endDate.trim() || null,
            }))
            .filter((p) => p.label || p.startDate || p.endDate)
          const merged: MarketingCampaign = {
            id: savedId,
            campaignNo: form.campaignNo.trim() || undefined,
            topic,
            format: form.format.trim(),
            campaignType: campaignTypeValue,
            status: form.status,
            startDate: form.startDate.trim() || null,
            endDate: form.endDate.trim() || null,
            designStartDate: form.designStartDate.trim() || null,
            designEndDate: form.designEndDate.trim() || null,
            designNote: form.designNote.trim(),
            phasePeriods: phasePeriodsNorm,
            branches: [...form.branches],
            kpiTarget: Number(form.kpiTarget) || 0,
            kpiUnit: form.kpiUnit,
            budgetTotal: Number(form.budgetTotal) || 0,
            discountType: form.discountType,
            discountValue: Number(form.discountValue) || 0,
            discountPricePromotion: form.discountPricePromotion.trim(),
            discountTargetAudience: form.discountTargetAudience.trim(),
            collabManagement: form.collabManagement,
          }
          setList((prev) => {
            const idx = prev.findIndex((c) => String(c.id) === savedId)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...prev[idx], ...merged }
              return next
            }
            return [merged, ...prev]
          })
        }
        if (!editingId && res.id) setEditingId(res.id)
        await appAlert(t("itemsAlertSaved") || tr("저장되었습니다.", "Saved.", "บันทึกแล้ว"))
        await loadList()
      } else {
        await appAlert(res.message)
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: MarketingCampaign) => {
    if (!await appConfirm(`"${c.topic}" ${tr("삭제하시겠습니까?", "Delete this campaign?", "ต้องการลบแคมเปญนี้หรือไม่?")}`)) return
    const res = await deleteMarketingCampaign({ id: c.id })
    if (res.success) {
      loadList()
      if (editingId === c.id) handleNew()
    } else {
      await appAlert(res.message)
    }
  }

  // ─── 엑셀 가져오기 ──────────────────────────────────────────────────────────
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const preview = await importMarketingExcel(file, { dryRun: true })
      const previewMsg = preview.preview
        ? `${tr("캠페인 후보", "Campaign candidates", "ตัวเลือกแคมเปญ")} ${preview.preview.campaignCandidates ?? 0}${tr("건", "", " รายการ")}, ${tr("광고 후보", "Ad candidates", "ตัวเลือกโฆษณา")} ${(preview.preview.adCandidates ?? 0) + (preview.preview.timelineCandidates ?? 0)}${tr("건", "", " รายการ")}, ${tr("인플루언서 후보", "Influencer candidates", "ตัวเลือกอินฟลูเอนเซอร์")} ${preview.preview.influencerCandidates ?? 0}${tr("건", "", " รายการ")}\n${tr("자동 매핑 예상", "Estimated auto-mapping", "คาดการณ์การแมปอัตโนมัติ")}: ${tr("광고", "Ads", "โฆษณา")} ${preview.preview.mappedAds ?? 0}${tr("건", "", " รายการ")}, ${tr("인플루언서", "Influencers", "อินฟลูเอนเซอร์")} ${preview.preview.mappedInfluencers ?? 0}${tr("건", "", " รายการ")}`
        : (preview.message || tr("미리보기 완료", "Preview complete", "พรีวิวเสร็จสิ้น"))
      const ok = await appConfirm(`${previewMsg}\n\n${tr("이대로 가져오시겠습니까?", "Import with this result?", "นำเข้าตามผลนี้หรือไม่?")}`)
      if (!ok) return

      const res = await importMarketingExcel(file)
      if (res.success) {
        const warn =
          (res.unmappedAds || 0) > 0 || (res.unmappedInfluencers || 0) > 0
            ? `\n${tr("미연결", "Unmapped", "ไม่ถูกแมป")}: ${tr("광고", "Ads", "โฆษณา")} ${res.unmappedAds ?? 0}${tr("건", "", " รายการ")}, ${tr("인플루언서", "Influencers", "อินฟลูเอนเซอร์")} ${res.unmappedInfluencers ?? 0}${tr("건", "", " รายการ")}`
            : ""
        await appAlert((res.message || tr("가져오기 완료", "Import complete", "นำเข้าสำเร็จ")) + warn)
        loadList()
      } else {
        await appAlert(res.message || tr("가져오기 실패", "Import failed", "นำเข้าไม่สำเร็จ"))
      }
    } catch (err) {
      await appAlert(tr("가져오기 실패", "Import failed", "นำเข้าไม่สำเร็จ") + ": " + String(err))
    } finally {
      setImporting(false)
      e.target.value = ""
    }
  }

  // ─── 홍보물 인라인 핸들러 ──────────────────────────────────────────────────
  const handleAddMaterial = async () => {
    if (!editingId || !matForm.name.trim()) {
      await appAlert(tr("이름을 입력하세요.", "Please enter name.", "กรุณากรอกชื่อ"))
      return
    }
    setSavingMat(true)
    try {
      const res = await saveMarketingMaterial({
        campaignId: editingId,
        type: matForm.type,
        name: matForm.name.trim(),
        quantity: Number(matForm.quantity) || 1,
        unitCost: Number(matForm.unitCost) || 0,
        actualCost: Number(matForm.actualCost) || 0,
        branches: matForm.branches,
        isHqWide: matForm.isHqWide,
        displayStartDate: matForm.displayStartDate || null,
        displayEndDate: matForm.displayEndDate || null,
        placementSpots: matForm.placementSpots,
        status: matForm.status,
        note: matForm.note.trim(),
        userRole: auth?.role,
        userName: auth?.user,
        userStore: auth?.store,
      })
      if (res.success) {
        setMatForm({ ...defaultMatForm })
        loadSubActivities(editingId)
        if (res.expenseSyncMessage) await appAlert(res.expenseSyncMessage)
      } else {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
      }
    } finally {
      setSavingMat(false)
    }
  }

  const handleDeleteMaterial = async (mat: MarketingMaterial) => {
    if (!await appConfirm(`"${mat.name}" ${tr("삭제하시겠습니까?", "Delete this item?", "ต้องการลบรายการนี้หรือไม่?")}`)) return
    const res = await deleteMarketingMaterial({ id: mat.id })
    if (res.success && editingId) loadSubActivities(editingId)
    else if (!res.success) await appAlert(res.message || tr("삭제 실패", "Delete failed", "ลบไม่สำเร็จ"))
  }

  const toggleMatBranch = (store: string) => {
    setMatForm((f) => ({
      ...f,
      branches: f.branches.includes(store)
        ? f.branches.filter((b) => b !== store)
        : [...f.branches, store],
    }))
  }

  const toggleMatPlacementSpot = (spot: string) => {
    setMatForm((f) => ({
      ...f,
      placementSpots: f.placementSpots.includes(spot)
        ? f.placementSpots.filter((x) => x !== spot)
        : [...f.placementSpots, spot],
    }))
  }

  const giftsForMaterial = React.useCallback(
    (materialId: string) => materialGifts.filter((g) => g.materialId === materialId),
    [materialGifts]
  )

  const reloadMaterialGifts = React.useCallback(() => {
    if (!editingId) return
    getMarketingMaterialGifts({ campaignId: editingId })
      .then(setMaterialGifts)
      .catch(() => setMaterialGifts([]))
  }, [editingId])

  const toggleGiftPanel = (materialId: string) => {
    setExpandedGiftMatId((cur) => (cur === materialId ? null : materialId))
    setEditingGiftId(null)
    setGiftAddDraft({ ...defaultGiftDraft })
  }

  const startEditGift = (g: MarketingMaterialGift) => {
    setEditingGiftId(g.id)
    setGiftEditDraft({
      storeName: g.storeName,
      giftName: g.giftName,
      allocatedQty: String(g.allocatedQty),
      distributedQty: String(g.distributedQty),
      ruleNote: g.ruleNote,
    })
  }

  const handleAddMaterialGift = async (materialId: string) => {
    if (!editingId) return
    const storeName = giftAddDraft.storeName.trim()
    const giftName = giftAddDraft.giftName.trim()
    if (!storeName || !giftName) {
      await appAlert(tr("매장과 사은품명을 입력하세요.", "Enter store and gift name.", "กรุณากรอกสาขาและชื่อของแถม"))
      return
    }
    const allocatedQty = Math.max(0, Math.floor(Number(giftAddDraft.allocatedQty) || 0))
    const distributedQty = Math.max(0, Math.floor(Number(giftAddDraft.distributedQty) || 0))
    setSavingGift(true)
    try {
      const res = await saveMarketingMaterialGift({
        materialId,
        campaignId: editingId,
        storeName,
        giftName,
        allocatedQty,
        distributedQty,
        ruleNote: giftAddDraft.ruleNote.trim(),
        userRole: auth?.role,
        userStore: auth?.store,
      })
      if (res.success) {
        setGiftAddDraft({ ...defaultGiftDraft })
        reloadMaterialGifts()
      } else {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
      }
    } finally {
      setSavingGift(false)
    }
  }

  const handleSaveGiftEdit = async () => {
    if (!editingId || !editingGiftId) return
    const base = materialGifts.find((x) => x.id === editingGiftId)
    if (!base) return
    const storeName = giftEditDraft.storeName.trim()
    const giftName = giftEditDraft.giftName.trim()
    if (!storeName || !giftName) {
      await appAlert(tr("매장과 사은품명을 입력하세요.", "Enter store and gift name.", "กรุณากรอกสาขาและชื่อของแถม"))
      return
    }
    const allocatedQty = Math.max(0, Math.floor(Number(giftEditDraft.allocatedQty) || 0))
    const distributedQty = Math.max(0, Math.floor(Number(giftEditDraft.distributedQty) || 0))
    setSavingGift(true)
    try {
      const res = await saveMarketingMaterialGift({
        id: editingGiftId,
        materialId: base.materialId,
        campaignId: editingId,
        storeName,
        giftName,
        allocatedQty,
        distributedQty,
        ruleNote: giftEditDraft.ruleNote.trim(),
        userRole: auth?.role,
        userStore: auth?.store,
      })
      if (res.success) {
        setEditingGiftId(null)
        reloadMaterialGifts()
      } else {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
      }
    } finally {
      setSavingGift(false)
    }
  }

  const handleDeleteMaterialGift = async (g: MarketingMaterialGift) => {
    if (!await appConfirm(`"${g.giftName}" ${tr("삭제하시겠습니까?", "Delete this item?", "ต้องการลบรายการนี้หรือไม่?")}`)) return
    const res = await deleteMarketingMaterialGift({ id: g.id })
    if (res.success) {
      if (editingGiftId === g.id) setEditingGiftId(null)
      reloadMaterialGifts()
    } else {
      await appAlert(res.message || tr("삭제 실패", "Delete failed", "ลบไม่สำเร็จ"))
    }
  }

  // ─── 성과/비용 ─────────────────────────────────────────────────────────────
  const handleLoadResults = async () => {
    if (!editingId) return
    setLoadingResults(true)
    try {
      const [costsRes, posRes] = await Promise.allSettled([
        getMarketingCampaignCosts(editingId),
        getMarketingCampaignResults({ campaignId: editingId }),
      ])
      if (costsRes.status === "fulfilled" && costsRes.value.success) {
        const r = costsRes.value
        setCostResults({
          bankCosts: r.bankCosts ?? 0,
          pettyCosts: r.pettyCosts ?? 0,
          totalCosts: r.totalCosts ?? 0,
          attributionMode: r.attributionMode,
          attributionConfidence: r.attributionConfidence,
        })
      }
      if (posRes.status === "fulfilled" && posRes.value.success) {
        const r = posRes.value
        setPosResults({
          dineInOrders: r.dineInOrders ?? 0,
          deliveryOrders: r.deliveryOrders ?? 0,
          carryOutOrders: r.carryOutOrders ?? 0,
          totalOrders: r.totalOrders ?? 0,
          dineInSales: r.dineInSales ?? 0,
          deliverySales: r.deliverySales ?? 0,
          carryOutSales: r.carryOutSales ?? 0,
          totalSales: r.totalSales ?? 0,
          attributionMode: r.attributionMode,
          attributionConfidence: r.attributionConfidence,
          linkedOrders: r.linkedOrders,
          fallbackOrders: r.fallbackOrders,
        })
      }
    } finally {
      setLoadingResults(false)
    }
  }

  // ─── 렌더 ──────────────────────────────────────────────────────────────────
  const totalBudgetUsed =
    (costFlags.costAdsOnline ? Number(form.costAdsOnline) || 0 : 0) +
    (costFlags.costAdsOffline ? Number(form.costAdsOffline) || 0 : 0) +
    (costFlags.costProduction ? Number(form.costProduction) || 0 : 0) +
    (costFlags.costFood ? Number(form.costFood) || 0 : 0) +
    (costFlags.costInfluencer ? Number(form.costInfluencer) || 0 : 0) +
    (costFlags.costOther ? Number(form.costOther) || 0 : 0)
  const selectedCostCount = COST_FIELD_OPTIONS.filter((item) => costFlags[item.key]).length
  const budgetTotalNum = Number(form.budgetTotal) || 0
  const budgetRemain = budgetTotalNum - totalBudgetUsed
  const selectedKpiUnit = kpiUnitLabel(form.kpiUnit)

  return (
    <MarketingPageShell maxWidthClass={hubTab === "compare" ? "max-w-7xl" : "max-w-4xl"}>
        <MarketingPageHero icon={Megaphone} title={tr("캠페인 허브", "Campaign Hub", "ศูนย์กลางแคมเปญ")} />

        {/* 툴바 */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={loadList} disabled={loading}>
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {tr("새로고침", "Refresh", "รีเฟรช")}
          </Button>
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={handleNew}>
            <Plus className="h-4 w-4" />
            {tr("새 캠페인", "New Campaign", "แคมเปญใหม่")}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} />
          <Button variant="outline" size="sm" className="h-10 gap-1.5"
            onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className={cn("h-4 w-4", importing && "animate-pulse")} />
            {importing ? tr("가져오는 중...", "Importing...", "กำลังนำเข้า...") : tr("엑셀 가져오기", "Import Excel", "นำเข้า Excel")}
          </Button>
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={() => setShowSimulator(true)}>
            <Calculator className="h-4 w-4" />
            {tr("세트 시뮬레이터", "Set Simulator", "จำลองชุดโปรโมชัน")}
          </Button>
        </div>
        {showSimulator && <PromoSetSimulator onClose={() => setShowSimulator(false)} />}

        {/* 등록·수정 / 목록 / A·B 비교 */}
        <div className="mb-4 flex rounded-lg border bg-muted/30 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => navigateHubTab("form")}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md py-2.5 transition-colors",
              hubTab === "form" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ClipboardPen className="h-4 w-4 shrink-0" />
            <span className="truncate">{tr("등록·수정", "Create / Edit", "สร้าง / แก้ไข")}</span>
          </button>
          <button
            type="button"
            onClick={() => navigateHubTab("list")}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md py-2.5 transition-colors",
              hubTab === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="h-4 w-4 shrink-0" />
            <span className="truncate">{tr("목록", "List", "รายการ")}</span>
          </button>
          <button
            type="button"
            onClick={() => navigateHubTab("compare")}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md py-2.5 transition-colors",
              hubTab === "compare" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <GitCompare className="h-4 w-4 shrink-0" />
            <span className="truncate">{tr("A/B 비교", "A/B Compare", "เปรียบเทียบ A/B")}</span>
          </button>
        </div>

        <div className="space-y-4">

          {hubTab === "form" && (
          <>
          {/* ── 캠페인 기본 정보 폼 ─────────────────────────────────────────── */}
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">
              {editingId ? tr("캠페인 수정", "Edit Campaign", "แก้ไขแคมเปญ") : tr("캠페인 신규 등록", "Create Campaign", "สร้างแคมเปญ")}
            </h3>

            {/* 허브 빠른 이동 (수정 모드) */}
            {editingId && (
              <div className="mb-4 rounded-lg border border-dashed bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{tr("허브 연결", "Hub Links", "ลิงก์ศูนย์กลาง")}</span>
                    <span className="ml-2">
                      {tr("광고", "Ads", "โฆษณา")} {linkedCounts?.ads ?? 0} · {tr("인플루언서", "Influencers", "อินฟลูเอนเซอร์")} {linkedCounts?.influencers ?? 0} · {tr("프로모션세트", "Promotion Sets", "ชุดโปรโมชัน")} {linkedCounts?.promos ?? 0}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="outline" className={`${ADMIN_BTN_XS_CN} text-xs`}
                      onClick={() => router.push(`/admin/marketing/ads?campaignId=${editingId}`)}>
                      <ExternalLink className="h-3 w-3" />{tr("광고", "Ads", "โฆษณา")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className={`${ADMIN_BTN_XS_CN} text-xs`}
                      onClick={() => router.push(`/admin/marketing/influencers?campaignId=${editingId}`)}>
                      <ExternalLink className="h-3 w-3" />{tr("인플루언서", "Influencers", "อินฟลูเอนเซอร์")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className={`${ADMIN_BTN_XS_CN} text-xs`}
                      onClick={() => router.push(`/admin/marketing/promos?campaignId=${editingId}`)}>
                      <ExternalLink className="h-3 w-3" />{tr("프로모션세트", "Promotion Sets", "ชุดโปรโมชัน")}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {/* 고유번호 */}
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{tr("캠페인 고유번호", "Campaign Number", "หมายเลขแคมเปญ")}</label>
                <Input
                  value={form.campaignNo}
                  readOnly
                  placeholder={tr("저장 시 자동 발급", "Auto-generated on save", "สร้างอัตโนมัติเมื่อบันทึก")}
                  className="mt-1 bg-muted/30"
                />
              </div>

              {/* 제목 */}
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{tr("캠페인 제목 *", "Campaign Title *", "ชื่อแคมเปญ *")}</label>
                <Input
                  value={form.topic}
                  onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                  placeholder={tr("Promotion : CM Set 2, 크리스마스 이벤트", "Promotion: CM Set 2, Christmas Event", "โปรโมชัน: CM Set 2, อีเวนต์คริสต์มาส")}
                  className="mt-1"
                />
              </div>

              {/* 채널 / 상태 */}
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{tr("채널 형식", "Channel Type", "รูปแบบช่องทาง")}</label>
                <div className="mt-1 rounded-md border border-input px-3 py-2.5">
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {[
                      { key: "online", label: tr("온라인", "Online", "ออนไลน์") },
                      { key: "hall", label: tr("홀", "Hall", "นั่งทานที่ร้าน") },
                      { key: "takeout", label: tr("포장", "Takeout", "สั่งกลับบ้าน") },
                    ].map((ch) => (
                      <label key={ch.key} className="flex cursor-pointer items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={channelState[ch.key as keyof Omit<ChannelState, "apps">]}
                          onCheckedChange={() => toggleChannelType(ch.key as "online" | "hall" | "takeout")}
                        />
                        <span>{ch.label}</span>
                      </label>
                    ))}
                  </div>

                  {channelState.online && (
                    <div className="mt-3 space-y-2 rounded-md border bg-muted/20 px-2.5 py-2">
                      <p className="text-[11px] font-medium text-muted-foreground">{tr("배달앱 선택 (온라인)", "Delivery Apps (Online)", "เลือกแอปเดลิเวอรี (ออนไลน์)")}</p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        {DEFAULT_DELIVERY_APPS.map((app) => (
                          <label key={app} className="flex cursor-pointer items-center gap-1.5 text-xs">
                            <Checkbox
                              checked={channelState.apps.includes(app)}
                              onCheckedChange={() => toggleDeliveryApp(app)}
                            />
                            <span className="truncate">{app}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{tr("유형", "Type", "ประเภท")}</label>
                <select value={form.campaignType}
                  onChange={(e) => setForm((f) => ({ ...f, campaignType: e.target.value }))}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  {CAMPAIGN_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {lang === "en" ? o.en : lang === "th" ? o.th : o.ko}
                    </option>
                  ))}
                </select>
                {form.campaignType === "other" && (
                  <Input
                    value={customCampaignType}
                    onChange={(e) => setCustomCampaignType(e.target.value)}
                    placeholder={tr("기타 유형 직접 입력", "Enter custom type", "ระบุประเภทอื่นๆ")}
                    className="mt-1 h-8 text-xs"
                  />
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{tr("상태", "Status", "สถานะ")}</label>
                <select value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{statusLabel(o.value)}</option>)}
                </select>
              </div>

              {/* 기간 */}
              <div>
                <label className="text-xs text-muted-foreground">{tr("기간 시작", "Start Date", "วันที่เริ่ม")}</label>
                <Input type="date" value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{tr("기간 종료", "End Date", "วันที่สิ้นสุด")}</label>
                <Input type="date" value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="mt-1" />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">{tr("디자인 시작", "Design start", "เริ่มงานดีไซน์")}</label>
                <Input type="date" value={form.designStartDate}
                  onChange={(e) => setForm((f) => ({ ...f, designStartDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{tr("디자인 종료", "Design end", "จบงานดีไซน์")}</label>
                <Input type="date" value={form.designEndDate}
                  onChange={(e) => setForm((f) => ({ ...f, designEndDate: e.target.value }))} className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{tr("디자인 메모/링크", "Design memo / links", "บันทึก/ลิงก์งานดีไซน์")}</label>
                <Input
                  value={form.designNote}
                  onChange={(e) => setForm((f) => ({ ...f, designNote: e.target.value }))}
                  placeholder={tr("예: Figma, Drive 링크", "e.g. Figma or Drive links", "เช่น ลิงก์ Figma หรือ Drive")}
                  className="mt-1"
                />
              </div>

              <div className="sm:col-span-2 rounded-lg border border-dashed bg-muted/20 px-3 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {tr("차수별 기간 (선택)", "Phases (optional)", "ระยะเวลาแต่ละรอบ (ไม่บังคับ)")}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {tr(
                        "한 캠페인을 1차·2차·3차처럼 나눌 때 각 구간의 시작·종료를 적습니다. 전체 기간(위)은 집계·요약용으로 유지할 수 있습니다.",
                        "Split one campaign into rounds (e.g. phase 1–3). Keep the main dates above for overall reporting if needed.",
                        "แบ่งแคมเปญเป็นหลายรอบ ระบุวันเริ่ม/จบของแต่ละรอบ ช่วงหลักด้านบนใช้สรุปภาพรวมได้"
                      )}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs shrink-0"
                    onClick={addCampaignPhaseRow}>
                    <Plus className="h-3.5 w-3.5" />
                    {tr("차수 추가", "Add phase", "เพิ่มรอบ")}
                  </Button>
                </div>
                {form.phasePeriods.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground py-1">
                    {tr("차수가 없습니다. 필요할 때만 추가하세요.", "No phases yet. Add when needed.", "ยังไม่มีรอบ — เพิ่มเมื่อต้องการ")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {form.phasePeriods.map((row, idx) => (
                      <div key={idx} className="flex flex-wrap items-end gap-2 rounded-md border bg-background/80 px-2 py-2">
                        <div className="min-w-[5.5rem] flex-1 sm:flex-initial sm:w-28">
                          <label className="text-[10px] text-muted-foreground">{tr("차수명", "Label", "ชื่อรอบ")}</label>
                          <Input
                            value={row.label}
                            onChange={(e) => updateCampaignPhaseRow(idx, { label: e.target.value })}
                            placeholder={tr("예: 1차", "e.g. Round 1", "เช่น รอบ 1")}
                            className="mt-0.5 h-8 text-xs"
                          />
                        </div>
                        <div className="w-[9.5rem]">
                          <label className="text-[10px] text-muted-foreground">{tr("시작", "Start", "เริ่ม")}</label>
                          <Input
                            type="date"
                            value={row.startDate}
                            onChange={(e) => updateCampaignPhaseRow(idx, { startDate: e.target.value })}
                            className="mt-0.5 h-8 text-xs"
                          />
                        </div>
                        <div className="w-[9.5rem]">
                          <label className="text-[10px] text-muted-foreground">{tr("종료", "End", "จบ")}</label>
                          <Input
                            type="date"
                            value={row.endDate}
                            onChange={(e) => updateCampaignPhaseRow(idx, { endDate: e.target.value })}
                            className="mt-0.5 h-8 text-xs"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                          title={tr("이 차수 삭제", "Remove this phase", "ลบรอบนี้")}
                          onClick={() => removeCampaignPhaseRow(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 참여 지점 — 체크박스 */}
              <div className="sm:col-span-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">{tr("참여 지점", "Participating Branches", "สาขาที่เข้าร่วม")}</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      title={tr("전체 선택", "Select All", "เลือกทั้งหมด")}
                      onClick={() => setForm((f) => ({ ...f, branches: [...stores] }))}
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      title={tr("전체 해제", "Clear All", "ล้างทั้งหมด")}
                      onClick={() => setForm((f) => ({ ...f, branches: [] }))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {storesLoading ? (
                  <p className="text-xs text-muted-foreground py-2">{tr("지점 목록 불러오는 중...", "Loading branches...", "กำลังโหลดรายชื่อสาขา...")}</p>
                ) : stores.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">{tr("등록된 지점이 없습니다.", "No branches found.", "ไม่พบสาขาที่ลงทะเบียน")}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-lg border bg-muted/20 px-3 py-2.5">
                    {stores.map((store) => (
                      <label key={store} className="flex cursor-pointer items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={form.branches.includes(store)}
                          onCheckedChange={() => toggleBranch(store)}
                        />
                        <span className="truncate">{formatStoreLabel(store)}</span>
                      </label>
                    ))}
                  </div>
                )}
                {form.branches.length > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {tr("선택됨", "Selected", "เลือกแล้ว")}: {formatBranchList(form.branches)}
                  </p>
                )}
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  {tr(
                    "참여 지점을 비워 두면 전체 매장 대상 협업·행사로 기록할 수 있습니다.",
                    "Leave branches empty to record an all-store collaboration plan.",
                    "เว้นสาขาว่างไว้เพื่อบันทึกแผนร่วมทุกสาขา"
                  )}
                </p>
              </div>

              {/* 캠페인 할인·요약 (협업 POS 규칙은 마케팅 &gt; 협업 관리에서 설정) */}
              <div className="sm:col-span-2 space-y-3 rounded-lg border border-border/70 bg-muted/10 px-3 py-3">
                <p className="text-xs font-medium text-foreground">
                  {tr("할인·행사 요약", "Discount & promo summary", "สรุปส่วนลดและโปร")}
                </p>
                <div>
                  <label className="text-xs font-medium text-foreground">
                    {tr("대상", "Audience", "กลุ่มเป้าหมาย")}
                  </label>
                  <Textarea
                    value={form.discountTargetAudience}
                    onChange={(e) => setForm((f) => ({ ...f, discountTargetAudience: e.target.value }))}
                    placeholder={tr(
                      "예: 전체 고객 / 앱 회원만 / 그랩·라인맨 주문 / 특정 제휴사 코드 입력 고객",
                      "e.g. All guests · App members only · Delivery app orders · Partner code holders",
                      "เช่น ลูกค้าทุกคน · สมาชิกแอป · ออเดอร์แอปเดลิเวอรี"
                    )}
                    className="mt-1 min-h-[72px] text-sm"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">
                    {tr("요약", "Summary", "สรุป")}
                  </label>
                  <Input
                    value={form.discountPricePromotion}
                    onChange={(e) => setForm((f) => ({ ...f, discountPricePromotion: e.target.value }))}
                    placeholder={tr(
                      "예: 후라이드 세트 20% / A브랜드 콜라보 한정 메뉴",
                      "e.g. Fried combo 20% off · Limited collab menu with Brand A",
                      "เช่น เซ็ตไก่ทอดลด 20% · เมนูร่วมแบรนด์ A"
                    )}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* KPI */}
              <div>
                <label className="text-xs text-muted-foreground">{tr("KPI 단위", "KPI Unit", "หน่วย KPI")}</label>
                <select value={form.kpiUnit}
                  onChange={(e) => setForm((f) => ({ ...f, kpiUnit: e.target.value }))}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  {KPI_UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{kpiUnitLabel(o.value)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{tr("KPI 목표", "KPI Target", "เป้าหมาย KPI")}</label>
                <Input type="number" min={0} value={form.kpiTarget}
                  onChange={(e) => setForm((f) => ({ ...f, kpiTarget: e.target.value }))} className="mt-1" />
              </div>

              {/* 총 예산 */}
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{tr("총 예산 (฿)", "Total Budget (฿)", "งบประมาณรวม (฿)")}</label>
                <Input type="number" min={0} value={form.budgetTotal}
                  onChange={(e) => setForm((f) => ({ ...f, budgetTotal: e.target.value }))} className="mt-1" />
                {totalBudgetUsed > 0 && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {tr("배분 합계", "Allocated Total", "รวมที่จัดสรร")}: ฿{totalBudgetUsed.toLocaleString()}
                    {Number(form.budgetTotal) > 0 && (
                      <span className={cn("ml-1", totalBudgetUsed > Number(form.budgetTotal) ? "text-destructive" : "text-green-600")}>
                        {totalBudgetUsed > Number(form.budgetTotal)
                          ? tr("초과", "Over Budget", "เกินงบ")
                          : tr("잔여", "Remaining", "คงเหลือ") + " ฿" + (Number(form.budgetTotal) - totalBudgetUsed).toLocaleString()}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* 비용 항목 선택 후 예산 입력 */}
              <div className="sm:col-span-2 rounded-lg border bg-muted/10 px-3 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    {tr("비용 항목 선택", "Select Cost Items", "เลือกหมวดค่าใช้จ่าย")}
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    {tr("선택", "Selected", "เลือกแล้ว")} {selectedCostCount}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-md border border-input px-3 py-2 sm:grid-cols-3">
                  {COST_FIELD_OPTIONS.map((item) => (
                    <label key={item.key} className="flex cursor-pointer items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={costFlags[item.key]}
                        onCheckedChange={() => {
                          const next = !costFlags[item.key]
                          setCostFlags((prev) => ({ ...prev, [item.key]: next }))
                          if (!next) {
                            setForm((f) => ({
                              ...f,
                              [item.key]: "",
                              ...(item.key === "costOther" ? { costOtherLabel: "" } : {}),
                            }))
                          }
                        }}
                      />
                      <span>{costLabel(item.labelKey).replace(" (฿)", "")}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{tr("배분 합계", "Allocated Total", "รวมที่จัดสรร")}</span>
                    <span className="font-semibold">฿{totalBudgetUsed.toLocaleString()}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-muted-foreground">{tr("잔여 예산", "Remaining Budget", "งบคงเหลือ")}</span>
                    <span className={cn("font-semibold", budgetRemain < 0 ? "text-destructive" : "text-green-600")}>
                      ฿{budgetRemain.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {COST_FIELD_OPTIONS.filter((item) => costFlags[item.key]).map((item) => {
                    if (item.key === "costOther") {
                      return (
                        <div key={`cost-input-${item.key}`} className="sm:col-span-2 grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="text-xs text-muted-foreground">{tr("기타 항목명", "Other Cost Item", "ชื่อรายการค่าใช้จ่ายอื่นๆ")}</label>
                            <Input
                              value={form.costOtherLabel}
                              onChange={(e) => setForm((f) => ({ ...f, costOtherLabel: e.target.value }))}
                              placeholder={tr("예: 설치비, 외주비", "e.g. setup fee, outsourcing", "เช่น ค่าติดตั้ง, ค่าจ้างภายนอก")}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">{costLabel(item.labelKey)}</label>
                            <Input
                              type="number"
                              min={0}
                              value={form.costOther}
                              onChange={(e) => setForm((f) => ({ ...f, costOther: e.target.value }))}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={`cost-input-${item.key}`}>
                        <label className="text-xs text-muted-foreground">{costLabel(item.labelKey)}</label>
                        <Input
                          type="number"
                          min={0}
                          value={form[item.key]}
                          onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                    )
                  })}
                </div>

                {selectedCostCount === 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tr(
                      "먼저 사용할 비용 항목을 체크한 뒤 예산을 입력하세요.",
                      "Select cost items first, then enter budgets.",
                      "เลือกหมวดค่าใช้จ่ายก่อน แล้วค่อยกรอกงบประมาณ"
                    )}
                  </p>
                )}
              </div>

              {/* 상세 설명 */}
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{tr("상세 설명", "Description", "รายละเอียด")}</label>
                <Textarea value={form.detail}
                  onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
                  placeholder={tr("캠페인 상세 내용", "Campaign details", "รายละเอียดแคมเปญ")} className="mt-1 min-h-[70px]" rows={3} />
              </div>

              {/* 성과/결론 */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">{tr("캠페인 성과", "Campaign Result", "ผลลัพธ์แคมเปญ")}</label>
                  <span className="text-[10px] text-muted-foreground">
                    {tr("단위", "Unit", "หน่วย")}: {selectedKpiUnit}
                  </span>
                </div>
                <Input value={form.campaignPerformance}
                  onChange={(e) => setForm((f) => ({ ...f, campaignPerformance: e.target.value }))}
                  placeholder={tr("성과 수치 입력", "Enter result value", "กรอกค่าผลลัพธ์")} className="mt-1" />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {tr("성과 단위는 KPI 단위를 그대로 사용합니다.", "Result unit follows KPI unit.", "หน่วยผลลัพธ์จะใช้หน่วย KPI เดียวกัน")}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{tr("결론/평가", "Conclusion/Review", "สรุป/ประเมินผล")}</label>
                <Input value={form.conclusion}
                  onChange={(e) => setForm((f) => ({ ...f, conclusion: e.target.value }))}
                  placeholder="ได้ผล / ไม่ได้ผล" className="mt-1" />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? tr("저장 중...", "Saving...", "กำลังบันทึก...") : tr("저장", "Save", "บันทึก")}
              </Button>
              <Button variant="outline" onClick={handleNew}>{tr("취소", "Cancel", "ยกเลิก")}</Button>
            </div>
          </div>

          {/* ── 하위 활동 탭 (수정 모드에서만 표시) ─────────────────────────── */}
          {editingId && (
            <div className="rounded-xl border bg-card overflow-hidden">
              {/* 탭 헤더 */}
              <div className="flex border-b">
                {([
                  { key: "influencers", icon: <Users className="h-3.5 w-3.5" />, label: `${tr("인플루언서", "Influencers", "อินฟลูเอนเซอร์")} (${linkedInfluencers.length})` },
                  { key: "materials", icon: <Package className="h-3.5 w-3.5" />, label: `${tr("홍보물", "Materials", "สื่อโปรโมชัน")} (${materials.length})` },
                  { key: "results", icon: <BarChart2 className="h-3.5 w-3.5" />, label: tr("성과/비용", "Result/Cost", "ผลลัพธ์/ต้นทุน") },
                ] as { key: "influencers" | "materials" | "results"; icon: React.ReactNode; label: string }[]).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors",
                      activeTab === tab.key
                        ? "border-b-2 border-primary text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </div>

              {/* ── 인플루언서 탭 (조회·건수만, 등록은 인플루언서 메뉴) ───────── */}
              {activeTab === "influencers" && (
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {tr(
                        "이 캠페인에 연결된 인플루언서입니다. 등록·수정·삭제는 인플루언서 메뉴에서 합니다.",
                        "Influencers linked to this campaign. Add, edit, or remove them on the Influencers page.",
                        "อินฟลูเนเซอร์ที่เชื่อมกับแคมเปญนี้ — เพิ่ม/แก้ไข/ลบได้ที่เมนูอินฟลูเนเซอร์"
                      )}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={`${ADMIN_BTN_XS_CN} shrink-0 text-xs gap-1`}
                      onClick={() => router.push(`/admin/marketing/influencers?campaignId=${editingId}`)}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {tr("인플루언서 관리", "Manage Influencers", "จัดการอินฟลูเนเซอร์")}
                    </Button>
                  </div>
                  {/* 목록 */}
                  {linkedInfluencers.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      {tr(
                        "연결된 인플루언서가 없습니다. 인플루언서 메뉴에서 추가하세요.",
                        "No linked influencers. Add them on the Influencers page.",
                        "ยังไม่มีอินฟลูเนเซอร์ที่เชื่อม — เพิ่มได้ที่เมนูอินฟลูเนเซอร์"
                      )}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {linkedInfluencers.map((inf) => (
                        <div key={inf.id} className="rounded-lg border px-3 py-2 text-sm">
                          <span className="font-medium">{inf.name}</span>
                          {inf.followers && <span className="ml-2 text-xs text-muted-foreground">{inf.followers}</span>}
                          {inf.contentTopic && <span className="ml-2 text-xs text-muted-foreground">· {inf.contentTopic}</span>}
                          <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {inf.budget > 0 && (
                              <span>{tr("예산", "Budget", "งบ")} ฿{inf.budget.toLocaleString()}</span>
                            )}
                            {(inf.actualCost ?? 0) > 0 && (
                              <span className="text-foreground">
                                {tr("실비", "Actual", "จริง")} ฿{(inf.actualCost ?? 0).toLocaleString()}
                              </span>
                            )}
                            {inf.publishDate && <span>{tr("게시", "Published", "เผยแพร่")}: {inf.publishDate}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── 홍보물 탭 ─────────────────────────────────────────────── */}
              {activeTab === "materials" && (
                <div className="p-4 space-y-4">
                  {/* 빠른 등록 */}
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="mb-2 text-xs font-semibold">{tr("홍보물 추가", "Add Material", "เพิ่มสื่อโปรโมชัน")}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-1">
                          <label className="text-[10px] text-muted-foreground">{tr("종류", "Type", "ประเภท")}</label>
                          <Link
                            href="/admin/marketing/materials"
                            className="text-[10px] text-primary underline-offset-2 hover:underline"
                          >
                            {tr("종류 편집…", "Edit types…", "แก้ไขประเภท…")}
                          </Link>
                        </div>
                        <select value={matForm.type} onChange={(e) => setMatForm((f) => ({ ...f, type: e.target.value }))}
                          className="mt-0.5 flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs">
                          {materialTypeSelectOptions(materialTypeOptions, matForm.type, tr).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("이름/설명 *", "Name/Description *", "ชื่อ/คำอธิบาย *")}</label>
                        <Input value={matForm.name} onChange={(e) => setMatForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder={tr("A3 텐트카드 신메뉴", "A3 Tent Card - New Menu", "เทนท์การ์ด A3 - เมนูใหม่")} className="mt-0.5 h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("수량", "Quantity", "จำนวน")}</label>
                        <Input type="number" min={1} value={matForm.quantity}
                          onChange={(e) => setMatForm((f) => ({ ...f, quantity: e.target.value }))}
                          className="mt-0.5 h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("단가 (฿)", "Unit Cost (฿)", "ราคาต่อหน่วย (฿)")}</label>
                        <Input type="number" min={0} value={matForm.unitCost}
                          onChange={(e) => setMatForm((f) => ({ ...f, unitCost: e.target.value }))}
                          className="mt-0.5 h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("본사 공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")}</label>
                        <div className="mt-0.5 flex h-8 items-center rounded-md border border-input px-2 text-xs">
                          <label className="flex cursor-pointer items-center gap-1.5">
                            <Checkbox
                              checked={matForm.isHqWide}
                              onCheckedChange={(checked) =>
                                setMatForm((f) => ({ ...f, isHqWide: Boolean(checked) }))
                              }
                            />
                            <span>{tr("본사 차원 통합 진행", "Managed at HQ level", "ดำเนินการในระดับสำนักงานใหญ่")}</span>
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("상태", "Status", "สถานะ")}</label>
                        <select value={matForm.status}
                          onChange={(e) => setMatForm((f) => ({ ...f, status: e.target.value }))}
                          className="mt-0.5 flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs">
                          {MATERIAL_STATUSES.map((o) => <option key={o.value} value={o.value}>{materialStatusLabel(o.value)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("게시 시작일", "Display Start Date", "วันที่เริ่มติดตั้ง")}</label>
                        <Input
                          type="date"
                          value={matForm.displayStartDate}
                          onChange={(e) => setMatForm((f) => ({ ...f, displayStartDate: e.target.value }))}
                          className="mt-0.5 h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("게시 종료일", "Display End Date", "วันที่สิ้นสุดการติดตั้ง")}</label>
                        <Input
                          type="date"
                          value={matForm.displayEndDate}
                          onChange={(e) => setMatForm((f) => ({ ...f, displayEndDate: e.target.value }))}
                          className="mt-0.5 h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("메모", "Note", "บันทึก")}</label>
                        <Input value={matForm.note} onChange={(e) => setMatForm((f) => ({ ...f, note: e.target.value }))}
                          placeholder={tr("인쇄소, 수령일 등", "Printer, pickup date, etc.", "โรงพิมพ์ วันที่รับของ ฯลฯ")} className="mt-0.5 h-8 text-xs" />
                      </div>

                      {/* 배포 지점 */}
                      <div className="sm:col-span-2">
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-[10px] text-muted-foreground">{tr("배포 지점", "Distribution Branches", "สาขาที่กระจายสื่อ")}</label>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0"
                              title={tr("전체 선택", "Select All", "เลือกทั้งหมด")}
                              onClick={() => setMatForm((f) => ({ ...f, branches: [...stores] }))}
                            >
                              <CheckCheck className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0"
                              title={tr("전체 해제", "Clear All", "ล้างทั้งหมด")}
                              onClick={() => setMatForm((f) => ({ ...f, branches: [] }))}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 rounded-lg border bg-background px-2 py-2">
                          {stores.map((store) => (
                            <label key={store} className="flex cursor-pointer items-center gap-1 text-xs">
                              <Checkbox checked={matForm.branches.includes(store)}
                                onCheckedChange={() => toggleMatBranch(store)} />
                              <span className="truncate">{formatStoreLabel(store)}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* 매장 내 위치 */}
                      <div className="sm:col-span-2">
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                          <label className="text-[10px] text-muted-foreground">{tr("매장 내 위치", "In-store Placement", "ตำแหน่งในร้าน")}</label>
                          <div className="flex items-center gap-2">
                            <Link
                              href="/admin/marketing/materials"
                              className="text-[10px] text-primary underline-offset-2 hover:underline"
                            >
                              {tr("위치 편집…", "Edit placements…", "แก้ไขตำแหน่ง…")}
                            </Link>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 w-6 p-0"
                                title={tr("전체 선택", "Select All", "เลือกทั้งหมด")}
                                onClick={() =>
                                  setMatForm((f) => ({
                                    ...f,
                                    placementSpots: placementOptions.map((x) => x.value),
                                  }))
                                }
                              >
                                <CheckCheck className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 w-6 p-0"
                                title={tr("전체 해제", "Clear All", "ล้างทั้งหมด")}
                                onClick={() => setMatForm((f) => ({ ...f, placementSpots: [] }))}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-lg border bg-background px-2 py-2">
                          {placementOptions.map((spot) => (
                            <label key={spot.value} className="flex cursor-pointer items-center gap-1 text-xs">
                              <Checkbox
                                checked={matForm.placementSpots.includes(spot.value)}
                                onCheckedChange={() => toggleMatPlacementSpot(spot.value)}
                              />
                              <span className="truncate">{materialPlacementSpotLabel(spot.value)}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* 합계 미리보기 */}
                      {Number(matForm.quantity) > 0 && Number(matForm.unitCost) > 0 && (
                        <div className="sm:col-span-2 text-xs text-muted-foreground">
                          {tr("예상 소계", "Est. subtotal", "ประมาณการ")}: {matForm.quantity}{tr("개", "", " ชิ้น")} × ฿{Number(matForm.unitCost).toLocaleString()} = <span className="font-semibold text-foreground">฿{(Number(matForm.quantity) * Number(matForm.unitCost)).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-muted-foreground">
                          {tr("실제 비용 (฿)", "Actual cost (฿)", "ค่าใช้จ่ายจริง (฿)")}
                        </label>
                        <Input type="number" min={0} value={matForm.actualCost}
                          onChange={(e) => setMatForm((f) => ({ ...f, actualCost: e.target.value }))}
                          className="mt-0.5 h-8 text-xs" />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {tr("본사 권한으로 저장 시 지출관리 「지급예정」에 반영됩니다.", "Office role: syncs to Expense → Planned payment.", "สิทธิ์สำนักงาน: เชื่อมไปยังค่าใช้จ่าย → กำหนดจ่าย")}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" className="mt-2 h-8 text-xs gap-1" onClick={handleAddMaterial} disabled={savingMat}>
                      {savingMat ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      {tr("추가", "Add", "เพิ่ม")}
                    </Button>
                  </div>

                  {/* 홍보물 목록 */}
                  {materials.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">{tr("등록된 홍보물이 없습니다.", "No materials.", "ไม่มีสื่อโปรโมชัน")}</p>
                  ) : (
                    <div className="space-y-2">
                      {/* 합계 */}
                      <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-1.5 text-xs font-medium">
                        <span>{tr("총", "Total", "รวม")} {materials.length}{tr("종", " types", " ประเภท")}</span>
                        <span>
                          {tr("합계", "Total", "รวม")}: ฿{materials.reduce((s, m) => s + m.quantity * m.unitCost, 0).toLocaleString()}
                        </span>
                      </div>
                      {materials.map((mat) => {
                        const gf = giftsForMaterial(mat.id)
                        const giftSum = gf.reduce(
                          (a, g) => ({
                            alloc: a.alloc + g.allocatedQty,
                            dist: a.dist + g.distributedQty,
                            rem: a.rem + computedGiftRemaining(g.allocatedQty, g.distributedQty),
                          }),
                          { alloc: 0, dist: 0, rem: 0 }
                        )
                        const spots = mat.placementSpots ?? []
                        return (
                          <div key={mat.id} className="rounded-lg border">
                            <div className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{mat.name}</span>
                                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium",
                                    MATERIAL_STATUS_COLORS[mat.status] || "bg-gray-100 text-gray-700")}>
                                    {materialStatusLabel(mat.status)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {materialTypeLabel(mat.type)}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                  <span>{mat.quantity}{tr("개", "", " ชิ้น")}</span>
                                  {mat.unitCost > 0 && (
                                    <span>
                                      {tr("예상", "Est.", "ประมาณ")} ฿{mat.unitCost.toLocaleString()} × {mat.quantity} = ฿
                                      {(mat.quantity * mat.unitCost).toLocaleString()}
                                    </span>
                                  )}
                                  {(mat.actualCost ?? 0) > 0 && (
                                    <span className="text-foreground">
                                      {tr("실비", "Actual", "จริง")} ฿{(mat.actualCost ?? 0).toLocaleString()}
                                    </span>
                                  )}
                                  {mat.branches.length > 0 && (
                                    <span>
                                      {formatBranchList(mat.branches.slice(0, 3))}
                                      {mat.branches.length > 3 ? "..." : ""}
                                    </span>
                                  )}
                                  {spots.length > 0 && (
                                    <span>
                                      {tr("위치", "Placement", "ตำแหน่ง")}:{" "}
                                      {spots.map((spot) => materialPlacementSpotLabel(spot)).join(", ")}
                                    </span>
                                  )}
                                  {mat.isHqWide && <span>{tr("본사공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")}</span>}
                                  {(mat.displayStartDate || mat.displayEndDate) && (
                                    <span>
                                      {tr("게시기간", "Display Period", "ช่วงเวลาติดตั้ง")}: {mat.displayStartDate || "-"} ~ {mat.displayEndDate || "-"}
                                    </span>
                                  )}
                                  {mat.note && <span>{mat.note}</span>}
                                </div>
                                {gf.length > 0 && (
                                  <div className="mt-1 text-[10px] text-muted-foreground">
                                    {tr("사은품", "Gifts", "ของแถม")}: {tr("배정", "Alloc", "จัดสรร")}{" "}
                                    {giftSum.alloc} · {tr("배포", "Dist", "แจกจ่าย")} {giftSum.dist} · {tr("잔여", "Left", "คงเหลือ")}{" "}
                                    {giftSum.rem}
                                  </div>
                                )}
                              </div>
                              <div className="flex shrink-0 items-start gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  title={tr("사은품", "Gifts", "ของแถม")}
                                  onClick={() => toggleGiftPanel(mat.id)}
                                >
                                  {expandedGiftMatId === mat.id ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteMaterial(mat)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            {expandedGiftMatId === mat.id && (
                              <div className="space-y-2 border-t bg-muted/10 px-3 py-2 text-xs">
                                <p className="text-[11px] font-semibold">
                                  {tr("사은품 배정/배포", "Gift allocation & distribution", "จัดสรร/แจกจ่ายของแถม")}
                                </p>
                                {gf.length === 0 ? (
                                  <p className="text-[11px] text-muted-foreground">
                                    {tr("등록된 사은품이 없습니다.", "No gift rows.", "ไม่มีแถวของแถม")}
                                  </p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {gf.map((g) =>
                                      editingGiftId === g.id ? (
                                        <div key={g.id} className="grid gap-1.5 rounded border bg-background p-2 sm:grid-cols-2">
                                          <select
                                            value={giftEditDraft.storeName}
                                            onChange={(e) =>
                                              setGiftEditDraft((d) => ({ ...d, storeName: e.target.value }))
                                            }
                                            className="h-8 rounded-md border border-input bg-background px-2 text-xs sm:col-span-2"
                                          >
                                            <option value="">{tr("매장 선택", "Select store", "เลือกสาขา")}</option>
                                            {stores.map((s) => (
                                              <option key={s} value={s}>
                                                {formatStoreLabel(s)}
                                              </option>
                                            ))}
                                          </select>
                                          <Input
                                            className="h-8 text-xs sm:col-span-2"
                                            value={giftEditDraft.giftName}
                                            onChange={(e) =>
                                              setGiftEditDraft((d) => ({ ...d, giftName: e.target.value }))
                                            }
                                            placeholder={tr("사은품명", "Gift name", "ชื่อของแถม")}
                                          />
                                          <Input
                                            type="number"
                                            min={0}
                                            className="h-8 text-xs"
                                            value={giftEditDraft.allocatedQty}
                                            onChange={(e) =>
                                              setGiftEditDraft((d) => ({ ...d, allocatedQty: e.target.value }))
                                            }
                                            placeholder={tr("배정", "Alloc", "จัดสรร")}
                                          />
                                          <Input
                                            type="number"
                                            min={0}
                                            className="h-8 text-xs"
                                            value={giftEditDraft.distributedQty}
                                            onChange={(e) =>
                                              setGiftEditDraft((d) => ({ ...d, distributedQty: e.target.value }))
                                            }
                                            placeholder={tr("배포", "Dist", "แจกจ่าย")}
                                          />
                                          <div className="flex h-8 items-center rounded-md border border-dashed px-2 text-[11px] text-muted-foreground sm:col-span-2">
                                            {tr("잔여(자동)", "Remaining (auto)", "คงเหลือ (อัตโนมัติ)")}:{" "}
                                            <span className="ml-1 font-medium text-foreground">
                                              {computedGiftRemaining(
                                                Math.max(0, Math.floor(Number(giftEditDraft.allocatedQty) || 0)),
                                                Math.max(0, Math.floor(Number(giftEditDraft.distributedQty) || 0))
                                              )}
                                            </span>
                                          </div>
                                          <Input
                                            className="h-8 text-xs sm:col-span-2"
                                            value={giftEditDraft.ruleNote}
                                            onChange={(e) =>
                                              setGiftEditDraft((d) => ({ ...d, ruleNote: e.target.value }))
                                            }
                                            placeholder={tr("배포 기준 메모", "Distribution rule note", "หมายเหตุเกณฑ์แจกจ่าย")}
                                          />
                                          <div className="flex flex-wrap gap-1 sm:col-span-2">
                                            <Button
                                              type="button"
                                              size="sm"
                                              className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                                              disabled={savingGift}
                                              onClick={() => void handleSaveGiftEdit()}
                                            >
                                              {savingGift ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                              ) : (
                                                tr("저장", "Save", "บันทึก")
                                              )}
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                                              onClick={() => setEditingGiftId(null)}
                                            >
                                              {tr("취소", "Cancel", "ยกเลิก")}
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div
                                          key={g.id}
                                          className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2 py-1.5"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <span className="font-medium">{g.storeName}</span>
                                            <span className="text-muted-foreground"> · </span>
                                            <span>{g.giftName}</span>
                                            <div className="text-[10px] text-muted-foreground">
                                              {tr("배정", "Alloc", "จัดสรร")} {g.allocatedQty} · {tr("배포", "Dist", "แจกจ่าย")}{" "}
                                              {g.distributedQty} · {tr("잔여", "Left", "คงเหลือ")}{" "}
                                              {computedGiftRemaining(g.allocatedQty, g.distributedQty)}
                                              {giftRowQtyMismatch(g) && (
                                                <span className="ml-1 text-amber-800">
                                                  (DB {g.remainingQty})
                                                </span>
                                              )}
                                              {giftRowQtyMismatch(g) && (
                                                <AlertTriangle className="ml-0.5 inline h-3 w-3 text-amber-600 align-text-bottom" />
                                              )}
                                              {g.ruleNote ? ` · ${g.ruleNote}` : ""}
                                            </div>
                                          </div>
                                          <div className="flex shrink-0 gap-1">
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className={`${ADMIN_BTN_XS_CN} text-[10px]`}
                                              onClick={() => startEditGift(g)}
                                            >
                                              {tr("편집", "Edit", "แก้ไข")}
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                              onClick={() => void handleDeleteMaterialGift(g)}
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}
                                <div className="space-y-1.5 rounded border border-dashed bg-background p-2">
                                  <p className="text-[10px] font-medium text-muted-foreground">
                                    {tr("행 추가", "Add row", "เพิ่มแถว")}
                                  </p>
                                  <div className="grid gap-1.5 sm:grid-cols-2">
                                    <select
                                      value={giftAddDraft.storeName}
                                      onChange={(e) =>
                                        setGiftAddDraft((d) => ({ ...d, storeName: e.target.value }))
                                      }
                                      disabled={storesLoading}
                                      className="h-8 rounded-md border border-input bg-background px-2 text-xs sm:col-span-2"
                                    >
                                      <option value="">{tr("매장 선택", "Select store", "เลือกสาขา")}</option>
                                      {stores.map((s) => (
                                        <option key={s} value={s}>
                                          {formatStoreLabel(s)}
                                        </option>
                                      ))}
                                    </select>
                                    <Input
                                      className="h-8 text-xs sm:col-span-2"
                                      value={giftAddDraft.giftName}
                                      onChange={(e) =>
                                        setGiftAddDraft((d) => ({ ...d, giftName: e.target.value }))
                                      }
                                      placeholder={tr("사은품명", "Gift name", "ชื่อของแถม")}
                                    />
                                    <Input
                                      type="number"
                                      min={0}
                                      className="h-8 text-xs"
                                      value={giftAddDraft.allocatedQty}
                                      onChange={(e) =>
                                        setGiftAddDraft((d) => ({ ...d, allocatedQty: e.target.value }))
                                      }
                                      placeholder={tr("배정", "Alloc", "จัดสรร")}
                                    />
                                    <Input
                                      type="number"
                                      min={0}
                                      className="h-8 text-xs"
                                      value={giftAddDraft.distributedQty}
                                      onChange={(e) =>
                                        setGiftAddDraft((d) => ({ ...d, distributedQty: e.target.value }))
                                      }
                                      placeholder={tr("배포", "Dist", "แจกจ่าย")}
                                    />
                                    <div className="flex h-8 items-center rounded-md border border-dashed px-2 text-[11px] text-muted-foreground sm:col-span-2">
                                      {tr("잔여(자동)", "Remaining (auto)", "คงเหลือ (อัตโนมัติ)")}:{" "}
                                      <span className="ml-1 font-medium text-foreground">
                                        {computedGiftRemaining(
                                          Math.max(0, Math.floor(Number(giftAddDraft.allocatedQty) || 0)),
                                          Math.max(0, Math.floor(Number(giftAddDraft.distributedQty) || 0))
                                        )}
                                      </span>
                                    </div>
                                    <Input
                                      className="h-8 text-xs sm:col-span-2"
                                      value={giftAddDraft.ruleNote}
                                      onChange={(e) =>
                                        setGiftAddDraft((d) => ({ ...d, ruleNote: e.target.value }))
                                      }
                                      placeholder={tr("배포 기준 메모", "Distribution rule note", "หมายเหตุเกณฑ์แจกจ่าย")}
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                                    disabled={savingGift || storesLoading}
                                    onClick={() => void handleAddMaterialGift(mat.id)}
                                  >
                                    {savingGift ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Plus className="h-3 w-3" />
                                    )}
                                    {tr("추가", "Add", "เพิ่ม")}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── 성과/비용 탭 ───────────────────────────────────────────── */}
              {activeTab === "results" && (
                <div className="p-4 space-y-4">
                  <Button variant="outline" size="sm" onClick={handleLoadResults} disabled={loadingResults}>
                    {loadingResults ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart2 className="mr-2 h-4 w-4" />}
                    {tr("성과/비용 조회", "Load Result/Cost", "ดึงผลลัพธ์/ต้นทุน")}
                  </Button>

                  {costResults && (
                    <div className="rounded-lg border p-3 space-y-1">
                      <p className="text-xs font-semibold mb-2">{tr("비용 집계", "Cost Summary", "สรุปต้นทุน")}</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{tr("통장 출금", "Bank Outflow", "ถอนจากบัญชีธนาคาร")}</span>
                        <span>฿{costResults.bankCosts.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{tr("소액현금", "Petty Cash", "เงินสดย่อย")}</span>
                        <span>฿{costResults.pettyCosts.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold border-t pt-1">
                        <span>{tr("합계", "Total", "รวม")}</span>
                        <span>฿{costResults.totalCosts.toLocaleString()}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {tr("집계", "Attribution", "การระบุที่มา")}: {costResults.attributionMode || "heuristic"} ({Math.round((costResults.attributionConfidence ?? 0) * 100)}%)
                      </p>
                    </div>
                  )}

                  {posResults && (
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-semibold mb-2">{tr("POS 실적", "POS Result", "ผลลัพธ์ POS")}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                        {[
                          { label: tr("매장", "Dine-in", "ทานที่ร้าน"), orders: posResults.dineInOrders, sales: posResults.dineInSales },
                          { label: tr("배달", "Delivery", "เดลิเวอรี"), orders: posResults.deliveryOrders, sales: posResults.deliverySales },
                          { label: tr("포장", "Takeout", "สั่งกลับบ้าน"), orders: posResults.carryOutOrders, sales: posResults.carryOutSales },
                          { label: tr("합계", "Total", "รวม"), orders: posResults.totalOrders, sales: posResults.totalSales },
                        ].map((row) => (
                          <div key={row.label} className={cn("rounded px-2 py-1",
                            row.label === tr("합계", "Total", "รวม") ? "bg-primary/10" : "bg-muted/50")}>
                            <div className="text-xs text-muted-foreground">{row.label}</div>
                            <div className="font-semibold">{row.orders.toLocaleString()}{tr("건", "", " รายการ")}</div>
                            <div className="text-xs">฿{row.sales.toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        {tr("집계", "Attribution", "การระบุที่มา")}: {posResults.attributionMode || "heuristic"} ({Math.round((posResults.attributionConfidence ?? 0) * 100)}%)
                        {typeof posResults.linkedOrders === "number" && (
                          <span className="ml-2">{tr("직접연결", "linked", "เชื่อมตรง")} {posResults.linkedOrders}{tr("건", "", " รายการ")} / {tr("추정", "fallback", "ประมาณ")} {posResults.fallbackOrders ?? 0}{tr("건", "", " รายการ")}</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          </>
          )}

          {hubTab === "list" && (
          <>
          {/* ── 캠페인 목록 (필터 + 검색 + 행별 연결 메뉴) ───────────────────────────── */}
          <div className="rounded-xl border bg-card">
            {listLoadError && (
              <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
                <p className="font-medium text-destructive">{listLoadError}</p>
                <p className="mt-2 text-xs leading-relaxed text-destructive/90">
                  {tr(
                    "DB에 데이터가 있는지 Supabase → SQL Editor에서 실행: select count(*) from public.marketing_campaigns;",
                    "To verify rows in DB, run in Supabase → SQL Editor: select count(*) from public.marketing_campaigns;",
                    "ตรวจว่ามีแถวในฐานข้อมูลหรือไม่: Supabase → SQL Editor รัน select count(*) from public.marketing_campaigns;"
                  )}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-3 border-b px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {tr("캠페인 목록", "Campaign List", "รายการแคมเปญ")}
                  {!listLoadError && !loading && list.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({tr("불러옴", "loaded", "โหลดแล้ว")} {list.length}
                      {tr("건", "", " รายการ")})
                    </span>
                  )}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {(listFiltersActive || listSearch.trim()) && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={resetListFilters}>
                      {tr("초기화", "Reset", "รีเซ็ต")}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-x-2 gap-y-2 rounded-lg border border-border/70 bg-muted/10 px-2 py-2 sm:px-3">
                <div className="flex shrink-0 flex-col gap-0.5">
                  <span className="text-[9px] font-medium leading-none text-muted-foreground whitespace-nowrap">
                    {tr("조회 기간", "Period", "ช่วงวันที่")}
                  </span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="date"
                      title={tr("시작", "From", "เริ่ม")}
                      className="h-8 w-[8.65rem] shrink-0 px-1.5 text-xs"
                      value={listPeriodFrom}
                      onChange={(e) => setListPeriodFrom(e.target.value)}
                    />
                    <span className="shrink-0 pb-0.5 text-[10px] text-muted-foreground">~</span>
                    <Input
                      type="date"
                      title={tr("종료", "To", "ถึง")}
                      className="h-8 w-[8.65rem] shrink-0 px-1.5 text-xs"
                      value={listPeriodTo}
                      onChange={(e) => setListPeriodTo(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex min-w-[6.5rem] max-w-[9.5rem] flex-col gap-0.5 sm:min-w-[7.5rem]">
                  <Label className="text-[9px] font-medium leading-none text-muted-foreground">
                    {tr("검색 범위", "Search in", "ค้นหาใน")}
                  </Label>
                  <select
                    value={listSearchScope}
                    onChange={(e) => setListSearchScope(e.target.value as CampaignListSearchScope)}
                    className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-[11px]"
                  >
                    <option value="all">{tr("전체 필드", "All fields", "ทุกฟิลด์")}</option>
                    <option value="topic">{tr("제목만", "Title only", "ชื่ออย่างเดียว")}</option>
                    <option value="campaignNo">{tr("캠페인 번호만", "Campaign no. only", "เฉพาะเลขแคมเปญ")}</option>
                    <option value="format">{tr("채널/형식만", "Format only", "เฉพาะรูปแบบ")}</option>
                    <option value="audience_promo">
                      {tr("지점·대상·프로모", "Branch, audience, promo", "สาขา กลุ่มเป้า โปร")}
                    </option>
                  </select>
                </div>
                <div className="flex min-w-[5.5rem] max-w-[9rem] flex-col gap-0.5">
                  <Label className="text-[9px] font-medium leading-none text-muted-foreground">{tr("매장", "Store", "สาขา")}</Label>
                  <select
                    value={listBranchFilter || "_all"}
                    onChange={(e) => setListBranchFilter(e.target.value === "_all" ? "" : e.target.value)}
                    disabled={storesLoading}
                    className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-[11px] disabled:opacity-60"
                  >
                    <option value="_all">{tr("전체", "All", "ทั้งหมด")}</option>
                    <option value="_allStoresPlan">{tr("전체 매장(기획)만", "All stores (plan) only", "เฉพาะทุกสาขา (แผน)")}</option>
                    {stores.map((s) => (
                      <option key={s} value={s}>
                        {formatStoreLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="relative min-w-[8rem] flex-1 basis-[10rem]">
                  <Label className="sr-only">{tr("검색", "Search", "ค้นหา")}</Label>
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        loadList()
                      }
                    }}
                    placeholder={tr("키워드…", "Keyword…", "คำค้น…")}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-8 shrink-0 gap-1 px-3 text-xs"
                  disabled={loading}
                  onClick={() => loadList()}
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  {tr("검색", "Search", "ค้นหา")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1 px-2.5 text-xs"
                  onClick={() => setListFiltersOpen((o) => !o)}
                >
                  <Filter className="h-3.5 w-3.5" />
                  {tr("필터", "Filters", "ตัวกรอง")}
                  {listFiltersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
              </div>

              {listFiltersOpen && (
                <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 px-3 py-3">
                  <div className="space-y-1.5 border-b border-border/60 pb-3">
                    <p className="text-xs font-medium text-foreground">{tr("디자인 기간", "Design period", "ช่วงงานดีไซน์")}</p>
                    <div className="flex flex-wrap gap-2">
                      <div className="min-w-[9rem] flex-1 space-y-1">
                        <Label className="text-[10px] text-muted-foreground">{tr("시작", "From", "เริ่ม")}</Label>
                        <Input
                          type="date"
                          className="h-9"
                          value={listDesignFrom}
                          onChange={(e) => setListDesignFrom(e.target.value)}
                        />
                      </div>
                      <div className="min-w-[9rem] flex-1 space-y-1">
                        <Label className="text-[10px] text-muted-foreground">{tr("종료", "To", "ถึง")}</Label>
                        <Input
                          type="date"
                          className="h-9"
                          value={listDesignTo}
                          onChange={(e) => setListDesignTo(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      {tr(
                        "디자인 시작/종료가 조회 구간과 겹치는 캠페인만 표시합니다.",
                        "Shows campaigns whose design period overlaps this range.",
                        "แสดงเฉพาะแคมเปญที่ช่วงงานดีไซน์ทับซ้อนกับช่วงนี้",
                      )}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 lg:items-end">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{tr("캠페인 유형", "Campaign type", "ประเภทแคมเปญ")}</Label>
                      <select
                        value={listCampaignTypeFilter || "_all"}
                        onChange={(e) => setListCampaignTypeFilter(e.target.value === "_all" ? "" : e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="_all">{tr("전체", "All", "ทั้งหมด")}</option>
                        {CAMPAIGN_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {lang === "en" ? o.en : lang === "th" ? o.th : o.ko}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t("marketingCampaignListHubLinkLabel")}</Label>
                      <select
                        value={listHubLinkFilter || "_all"}
                        onChange={(e) => setListHubLinkFilter(e.target.value === "_all" ? "" : e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="_all">{tr("전체", "All", "ทั้งหมด")}</option>
                        <option value="collab">{t("marketingCampaignListHubLinkCollab")}</option>
                        <option value="promo_set">{t("marketingCampaignListHubLinkPromoSet")}</option>
                        <option value="ads_roas">{t("marketingCampaignListHubLinkAdsRoas")}</option>
                        <option value="influencer">{t("marketingCampaignListHubLinkInfluencer")}</option>
                        <option value="materials">{t("marketingCampaignListHubLinkMaterials")}</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border/60 pt-3">
                    <span className="w-full text-xs font-medium text-foreground sm:w-auto">{tr("상태", "Status", "สถานะ")}</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox checked={listStatusDraft} onCheckedChange={(v) => setListStatusDraft(v === true)} />
                      {statusLabel("draft")}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox checked={listStatusOngoing} onCheckedChange={(v) => setListStatusOngoing(v === true)} />
                      {statusLabel("ongoing")}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox checked={listStatusFinish} onCheckedChange={(v) => setListStatusFinish(v === true)} />
                      {statusLabel("finish")}
                    </label>
                  </div>

                  <div className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{tr("예산 최소 (฿)", "Budget min (฿)", "งบขั้นต่ำ (฿)")}</Label>
                      <Input
                        className="h-9"
                        inputMode="decimal"
                        value={listBudgetMin}
                        onChange={(e) => setListBudgetMin(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{tr("예산 최대 (฿)", "Budget max (฿)", "งบสูงสุด (฿)")}</Label>
                      <Input
                        className="h-9"
                        inputMode="decimal"
                        value={listBudgetMax}
                        onChange={(e) => setListBudgetMax(e.target.value)}
                        placeholder="—"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{tr("KPI 목표 최소", "KPI target min", "KPI ขั้นต่ำ")}</Label>
                      <Input
                        className="h-9"
                        inputMode="decimal"
                        value={listKpiMin}
                        onChange={(e) => setListKpiMin(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{tr("KPI 목표 최대", "KPI target max", "KPI สูงสุด")}</Label>
                      <Input
                        className="h-9"
                        inputMode="decimal"
                        value={listKpiMax}
                        onChange={(e) => setListKpiMax(e.target.value)}
                        placeholder="—"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{tr("KPI 단위", "KPI unit", "หน่วย KPI")}</Label>
                      <select
                        value={listKpiUnitFilter || "_any"}
                        onChange={(e) => setListKpiUnitFilter(e.target.value === "_any" ? "" : e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="_any">{tr("전체", "All", "ทั้งหมด")}</option>
                        {KPI_UNIT_OPTIONS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{tr("기획 할인", "Planned discount", "ส่วนลดที่วางแผน")}</Label>
                      <select
                        value={listDiscountFilter}
                        onChange={(e) => setListDiscountFilter(e.target.value as "any" | "none" | "percent" | "amount")}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="any">{tr("제한 없음", "Any", "ไม่กรอง")}</option>
                        <option value="none">{tr("할인 없음", "No discount", "ไม่มีส่วนลด")}</option>
                        <option value="percent">{tr("퍼센트 할인", "Percent off", "ส่วนลด %")}</option>
                        <option value="amount">{tr("금액 할인", "Amount off", "ส่วนลดเงิน")}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {list.length > 0 && filteredList.length === 0 && !listFilterBypass && !loading && !listLoadError && (
              <div className="flex flex-col gap-2 border-b border-amber-200/80 bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/30 dark:border-amber-800/50">
                <p className="text-amber-950 dark:text-amber-100">
                  {tr(
                    "서버에서는 캠페인을 불러왔지만, 현재 필터·검색 조건과 맞는 행이 없습니다. 아래를 누르면 필터 없이 전체를 표시합니다.",
                    "Campaigns were loaded, but nothing matches the current filters. Click below to show all loaded rows without filters.",
                    "โหลดแคมเปญแล้วแต่ไม่มีแถวที่ตรงตัวกรอง กดด้านล่างเพื่อแสดงทั้งหมดโดยไม่กรอง",
                  )}
                </p>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-amber-800/40 bg-background text-xs"
                    onClick={() => setListFilterBypass(true)}
                  >
                    {tr("필터 없이 전체 보기", "Show all (ignore filters)", "แสดงทั้งหมด (ไม่กรอง)")} ({list.length}
                    {tr("건", "", " รายการ")})
                  </Button>
                </div>
              </div>
            )}
            {listFilterBypass && list.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2 text-xs">
                <span className="text-muted-foreground">
                  {tr("필터를 적용하지 않고 불러온 목록 전체를 표시 중입니다.", "Showing all loaded campaigns; filters are not applied.", "กำลังแสดงทั้งหมดโดยไม่ใช้ตัวกรอง")}
                </span>
                <Button type="button" variant="ghost" size="sm" className={`${ADMIN_BTN_XS_CN} text-xs`} onClick={() => setListFilterBypass(false)}>
                  {tr("필터 다시 적용", "Apply filters again", "ใช้ตัวกรองอีกครั้ง")}
                </Button>
              </div>
            )}
            <div className="divide-y overflow-x-auto">
              {campaignListForDisplay.length === 0 &&
                !loading &&
                !listLoadError &&
                !(list.length > 0 && filteredList.length === 0 && !listFilterBypass) && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {list.length === 0
                    ? (
                        <>
                          {tr("등록된 캠페인이 없습니다.", "No campaigns.", "ไม่มีแคมเปญ")}
                          <span className="mt-2 block text-xs">
                            {tr(
                              "DB에는 있는데 여기만 비면 API/환경 변수 문제일 수 있습니다. 위 빨간 오류가 없을 때 Supabase에서 select count(*) from public.marketing_campaigns 로 개수를 확인해 보세요.",
                              "If the DB has rows but this stays empty, check API/env. With no red error above, run select count(*) from public.marketing_campaigns in Supabase.",
                              "ถ้าฐานข้อมูลมีแต่หน้านี้ว่าง อาจเป็นปัญหา API/env ลองรัน select count(*) from public.marketing_campaigns ใน Supabase"
                            )}
                          </span>
                        </>
                      )
                    : tr(
                        "필터·검색 조건에 맞는 캠페인이 없습니다.",
                        "No campaigns match filters or search.",
                        "ไม่มีแคมเปญที่ตรงกับตัวกรองหรือการค้นหา",
                      )}
                </p>
              )}
              {loading && campaignListForDisplay.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin opacity-60" />
                  {tr("불러오는 중…", "Loading…", "กำลังโหลด…")}
                </p>
              )}
              {campaignListForDisplay.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
                    editingId === c.id && "bg-primary/5"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {c.campaignNo && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {c.campaignNo}
                        </span>
                      )}
                      <span className="font-semibold">{c.topic}</span>
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-800">
                        {getCampaignTypeLabel(c.campaignType, lang)}
                      </span>
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        c.status === "ongoing" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                          c.status === "finish" ? "bg-gray-100 text-gray-600" :
                            "bg-amber-100 text-amber-800")}>
                        {statusLabel(c.status)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0 text-xs text-muted-foreground mt-0.5">
                      {c.format && <span>{c.format}</span>}
                      {(c.startDate || c.endDate) && <span>{c.startDate || "~"} ~ {c.endDate || "~"}</span>}
                      {(c.designStartDate || c.designEndDate) && (
                        <span>
                          {tr("디자인", "Design", "ดีไซน์")}: {c.designStartDate || "~"} ~ {c.designEndDate || "~"}
                        </span>
                      )}
                      {(c.phasePeriods && c.phasePeriods.length > 0) && (
                        <span className="max-w-full text-[11px] leading-snug" title={
                          c.phasePeriods
                            .map((p, i) => {
                              const lb = (p.label ?? "").trim() || `${i + 1}차`
                              return `${lb} ${p.startDate || "—"} ~ ${p.endDate || "—"}`
                            })
                            .join(" · ")
                        }>
                          {tr("차수", "Phases", "รอบ")}:{" "}
                          {c.phasePeriods.map((p, i) => {
                            const lb = (p.label ?? "").trim() || `${i + 1}차`
                            return (
                              <span key={i}>
                                {i > 0 ? " · " : ""}
                                {lb} {p.startDate || "—"}~{p.endDate || "—"}
                              </span>
                            )
                          })}
                        </span>
                      )}
                      {c.branches && c.branches.length > 0 ? (
                        <span>
                          {formatBranchList(c.branches.slice(0, 3))}
                          {c.branches.length > 3 ? ` +${c.branches.length - 3}` : ""}
                        </span>
                      ) : (
                        <span className="text-amber-800/90 dark:text-amber-200/90">
                          {tr("전체 매장(기획)", "All stores (plan)", "ทุกสาขา (แผน)")}
                        </span>
                      )}
                      {(c.discountPricePromotion ?? "").trim() && (
                        <span className="max-w-[220px] truncate" title={c.discountPricePromotion}>
                          {tr("요약", "Summary", "สรุป")}: {c.discountPricePromotion}
                        </span>
                      )}
                      {(c.discountTargetAudience ?? "").trim() && (
                        <span className="max-w-[200px] truncate" title={c.discountTargetAudience}>
                          {tr("대상", "Audience", "กลุ่มเป้าหมาย")}: {c.discountTargetAudience}
                        </span>
                      )}
                      {c.kpiTarget > 0 && <span>KPI: {c.kpiTarget.toLocaleString()} {kpiUnitLabel(c.kpiUnit)}</span>}
                      {c.budgetTotal > 0 && <span>{tr("예산", "Budget", "งบประมาณ")}: ฿{c.budgetTotal.toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="flex w-full max-w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
                    <span className="mr-1 text-[10px] font-medium text-muted-foreground">{tr("연결", "Links", "ลิงก์")}:</span>
                    <Button type="button" variant="outline" size="sm" className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                      title={tr("프로모션 세트", "Promotion Sets", "ชุดโปรโมชัน")}
                      onClick={() => router.push(`/admin/marketing/promos?campaignId=${c.id}`)}>
                      <Tag className="h-3 w-3" /> {tr("세트", "Promos", "ชุดโปรโมชัน")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                      title={tr("광고", "Ads", "โฆษณา")}
                      onClick={() => router.push(`/admin/marketing/ads?campaignId=${c.id}`)}>
                      <TrendingUp className="h-3 w-3" /> {tr("광고", "Ads", "โฆษณา")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                      title={tr("인플루언서", "Influencers", "อินฟลูเอนเซอร์")}
                      onClick={() => router.push(`/admin/marketing/influencers?campaignId=${c.id}`)}>
                      <Users className="h-3 w-3" /> {tr("인플", "Influencers", "อินฟลูเอนเซอร์")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                      title={tr("매장 홍보물", "Store promo materials", "สื่อโปรโมชันที่สาขา")}
                      onClick={() => router.push(`/admin/marketing/materials?campaignId=${c.id}`)}>
                      <Package className="h-3 w-3" /> {tr("홍보물", "Materials", "สื่อโปรโมชัน")}
                    </Button>
                    <span className="mx-0.5 text-muted-foreground">|</span>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleCopyCampaign(c)} title={tr("복사", "Copy", "คัดลอก")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className={`${ADMIN_BTN_XS_CN} text-xs`} onClick={() => handleEdit(c)}>{tr("수정", "Edit", "แก้ไข")}</Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(c)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
          )}

          {hubTab === "compare" && <CampaignAbComparePanel />}

        </div>
    </MarketingPageShell>
  )
}

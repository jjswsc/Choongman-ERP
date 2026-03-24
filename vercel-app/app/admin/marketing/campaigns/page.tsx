"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import {
  Megaphone, Save, Plus, Trash2, RotateCw, Upload, Calculator, Copy,
  Users, Package, BarChart2, ExternalLink, Loader2, CheckCheck, X,
  List, ClipboardPen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMarketingCampaigns,
  getMarketingCampaign,
  saveMarketingCampaign,
  deleteMarketingCampaign,
  importMarketingExcel,
  getMarketingCampaignResults,
  getMarketingCampaignCosts,
  getMarketingAds,
  getMarketingInfluencers,
  saveMarketingInfluencer,
  deleteMarketingInfluencer,
  getPosPromos,
  getMarketingMaterials,
  saveMarketingMaterial,
  deleteMarketingMaterial,
  useStoreList,
  type MarketingCampaign,
  type MarketingInfluencer,
  type MarketingMaterial,
} from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { PromoSetSimulator } from "@/components/marketing/promo-set-simulator"
import { useRouter } from "next/navigation"

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

const CAMPAIGN_TYPE_OPTIONS = [
  { value: "menu_discount", ko: "메뉴 할인 캠페인", en: "Menu Discount", th: "แคมเปญส่วนลดเมนู" },
  { value: "new_menu_launch", ko: "신메뉴 런칭", en: "New Menu Launch", th: "เปิดตัวเมนูใหม่" },
  { value: "membership_crm", ko: "멤버십/재방문 유도", en: "Membership/CRM", th: "สมาชิก/กระตุ้นการกลับมาซื้อ" },
  { value: "delivery_activation", ko: "배달 채널 활성화", en: "Delivery Activation", th: "กระตุ้นช่องทางเดลิเวอรี" },
  { value: "collab_marketing", ko: "협업 마케팅", en: "Collab Marketing", th: "การตลาดร่วมมือ" },
  { value: "brand_promo", ko: "브랜드 홍보 캠페인", en: "Brand Promotion", th: "แคมเปญโปรโมตแบรนด์" },
  { value: "new_store", ko: "신규 매장 오픈 캠페인", en: "New Store Opening", th: "แคมเปญเปิดสาขาใหม่" },
  { value: "seasonal", ko: "시즌/이벤트 캠페인", en: "Seasonal/Event", th: "แคมเปญตามฤดูกาล/อีเวนต์" },
  { value: "other", ko: "기타", en: "Other", th: "อื่นๆ" },
]
const CAMPAIGN_TYPE_OTHER_PREFIX = "other:"

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

const normalizeCampaignTypeInput = (value: string) => value.trim().replace(/\s+/g, " ")

const toCampaignTypeFormState = (raw: string | undefined | null) => {
  const value = String(raw ?? "").trim()
  if (!value) return { type: "menu_discount", custom: "" }
  if (value.startsWith(CAMPAIGN_TYPE_OTHER_PREFIX)) {
    return {
      type: "other",
      custom: normalizeCampaignTypeInput(value.slice(CAMPAIGN_TYPE_OTHER_PREFIX.length)),
    }
  }
  const exists = CAMPAIGN_TYPE_OPTIONS.some((x) => x.value === value)
  if (exists) return { type: value, custom: "" }
  return { type: "other", custom: normalizeCampaignTypeInput(value) }
}

const toCampaignTypeStorageValue = (type: string, custom: string) => {
  if (type !== "other") return type
  const normalized = normalizeCampaignTypeInput(custom)
  return normalized ? `${CAMPAIGN_TYPE_OTHER_PREFIX}${normalized}` : "other"
}

const getCampaignTypeLabel = (raw: string | undefined | null, lang: string) => {
  const parsed = toCampaignTypeFormState(raw)
  if (parsed.type === "other") {
    if (parsed.custom) return parsed.custom
    if (lang === "en") return "Other"
    if (lang === "th") return "อื่นๆ"
    return "기타"
  }
  const option = CAMPAIGN_TYPE_OPTIONS.find((x) => x.value === parsed.type)
  if (!option) return String(raw ?? (lang === "en" ? "N/A" : lang === "th" ? "ไม่มีประเภท" : "유형없음"))
  if (lang === "en") return option.en
  if (lang === "th") return option.th
  return option.ko
}

const KPI_UNIT_OPTIONS = [
  { value: "order", label: "주문" },
  { value: "sales", label: "매출" },
  { value: "customer", label: "고객수" },
  { value: "new_customer", label: "신규고객" },
  { value: "repeat_customer", label: "재방문고객" },
  { value: "coupon", label: "쿠폰사용" },
  { value: "member", label: "회원가입" },
  { value: "impression", label: "노출수" },
  { value: "reach", label: "도달수" },
  { value: "click", label: "클릭수" },
  { value: "ctr", label: "클릭률(CTR)" },
  { value: "conversion", label: "전환수" },
  { value: "cvr", label: "전환율(CVR)" },
  { value: "roas", label: "ROAS" },
  { value: "aov", label: "객단가(AOV)" },
  { value: "followers", label: "팔로워증가" },
  { value: "engagement", label: "참여수" },
]

const MATERIAL_TYPES = [
  { value: "tentcard", label: "텐트카드" },
  { value: "standee", label: "스탠디" },
  { value: "coupon", label: "쿠폰/전단" },
  { value: "flyer", label: "플라이어" },
  { value: "banner", label: "배너" },
  { value: "prop", label: "프롭" },
  { value: "other", label: "기타" },
]

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
  branches: [] as string[],
  discountType: "percent",
  discountValue: "",
  discountPricePromotion: "",
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

const defaultInfForm = {
  name: "",
  followers: "",
  contentTopic: "",
  hireType: "pay",
  budget: "",
  shootingDate: "",
  publishDate: "",
  note: "",
}

const defaultMatForm = {
  type: "tentcard",
  name: "",
  quantity: "1",
  unitCost: "",
  status: "planning",
  note: "",
}

// ─── 페이지 ──────────────────────────────────────────────────────────────────
export default function MarketingCampaignsPage() {
  const router = useRouter()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, loading: storesLoading } = useStoreList()
  const tr = React.useCallback((ko: string, en: string, th: string) => {
    if (lang === "en") return en
    if (lang === "th") return th
    return ko
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
  const materialTypeLabel = React.useCallback((value: string) => {
    switch (value) {
      case "tentcard": return tr("텐트카드", "Tent Card", "เทนท์การ์ด")
      case "standee": return tr("스탠디", "Standee", "สแตนดี้")
      case "coupon": return tr("쿠폰/전단", "Coupon/Flyer", "คูปอง/ใบปลิว")
      case "flyer": return tr("플라이어", "Flyer", "ใบปลิว")
      case "banner": return tr("배너", "Banner", "แบนเนอร์")
      case "prop": return tr("프롭", "Props", "พร็อพ")
      case "other": return tr("기타", "Other", "อื่นๆ")
      default: return value
    }
  }, [tr])
  const materialStatusLabel = React.useCallback((value: string) => {
    switch (value) {
      case "planning": return tr("계획중", "Planning", "วางแผน")
      case "producing": return tr("제작중", "Producing", "กำลังผลิต")
      case "completed": return tr("완료", "Completed", "เสร็จแล้ว")
      case "distributed": return tr("배포완료", "Distributed", "แจกจ่ายแล้ว")
      default: return value
    }
  }, [tr])

  // 캠페인 목록
  const [list, setList] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)

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
  const [showSimulator, setShowSimulator] = React.useState(false)

  // 하위 활동 탭
  const [activeTab, setActiveTab] = React.useState<"influencers" | "materials" | "results">("influencers")

  // 허브: 등록·수정 vs 목록
  const [hubTab, setHubTab] = React.useState<"form" | "list">("form")
  const [listSelectedId, setListSelectedId] = React.useState<string | null>(null)

  // 인플루언서 인라인
  const [linkedInfluencers, setLinkedInfluencers] = React.useState<MarketingInfluencer[]>([])
  const [infForm, setInfForm] = React.useState(defaultInfForm)
  const [savingInf, setSavingInf] = React.useState(false)

  // 판촉물 인라인
  const [materials, setMaterials] = React.useState<MarketingMaterial[]>([])
  const [matForm, setMatForm] = React.useState({ ...defaultMatForm, branches: [] as string[] })
  const [savingMat, setSavingMat] = React.useState(false)

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
  const loadList = React.useCallback(() => {
    setLoading(true)
    getMarketingCampaigns()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => { loadList() }, [loadList])

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
  }, [])

  React.useEffect(() => {
    if (!editingId) {
      setLinkedCounts(null)
      setLinkedInfluencers([])
      setMaterials([])
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
          branches: Array.isArray(c.branches) ? [...c.branches] : [],
          discountType: c.discountType ?? "percent",
          discountValue: String(c.discountValue ?? ""),
          discountPricePromotion: c.discountPricePromotion ?? "",
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
    setListSelectedId(null)
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
    setInfForm(defaultInfForm)
    setMatForm({ ...defaultMatForm, branches: [] })
  }

  const handleEdit = (
    c: MarketingCampaign,
    tab: "influencers" | "materials" | "results" = "influencers",
  ) => {
    setHubTab("form")
    setListSelectedId(c.id)
    setEditingId(c.id)
    setActiveTab(tab)
  }

  const openMaterialsForSelectedCampaign = async () => {
    if (!listSelectedId) {
      await appAlert(
        tr(
          "목록에서 캠페인 행을 눌러 선택한 뒤 다시 시도하세요.",
          "Select a campaign row in the list, then try again.",
          "กรุณาเลือกแถวแคมเปญในรายการแล้วลองอีกครั้ง"
        )
      )
      return
    }
    const c = list.find((x) => x.id === listSelectedId)
    if (c) handleEdit(c, "materials")
  }

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
        branches: Array.isArray(detail.branches) ? [...detail.branches] : [],
        discountType: detail.discountType ?? "percent",
        discountValue: String(detail.discountValue ?? ""),
        discountPricePromotion: detail.discountPricePromotion ?? "",
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
        branches: form.branches,
        discountType: form.discountType,
        discountValue: Number(form.discountValue) || 0,
        discountPricePromotion: form.discountPricePromotion.trim(),
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
      })
      if (res.success) {
        await appAlert(t("itemsAlertSaved") || tr("저장되었습니다.", "Saved.", "บันทึกแล้ว"))
        if (!editingId && res.id) setEditingId(res.id)
        loadList()
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

  // ─── 인플루언서 인라인 핸들러 ───────────────────────────────────────────────
  const handleAddInfluencer = async () => {
    if (!editingId || !infForm.name.trim()) {
      await appAlert(tr("이름을 입력하세요.", "Please enter name.", "กรุณากรอกชื่อ"))
      return
    }
    setSavingInf(true)
    try {
      const res = await saveMarketingInfluencer({
        campaignId: editingId,
        name: infForm.name.trim(),
        followers: infForm.followers.trim(),
        contentTopic: infForm.contentTopic.trim(),
        hireType: infForm.hireType,
        budget: Number(infForm.budget) || 0,
        shootingDate: infForm.shootingDate || null,
        publishDate: infForm.publishDate || null,
        note: infForm.note.trim(),
        status: "finish",
      })
      if (res.success) {
        setInfForm(defaultInfForm)
        loadSubActivities(editingId)
        loadLinkedCounts(editingId)
      } else {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
      }
    } finally {
      setSavingInf(false)
    }
  }

  const handleDeleteInfluencer = async (inf: MarketingInfluencer) => {
    if (!await appConfirm(`"${inf.name}" ${tr("삭제하시겠습니까?", "Delete this item?", "ต้องการลบรายการนี้หรือไม่?")}`)) return
    const res = await deleteMarketingInfluencer({ id: inf.id })
    if (res.success && editingId) {
      loadSubActivities(editingId)
      loadLinkedCounts(editingId)
    } else if (!res.success) {
      await appAlert(res.message || tr("삭제 실패", "Delete failed", "ลบไม่สำเร็จ"))
    }
  }

  // ─── 판촉물 인라인 핸들러 ──────────────────────────────────────────────────
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
        branches: matForm.branches,
        status: matForm.status,
        note: matForm.note.trim(),
      })
      if (res.success) {
        setMatForm({ ...defaultMatForm, branches: [] })
        loadSubActivities(editingId)
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
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">

        {/* 헤더 */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {tr("캠페인 허브", "Campaign Hub", "ศูนย์กลางแคมเปญ")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {tr(
                "마케팅 캠페인 등록 및 통합 관리",
                "Create and manage marketing campaigns",
                "ลงทะเบียนและจัดการแคมเปญการตลาดแบบรวมศูนย์"
              )}
            </p>
          </div>
        </div>

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

        {/* 등록·수정 / 목록 */}
        <div className="mb-4 flex rounded-lg border bg-muted/30 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setHubTab("form")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-2.5 transition-colors",
              hubTab === "form" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ClipboardPen className="h-4 w-4 shrink-0" />
            {tr("등록·수정", "Create / Edit", "สร้าง / แก้ไข")}
          </button>
          <button
            type="button"
            onClick={() => setHubTab("list")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-2.5 transition-colors",
              hubTab === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="h-4 w-4 shrink-0" />
            {tr("목록", "List", "รายการ")}
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
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => router.push(`/admin/marketing/ads?campaignId=${editingId}`)}>
                      <ExternalLink className="h-3 w-3" />{tr("광고", "Ads", "โฆษณา")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
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
                        <span className="truncate">{store}</span>
                      </label>
                    ))}
                  </div>
                )}
                {form.branches.length > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {tr("선택됨", "Selected", "เลือกแล้ว")}: {form.branches.join(", ")}
                  </p>
                )}
              </div>

              {/* 할인 정책(프로모션 세트 연결) */}
              <div className="sm:col-span-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">
                      {tr("할인 정책", "Discount Policy", "นโยบายส่วนลด")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {tr(
                        "할인 유형/값은 프로모션 세트에서 관리합니다.",
                        "Discount type/value is managed in Promotion Sets.",
                        "ประเภท/มูลค่าส่วนลดจัดการที่ชุดโปรโมชัน"
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => router.push(`/admin/marketing/promos${editingId ? `?campaignId=${editingId}` : ""}`)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    {tr("프로모션 세트로 이동", "Go to Promotion Sets", "ไปที่ชุดโปรโมชัน")}
                  </Button>
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
                  { key: "materials", icon: <Package className="h-3.5 w-3.5" />, label: `${tr("판촉물", "Materials", "สื่อโปรโมชัน")} (${materials.length})` },
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

              {/* ── 인플루언서 탭 ─────────────────────────────────────────── */}
              {activeTab === "influencers" && (
                <div className="p-4 space-y-4">
                  {/* 빠른 등록 */}
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="mb-2 text-xs font-semibold">{tr("인플루언서 추가", "Add Influencer", "เพิ่มอินฟลูเอนเซอร์")}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("이름 *", "Name *", "ชื่อ *")}</label>
                        <Input value={infForm.name} onChange={(e) => setInfForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="@username" className="mt-0.5 h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("팔로워", "Followers", "ผู้ติดตาม")}</label>
                        <Input value={infForm.followers} onChange={(e) => setInfForm((f) => ({ ...f, followers: e.target.value }))}
                          placeholder="181.4K" className="mt-0.5 h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("콘텐츠 주제", "Content Topic", "หัวข้อคอนเทนต์")}</label>
                        <Input value={infForm.contentTopic} onChange={(e) => setInfForm((f) => ({ ...f, contentTopic: e.target.value }))}
                          placeholder="Korean Food Review" className="mt-0.5 h-8 text-xs" />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground">{tr("고용 형태", "Hire Type", "รูปแบบการจ้าง")}</label>
                          <select value={infForm.hireType} onChange={(e) => setInfForm((f) => ({ ...f, hireType: e.target.value }))}
                            className="mt-0.5 flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs">
                            <option value="pay">{tr("유상", "Paid", "มีค่าใช้จ่าย")}</option>
                            <option value="free">{tr("무상", "Free", "ไม่มีค่าใช้จ่าย")}</option>
                          </select>
                        </div>
                        <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground">{tr("비용 (฿)", "Cost (฿)", "ค่าใช้จ่าย (฿)")}</label>
                          <Input type="number" min={0} value={infForm.budget}
                            onChange={(e) => setInfForm((f) => ({ ...f, budget: e.target.value }))}
                            className="mt-0.5 h-8 text-xs" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("촬영일", "Shoot Date", "วันที่ถ่ายทำ")}</label>
                        <Input type="date" value={infForm.shootingDate}
                          onChange={(e) => setInfForm((f) => ({ ...f, shootingDate: e.target.value }))}
                          className="mt-0.5 h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("게시일", "Publish Date", "วันที่เผยแพร่")}</label>
                        <Input type="date" value={infForm.publishDate}
                          onChange={(e) => setInfForm((f) => ({ ...f, publishDate: e.target.value }))}
                          className="mt-0.5 h-8 text-xs" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-muted-foreground">{tr("메모", "Note", "บันทึก")}</label>
                        <Input value={infForm.note} onChange={(e) => setInfForm((f) => ({ ...f, note: e.target.value }))}
                          placeholder={tr("연락처, 플랫폼 링크 등", "Contact info, platform links, etc.", "ข้อมูลติดต่อ ลิงก์แพลตฟอร์ม ฯลฯ")} className="mt-0.5 h-8 text-xs" />
                      </div>
                    </div>
                    <Button size="sm" className="mt-2 h-8 text-xs gap-1" onClick={handleAddInfluencer} disabled={savingInf}>
                      {savingInf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      {tr("추가", "Add", "เพิ่ม")}
                    </Button>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {tr("상세 관리는", "Detailed management is available on", "จัดการรายละเอียดได้ที่")}{" "}
                      <button type="button" className="underline text-primary"
                        onClick={() => router.push(`/admin/marketing/influencers?campaignId=${editingId}`)}>
                        {tr("인플루언서 페이지", "Influencer Page", "หน้าอินฟลูเอนเซอร์")}
                      </button>{tr("에서 할 수 있습니다.", " for detailed management.", " สำหรับจัดการรายละเอียด")}
                    </p>
                  </div>

                  {/* 목록 */}
                  {linkedInfluencers.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">{tr("등록된 인플루언서가 없습니다.", "No influencers.", "ไม่มีอินฟลูเอนเซอร์")}</p>
                  ) : (
                    <div className="space-y-2">
                      {linkedInfluencers.map((inf) => (
                        <div key={inf.id}
                          className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">{inf.name}</span>
                            {inf.followers && <span className="ml-2 text-xs text-muted-foreground">{inf.followers}</span>}
                            {inf.contentTopic && <span className="ml-2 text-xs text-muted-foreground">· {inf.contentTopic}</span>}
                            <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              {inf.budget > 0 && <span>฿{inf.budget.toLocaleString()}</span>}
                              {inf.publishDate && <span>{tr("게시", "Published", "เผยแพร่")}: {inf.publishDate}</span>}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive ml-2 shrink-0"
                            onClick={() => handleDeleteInfluencer(inf)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── 판촉물 탭 ─────────────────────────────────────────────── */}
              {activeTab === "materials" && (
                <div className="p-4 space-y-4">
                  {/* 빠른 등록 */}
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="mb-2 text-xs font-semibold">{tr("판촉물 추가", "Add Material", "เพิ่มสื่อโปรโมชัน")}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">{tr("종류", "Type", "ประเภท")}</label>
                        <select value={matForm.type} onChange={(e) => setMatForm((f) => ({ ...f, type: e.target.value }))}
                          className="mt-0.5 flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs">
                          {MATERIAL_TYPES.map((o) => <option key={o.value} value={o.value}>{materialTypeLabel(o.value)}</option>)}
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
                        <label className="text-[10px] text-muted-foreground">{tr("상태", "Status", "สถานะ")}</label>
                        <select value={matForm.status}
                          onChange={(e) => setMatForm((f) => ({ ...f, status: e.target.value }))}
                          className="mt-0.5 flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs">
                          {MATERIAL_STATUSES.map((o) => <option key={o.value} value={o.value}>{materialStatusLabel(o.value)}</option>)}
                        </select>
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
                              <span className="truncate">{store}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* 합계 미리보기 */}
                      {Number(matForm.quantity) > 0 && Number(matForm.unitCost) > 0 && (
                        <div className="sm:col-span-2 text-xs text-muted-foreground">
                          {tr("소계", "Subtotal", "ยอดรวมย่อย")}: {matForm.quantity}{tr("개", "", " ชิ้น")} × ฿{Number(matForm.unitCost).toLocaleString()} = <span className="font-semibold text-foreground">฿{(Number(matForm.quantity) * Number(matForm.unitCost)).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    <Button size="sm" className="mt-2 h-8 text-xs gap-1" onClick={handleAddMaterial} disabled={savingMat}>
                      {savingMat ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      {tr("추가", "Add", "เพิ่ม")}
                    </Button>
                  </div>

                  {/* 판촉물 목록 */}
                  {materials.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">{tr("등록된 판촉물이 없습니다.", "No materials.", "ไม่มีสื่อโปรโมชัน")}</p>
                  ) : (
                    <div className="space-y-2">
                      {/* 합계 */}
                      <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-1.5 text-xs font-medium">
                        <span>{tr("총", "Total", "รวม")} {materials.length}{tr("종", " types", " ประเภท")}</span>
                        <span>
                          {tr("합계", "Total", "รวม")}: ฿{materials.reduce((s, m) => s + m.quantity * m.unitCost, 0).toLocaleString()}
                        </span>
                      </div>
                      {materials.map((mat) => (
                        <div key={mat.id}
                          className="flex items-start justify-between rounded-lg border px-3 py-2 text-sm">
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
                                <span>฿{mat.unitCost.toLocaleString()} × {mat.quantity} = ฿{(mat.quantity * mat.unitCost).toLocaleString()}</span>
                              )}
                              {mat.branches.length > 0 && <span>{mat.branches.slice(0, 3).join(", ")}{mat.branches.length > 3 ? "..." : ""}</span>}
                              {mat.note && <span>{mat.note}</span>}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive ml-2 shrink-0"
                            onClick={() => handleDeleteMaterial(mat)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
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
          {/* ── 연결 메뉴 빠른 이동 ───────────────────────────────────────── */}
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-1 text-sm font-semibold">{tr("연결 메뉴", "Linked Menus", "เมนูที่เชื่อม")}</p>
            <p className="mb-3 text-xs text-muted-foreground">
              {tr(
                "행을 눌러 캠페인을 선택하면 아래 링크에 해당 캠페인이 반영됩니다.",
                "Tap a row to select a campaign; links below will include that campaign.",
                "แตะแถวเพื่อเลือกแคมเปญ ลิงก์ด้านล่างจะรวมแคมเปญนั้น"
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() =>
                  router.push(
                    listSelectedId
                      ? `/admin/marketing/promos?campaignId=${listSelectedId}`
                      : "/admin/marketing/promos"
                  )
                }
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {tr("프로모션 세트", "Promotion Sets", "ชุดโปรโมชัน")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() =>
                  router.push(
                    listSelectedId
                      ? `/admin/marketing/ads?campaignId=${listSelectedId}`
                      : "/admin/marketing/ads"
                  )
                }
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {tr("광고", "Ads", "โฆษณา")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() =>
                  router.push(
                    listSelectedId
                      ? `/admin/marketing/influencers?campaignId=${listSelectedId}`
                      : "/admin/marketing/influencers"
                  )
                }
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {tr("인플루언서", "Influencers", "อินฟลูเอนเซอร์")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-9 gap-1.5"
                onClick={() => void openMaterialsForSelectedCampaign()}
              >
                <Package className="h-3.5 w-3.5" />
                {tr("매장 홍보물(판촉물)", "Store promo materials", "สื่อโปรโมชันที่สาขา")}
              </Button>
            </div>
          </div>

          {/* ── 캠페인 목록 ─────────────────────────────────────────────────── */}
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold">{tr("캠페인 목록", "Campaign List", "รายการแคมเปญ")} ({list.length})</h3>
            </div>
            <div className="divide-y overflow-x-auto">
              {list.length === 0 && !loading && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">{tr("등록된 캠페인이 없습니다.", "No campaigns.", "ไม่มีแคมเปญ")}</p>
              )}
              {list.map((c) => (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setListSelectedId(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setListSelectedId(c.id)
                    }
                  }}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 px-4 py-3 cursor-pointer outline-none transition-colors hover:bg-muted/40",
                    editingId === c.id && "bg-primary/5",
                    listSelectedId === c.id && "bg-primary/10 ring-1 ring-inset ring-primary/20"
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
                      {c.branches?.length > 0 && <span>{c.branches.slice(0, 3).join(", ")}{c.branches.length > 3 ? ` +${c.branches.length - 3}` : ""}</span>}
                      {c.kpiTarget > 0 && <span>KPI: {c.kpiTarget.toLocaleString()} {kpiUnitLabel(c.kpiUnit)}</span>}
                      {c.budgetTotal > 0 && <span>{tr("예산", "Budget", "งบประมาณ")}: ฿{c.budgetTotal.toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => handleCopyCampaign(c)} title={tr("복사", "Copy", "คัดลอก")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(c)}>{tr("수정", "Edit", "แก้ไข")}</Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
          )}

        </div>
      </div>
    </div>
  )
}

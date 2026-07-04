export type ChannelState = {
  online: boolean
  hall: boolean
  takeout: boolean
  apps: string[]
}

export const dedupeNames = (values: string[]) =>
  Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)))

export const parseCampaignFormat = (raw: string): ChannelState => {
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

export const serializeCampaignFormat = (state: ChannelState) => {
  const parts: string[] = []
  if (state.online) {
    parts.push(state.apps.length > 0 ? `온라인(${state.apps.join(", ")})` : "온라인")
  }
  if (state.hall) parts.push("홀")
  if (state.takeout) parts.push("포장")
  return parts.join(" / ")
}

export const STATUS_OPTIONS = [
  { value: "draft", label: "준비" },
  { value: "ongoing", label: "진행중" },
  { value: "finish", label: "완료" },
]

export type CostFieldKey = "costAdsOnline" | "costAdsOffline" | "costProduction" | "costFood" | "costInfluencer" | "costOther"

export const COST_FIELD_OPTIONS: { key: CostFieldKey; labelKey: string }[] = [
  { key: "costAdsOnline", labelKey: "costAdsOnline" },
  { key: "costAdsOffline", labelKey: "costAdsOffline" },
  { key: "costProduction", labelKey: "costProduction" },
  { key: "costFood", labelKey: "costFood" },
  { key: "costInfluencer", labelKey: "costInfluencer" },
  { key: "costOther", labelKey: "costOther" },
]

export const buildCostFlags = (values: {
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

export const MATERIAL_STATUSES = [
  { value: "planning", label: "계획중" },
  { value: "producing", label: "제작중" },
  { value: "completed", label: "완료" },
  { value: "distributed", label: "배포완료" },
]

export const MATERIAL_STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-700",
  producing: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
  distributed: "bg-green-100 text-green-800",
}

export type CampaignPhaseFormRow = { label: string; startDate: string; endDate: string }

export const DEFAULT_DELIVERY_APPS = ["그랩", "라인맨", "쇼피", "기타"]

export const defaultForm = {
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

export const defaultMatForm = {
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

export const defaultGiftDraft = {
  storeName: "",
  giftName: "",
  allocatedQty: "",
  distributedQty: "",
  ruleNote: "",
}

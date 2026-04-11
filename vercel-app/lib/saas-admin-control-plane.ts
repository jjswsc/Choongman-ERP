export type BillingCycle = "monthly" | "yearly"
export type PlanTier = "starter" | "growth" | "enterprise"
export type TenantStatus = "trial" | "active" | "grace" | "suspended"
export type SupportTier = "standard" | "priority" | "dedicated"
export type SalesStage = "basic" | "payment" | "delivery" | "erp1" | "erp2" | "ai"

export type FeatureFlags = {
  pos: boolean
  kitchenDisplay: boolean
  inventory: boolean
  payroll: boolean
  accounting: boolean
  analytics: boolean
  marketing: boolean
  aiAssistant: boolean
  apiAccess: boolean
  sso: boolean
}

export type TenantPolicy = {
  salesStage: SalesStage
  autoSuspendOnOverdue: boolean
  allowOverage: boolean
  require2faAdmin: boolean
  requireIpAllowlist: boolean
  forceWeeklyBackup: boolean
  dataRetentionDays: number
  overdueGraceDays: number
  supportTier: SupportTier
}

export type TenantLimits = {
  maxStores: number
  maxManagerAccounts: number
  maxStaffAccounts: number
  maxTablets: number
  maxPosDevices: number
  maxApiKeys: number
  monthlyOrderQuota: number
}

export type TenantUsage = {
  stores: number
  managerAccounts: number
  staffAccounts: number
  tablets: number
  posDevices: number
  monthlyOrders: number
}

export type StagePrice = {
  monthly: number
  yearly: number
}

export type TenantPricing = {
  currency: string
  stagePrices: Record<SalesStage, StagePrice>
  currentChargeAmount: number
}

export type BillingEventItem = {
  id: number
  eventType: string
  amount: number
  currency: string
  status: string
  happenedAt: string
  memo: string
}

export type AuditLogItem = {
  id: number
  action: string
  actorName: string
  actorRole: string
  changedAt: string
  summary: string
}

export type TenantItem = {
  id: string
  companyName: string
  ownerName: string
  phone: string
  planTier: PlanTier
  billingCycle: BillingCycle
  status: TenantStatus
  nextBillingDate: string
  trialEndsAt: string
  timezone: string
  features: FeatureFlags
  limits: TenantLimits
  policy: TenantPolicy
  usage: TenantUsage
  pricing: TenantPricing
  billingHistory: BillingEventItem[]
  auditTrail: AuditLogItem[]
}

export const FEATURE_KEYS = [
  "pos",
  "kitchenDisplay",
  "inventory",
  "payroll",
  "accounting",
  "analytics",
  "marketing",
  "aiAssistant",
  "apiAccess",
  "sso",
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  pos: true,
  kitchenDisplay: true,
  inventory: false,
  payroll: false,
  accounting: false,
  analytics: true,
  marketing: false,
  aiAssistant: false,
  apiAccess: false,
  sso: false,
}

export const DEFAULT_LIMITS_BY_TIER: Record<PlanTier, TenantLimits> = {
  starter: {
    maxStores: 3,
    maxManagerAccounts: 8,
    maxStaffAccounts: 40,
    maxTablets: 4,
    maxPosDevices: 4,
    maxApiKeys: 1,
    monthlyOrderQuota: 20000,
  },
  growth: {
    maxStores: 10,
    maxManagerAccounts: 30,
    maxStaffAccounts: 120,
    maxTablets: 16,
    maxPosDevices: 14,
    maxApiKeys: 5,
    monthlyOrderQuota: 150000,
  },
  enterprise: {
    maxStores: 100,
    maxManagerAccounts: 200,
    maxStaffAccounts: 1200,
    maxTablets: 300,
    maxPosDevices: 200,
    maxApiKeys: 50,
    monthlyOrderQuota: 2000000,
  },
}

export const DEFAULT_POLICY: TenantPolicy = {
  salesStage: "basic",
  autoSuspendOnOverdue: true,
  allowOverage: false,
  require2faAdmin: false,
  requireIpAllowlist: false,
  forceWeeklyBackup: false,
  dataRetentionDays: 365,
  overdueGraceDays: 3,
  supportTier: "standard",
}

export const SALES_STAGE_LABEL: Record<SalesStage, string> = {
  basic: "기본",
  payment: "+ 결제 연동",
  delivery: "+ 배달 연동",
  erp1: "+ ERP 1차 기능",
  erp2: "+ ERP 2차 기능",
  ai: "+ AI 기능",
}

export const DEFAULT_STAGE_PRICES: Record<SalesStage, StagePrice> = {
  basic: { monthly: 3000, yearly: 30000 },
  payment: { monthly: 5000, yearly: 50000 },
  delivery: { monthly: 7000, yearly: 70000 },
  erp1: { monthly: 12000, yearly: 120000 },
  erp2: { monthly: 18000, yearly: 180000 },
  ai: { monthly: 25000, yearly: 250000 },
}

export function resolveCurrentChargeAmount(
  stage: SalesStage,
  cycle: BillingCycle,
  stagePrices: Record<SalesStage, StagePrice>
): number {
  const row = stagePrices[stage] || DEFAULT_STAGE_PRICES[stage]
  if (!row) return 0
  return cycle === "yearly" ? Number(row.yearly || 0) : Number(row.monthly || 0)
}

export const FALLBACK_TENANTS: TenantItem[] = [
  {
    id: "omni-001",
    companyName: "Bangkok Dakgalbi Co.",
    ownerName: "Kim Hana",
    phone: "+66-81-223-4401",
    planTier: "growth",
    billingCycle: "monthly",
    status: "active",
    nextBillingDate: "2026-05-01",
    trialEndsAt: "2026-04-20",
    timezone: "Asia/Bangkok",
    features: {
      pos: true,
      kitchenDisplay: true,
      inventory: true,
      payroll: true,
      accounting: true,
      analytics: true,
      marketing: false,
      aiAssistant: false,
      apiAccess: false,
      sso: false,
    },
    limits: DEFAULT_LIMITS_BY_TIER.growth,
    policy: {
      salesStage: "erp1",
      autoSuspendOnOverdue: true,
      allowOverage: false,
      require2faAdmin: true,
      requireIpAllowlist: false,
      forceWeeklyBackup: true,
      dataRetentionDays: 1095,
      overdueGraceDays: 7,
      supportTier: "priority",
    },
    usage: {
      stores: 5,
      managerAccounts: 14,
      staffAccounts: 82,
      tablets: 11,
      posDevices: 9,
      monthlyOrders: 56210,
    },
    pricing: {
      currency: "THB",
      stagePrices: { ...DEFAULT_STAGE_PRICES },
      currentChargeAmount: resolveCurrentChargeAmount("erp1", "monthly", DEFAULT_STAGE_PRICES),
    },
    billingHistory: [],
    auditTrail: [],
  },
]

export function applySalesStageFeatures(base: FeatureFlags, stage: SalesStage): FeatureFlags {
  const next = { ...base }
  // 기본: POS + 분석
  if (stage === "basic") {
    next.pos = true
    next.analytics = true
    return next
  }
  // 결제 연동 단계
  if (stage === "payment") {
    next.pos = true
    next.analytics = true
    next.accounting = true
    return next
  }
  // 배달 연동 단계
  if (stage === "delivery") {
    next.pos = true
    next.analytics = true
    next.accounting = true
    next.apiAccess = true
    next.kitchenDisplay = true
    return next
  }
  // ERP 1차
  if (stage === "erp1") {
    next.pos = true
    next.analytics = true
    next.accounting = true
    next.apiAccess = true
    next.kitchenDisplay = true
    next.inventory = true
    next.payroll = true
    return next
  }
  // ERP 2차
  if (stage === "erp2") {
    next.pos = true
    next.analytics = true
    next.accounting = true
    next.apiAccess = true
    next.kitchenDisplay = true
    next.inventory = true
    next.payroll = true
    next.marketing = true
    next.sso = true
    return next
  }
  // AI 단계
  next.pos = true
  next.analytics = true
  next.accounting = true
  next.apiAccess = true
  next.kitchenDisplay = true
  next.inventory = true
  next.payroll = true
  next.marketing = true
  next.sso = true
  next.aiAssistant = true
  return next
}

function ymdFromBangkok(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

function compareYmd(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function addDaysYmd(ymd: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd
  const dt = new Date(`${ymd}T00:00:00+07:00`)
  dt.setUTCDate(dt.getUTCDate() + days)
  const yyyy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function normalizeYmd(dateLike: unknown): string {
  const raw = String(dateLike || "").trim()
  if (!raw) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  return m?.[1] || ""
}

export function toBangkokStartIso(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  return `${ymd}T00:00:00+07:00`
}

export function resolveTenantStatus(params: {
  explicitStatus?: string | null
  trialEndYmd?: string
  nextBillingYmd?: string
  overdueGraceDays?: number
  autoSuspendOnOverdue?: boolean
  lastPaymentStatus?: string | null
  nowBangkokYmd?: string
}): TenantStatus {
  const nowYmd = params.nowBangkokYmd || ymdFromBangkok()
  const explicit = String(params.explicitStatus || "").trim().toLowerCase()
  if (explicit === "suspended" || explicit === "cancelled") return "suspended"
  if (explicit === "trial") {
    const trialEnd = normalizeYmd(params.trialEndYmd)
    if (trialEnd && compareYmd(nowYmd, trialEnd) <= 0) return "trial"
  }

  const nextBilling = normalizeYmd(params.nextBillingYmd)
  const trialEnd = normalizeYmd(params.trialEndYmd)
  const graceDays = Math.max(0, Math.floor(Number(params.overdueGraceDays || 0)))
  const autoSuspend = params.autoSuspendOnOverdue !== false
  const pay = String(params.lastPaymentStatus || "").toLowerCase()
  const hasOverduePayment = pay === "failed" || pay === "unpaid"

  if (trialEnd && compareYmd(nowYmd, trialEnd) <= 0) return "trial"
  if (nextBilling && compareYmd(nowYmd, nextBilling) <= 0 && !hasOverduePayment) return "active"
  if (nextBilling) {
    const graceEnd = addDaysYmd(nextBilling, graceDays)
    if (compareYmd(nowYmd, graceEnd) <= 0) return "grace"
    if (autoSuspend) return "suspended"
  }
  return "active"
}

export function getBangkokMonthStartYmd(date = new Date()): string {
  const ymd = ymdFromBangkok(date)
  return `${ymd.slice(0, 7)}-01`
}

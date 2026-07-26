"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  Clock3,
  Download,
  Plus,
  Search,
  ShieldAlert,
  ShoppingCart,
  Users,
} from "lucide-react"
import { appAlert } from "@/lib/app-message"
import { apiFetch } from "@/lib/api/fetch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  applySalesStageFeatures,
  DEFAULT_POLICY,
  DEFAULT_STAGE_PRICES,
  resolveCurrentChargeAmount,
  type BillingCycle,
  type PlanTier,
  type SalesStage,
  type SupportTier,
  type TenantItem,
} from "@/lib/saas-admin-control-plane"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SaasModulePricingPanel } from "@/components/saas/saas-module-pricing-panel"
import { SaasBillingCompanyFields } from "@/components/saas/saas-billing-company-fields"
import { SaasCustomerLoginInfoPanel } from "@/components/saas/saas-customer-login-info-panel"
import { SaasCustomerTabletsPanel } from "@/components/saas/saas-customer-tablets-panel"
import { useSaasCustomerLoginAccounts } from "@/hooks/use-saas-customer-login-accounts"
import { Textarea } from "@/components/ui/textarea"
import { isSaasPlatformInternalTenant } from "@/lib/saas-platform-internal-tenant"
import { emptySaasBillingCompanyInfo } from "@/lib/saas-billing-company-profile"
import { useSaasScope } from "@/components/saas/saas-scope-context"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import {
  SAAS_ADMIN_FEATURE_KEYS,
  SAAS_ADMIN_SALES_STAGES,
  saasAdminDateLocale,
  saasAdminStageLabel,
  saasAdminStatusLabel,
} from "@/lib/i18n-saas-admin"
import {
  cloneDefaultModulePrices,
  normalizeModulePrices,
  SAAS_MODULE_LABEL_KEY,
  syncModuleEnabledFromFeatures,
} from "@/lib/saas-module-pricing"
import {
  buildModuleInvoiceCsv,
  buildModuleInvoiceHtml,
  moduleBillingLimitsFromTenant,
  resolveEffectiveChargeWithLimits,
} from "@/lib/saas-module-billing"
import { createNewTenantDraft } from "@/lib/saas-tenant-draft"
import { fetchGlobalModulePrices } from "@/lib/saas-module-catalog-client"

const STATUS_VARIANT = {
  trial: "secondary",
  active: "default",
  grace: "outline",
  suspended: "destructive",
} as const

const DETAIL_TAB_TRIGGER_CN =
  "rounded-md border border-transparent px-3 py-2 text-xs sm:text-sm data-[state=active]:border-primary/30 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"

function StatCard(props: {
  label: string
  value: ReactNode
  icon: ComponentType<{ className?: string }>
  tone: "slate" | "emerald" | "amber" | "rose" | "orange" | "sky"
}) {
  const Icon = props.icon
  const tone = {
    slate: "border-slate-200/80 bg-gradient-to-br from-slate-50 to-white text-slate-700 dark:from-slate-900/40 dark:to-card",
    emerald:
      "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white text-emerald-800 dark:from-emerald-950/30 dark:to-card dark:text-emerald-200",
    amber:
      "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white text-amber-900 dark:from-amber-950/30 dark:to-card dark:text-amber-100",
    rose: "border-rose-200/70 bg-gradient-to-br from-rose-50 to-white text-rose-800 dark:from-rose-950/30 dark:to-card dark:text-rose-200",
    orange:
      "border-orange-200/70 bg-gradient-to-br from-orange-50 to-white text-orange-900 dark:from-orange-950/30 dark:to-card dark:text-orange-100",
    sky: "border-sky-200/70 bg-gradient-to-br from-sky-50 to-white text-sky-900 dark:from-sky-950/30 dark:to-card dark:text-sky-100",
  }[props.tone]
  const iconTone = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  }[props.tone]

  return (
    <Card className={cn("overflow-hidden border shadow-sm", tone)}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{props.label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{props.value}</p>
        </div>
        <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", iconTone)}>
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  )
}

const CUSTOMER_DETAIL_TABS = [
  "plan",
  "company",
  "login",
  "limits",
  "tablets",
  "usage",
  "billing",
  "audit",
] as const

function onboardingHref(tenantId: string): string {
  const p = new URLSearchParams()
  p.set("tenant", tenantId)
  return `/saas-admin/onboarding?${p.toString()}`
}

type CustomerDetailTab = (typeof CUSTOMER_DETAIL_TABS)[number]

function isCustomerDetailTab(value: string | null): value is CustomerDetailTab {
  return CUSTOMER_DETAIL_TABS.includes(value as CustomerDetailTab)
}

function limitProgress(current: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(100, Math.round((current / max) * 100))
}

function UsageBar({ current, max }: { current: number; max: number }) {
  const pct = limitProgress(current, max)
  const tone = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-muted">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {current.toLocaleString()} / {max.toLocaleString()} ({pct}%)
      </p>
    </div>
  )
}

function formatBangkokDateTime(value: string, locale: string): string {
  const text = String(value || "").trim()
  if (!text) return "-"
  const dt = new Date(text)
  if (Number.isNaN(dt.getTime())) return text
  return dt.toLocaleString(locale, { timeZone: "Asia/Bangkok", hour12: false })
}

function usageRatio(current: number, max: number): number {
  if (max <= 0) return 0
  return current / max
}

function tenantRiskCount(tenant: TenantItem): number {
  const checks = [
    usageRatio(tenant.usage.stores, tenant.limits.maxStores),
    usageRatio(tenant.usage.managerAccounts, tenant.limits.maxManagerAccounts),
    usageRatio(tenant.usage.staffAccounts, tenant.limits.maxStaffAccounts),
    usageRatio(tenant.usage.tablets, tenant.limits.maxTablets),
    usageRatio(tenant.usage.posDevices, tenant.limits.maxPosDevices),
    usageRatio(tenant.usage.monthlyOrders, tenant.limits.monthlyOrderQuota),
  ]
  return checks.filter((x) => x >= 0.9).length
}

function bangkokYmd(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

function parseYmd(ymd: string): Date | null {
  const x = String(ymd || "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) return null
  return new Date(`${x}T00:00:00+07:00`)
}

function diffDaysFromTodayBangkok(ymd: string): number | null {
  const target = parseYmd(ymd)
  const today = parseYmd(bangkokYmd())
  if (!target || !today) return null
  const ms = target.getTime() - today.getTime()
  return Math.floor(ms / 86_400_000)
}

type AuditPeriodFilter = "all" | "today" | "7d" | "30d"
type JoinPeriodFilter = "all" | "today" | "7d" | "30d" | "90d" | "this_month" | "this_year" | "custom"

function matchesAuditPeriod(changedAt: string, period: AuditPeriodFilter): boolean {
  if (period === "all") return true
  const dt = new Date(String(changedAt || "").trim())
  if (Number.isNaN(dt.getTime())) return false
  const eventYmd = dt.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  const eventDate = parseYmd(eventYmd)
  const today = parseYmd(bangkokYmd())
  if (!eventDate || !today) return false
  const days = Math.floor((today.getTime() - eventDate.getTime()) / 86_400_000)
  if (days < 0) return false
  if (period === "today") return days === 0
  if (period === "7d") return days < 7
  return days < 30
}

function createdAtYmdBangkok(createdAt: string | null | undefined): string | null {
  const raw = String(createdAt || "").trim()
  if (!raw) return null
  const dt = new Date(raw)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

function matchesJoinPeriod(
  createdAt: string | null | undefined,
  period: JoinPeriodFilter,
  range?: { fromYmd?: string; toYmd?: string }
): boolean {
  if (period === "all") return true
  const eventYmd = createdAtYmdBangkok(createdAt)
  if (!eventYmd) return false
  const eventDate = parseYmd(eventYmd)
  const today = parseYmd(bangkokYmd())
  if (!eventDate || !today) return false

  if (period === "custom") {
    let from = String(range?.fromYmd || "").trim()
    let to = String(range?.toYmd || "").trim()
    if (!from && !to) return true
    if (from && to && from > to) {
      const tmp = from
      from = to
      to = tmp
    }
    if (from && eventYmd < from) return false
    if (to && eventYmd > to) return false
    return true
  }

  const days = Math.floor((today.getTime() - eventDate.getTime()) / 86_400_000)
  if (days < 0) return false
  if (period === "today") return days === 0
  if (period === "7d") return days < 7
  if (period === "30d") return days < 30
  if (period === "90d") return days < 90
  if (period === "this_month") {
    return eventYmd.slice(0, 7) === bangkokYmd().slice(0, 7)
  }
  return eventYmd.slice(0, 4) === bangkokYmd().slice(0, 4)
}

function normalizeTenantRows(rows: TenantItem[]): TenantItem[] {
  return rows.map((row) => {
    const pricingMode = row.policy?.pricingMode ?? row.pricing?.pricingMode ?? "stage"
    const modulePrices = normalizeModulePrices(row.pricing?.modulePrices)
    const stageAmount = resolveCurrentChargeAmount(
      row.policy?.salesStage || "basic",
      row.billingCycle || "monthly",
      row.pricing?.stagePrices || DEFAULT_STAGE_PRICES
    )
    return {
      ...row,
      billingCompany: {
        ...emptySaasBillingCompanyInfo(),
        ...row.billingCompany,
      },
      policy: {
        ...DEFAULT_POLICY,
        ...row.policy,
        salesStage: row.policy?.salesStage || "basic",
        pricingMode,
      },
      pricing: {
        currency: row.pricing?.currency || "THB",
        pricingMode,
        stagePrices: row.pricing?.stagePrices || { ...DEFAULT_STAGE_PRICES },
        modulePrices,
        currentChargeAmount: resolveEffectiveChargeWithLimits({
          pricingMode,
          billingCycle: row.billingCycle || "monthly",
          stageAmount,
          modulePrices,
          usage: row.usage,
          limits: moduleBillingLimitsFromTenant({
            id: row.id,
            limits: row.limits,
            policy: { ...DEFAULT_POLICY, ...row.policy, pricingMode },
            usage: row.usage,
          }),
        }),
      },
      billingHistory: Array.isArray(row.billingHistory) ? row.billingHistory : [],
      auditTrail: Array.isArray(row.auditTrail) ? row.auditTrail : [],
    }
  })
}

function getExpiryInfo(
  tenant: TenantItem,
  t: (k: string) => string
): { text: string; variant: "destructive" | "outline" | "secondary" } | null {
  const base = tenant.status === "trial" ? tenant.trialEndsAt : tenant.nextBillingDate
  const d = diffDaysFromTodayBangkok(base)
  if (d == null) return null
  if (d < 0) return { text: tr(t, "saasAdminCust_expiryPast", { n: String(Math.abs(d)) }), variant: "destructive" }
  if (d === 0) return { text: t("saasAdminCust_expiryToday"), variant: "destructive" }
  if (d <= 3) return { text: tr(t, "saasAdminCust_expiryDaysLeft", { n: String(d) }), variant: "outline" }
  if (d <= 7) return { text: tr(t, "saasAdminCust_expiryDaysLeft", { n: String(d) }), variant: "secondary" }
  return null
}

function escapeCsv(value: unknown): string {
  const s = String(value ?? "")
  if (!/[",\n]/.test(s)) return s
  return `"${s.replace(/"/g, '""')}"`
}

function tenantPricingModeLabel(tenant: TenantItem, t: (k: string) => string): string {
  const mode = tenant.policy.pricingMode ?? tenant.pricing.pricingMode ?? "stage"
  return mode === "module" ? t("saasAdminCust_pricingModeModule") : t("saasAdminCust_pricingModeStage")
}

function recalcTenantPricing(tenant: TenantItem, pricingPatch: Partial<TenantItem["pricing"]>): TenantItem["pricing"] {
  const pricingMode = tenant.policy.pricingMode ?? tenant.pricing.pricingMode ?? "stage"
  const stagePrices = pricingPatch.stagePrices ?? tenant.pricing.stagePrices
  const modulePrices = normalizeModulePrices(pricingPatch.modulePrices ?? tenant.pricing.modulePrices)
  const stageAmount = resolveCurrentChargeAmount(tenant.policy.salesStage, tenant.billingCycle, stagePrices)
  return {
    ...tenant.pricing,
    ...pricingPatch,
    stagePrices,
    modulePrices,
    pricingMode,
    currentChargeAmount: resolveEffectiveChargeWithLimits({
      pricingMode,
      billingCycle: tenant.billingCycle,
      stageAmount,
      modulePrices,
      usage: tenant.usage,
      limits: moduleBillingLimitsFromTenant(tenant),
    }),
  }
}

export default function SaasCustomersPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const scope = useSaasScope()
  const router = useRouter()
  const searchParams = useSearchParams()
  const dateLocale = saasAdminDateLocale(lang)
  const [tenants, setTenants] = useState<TenantItem[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadNotice, setLoadNotice] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [searchApplied, setSearchApplied] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | TenantItem["status"]>("all")
  const [openCreate, setOpenCreate] = useState(false)
  const [invoiceEmailOpen, setInvoiceEmailOpen] = useState(false)
  const [invoiceEmail, setInvoiceEmail] = useState("")
  const [invoiceNote, setInvoiceNote] = useState("")
  const [invoiceSending, setInvoiceSending] = useState(false)
  const [newTenantId, setNewTenantId] = useState("")
  const [newTenantName, setNewTenantName] = useState("")
  const [newOwnerName, setNewOwnerName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [expiryOnly, setExpiryOnly] = useState(false)
  const [joinPeriod, setJoinPeriod] = useState<JoinPeriodFilter>("all")
  const [joinFromYmd, setJoinFromYmd] = useState("")
  const [joinToYmd, setJoinToYmd] = useState("")
  const [partnerFilter, setPartnerFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<"default" | "risk_desc" | "expiry_soon">("default")
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkPendingStatus, setBulkPendingStatus] = useState<TenantItem["status"] | null>(null)

  const [auditFilter, setAuditFilter] = useState<"all" | "employee_only">("all")
  const [auditActorQuery, setAuditActorQuery] = useState("")
  const [auditPeriod, setAuditPeriod] = useState<AuditPeriodFilter>("all")
  const [detailTab, setDetailTab] = useState<CustomerDetailTab>("plan")
  const [showPlatformInternal, setShowPlatformInternal] = useState(false)
  const [partnerOptions, setPartnerOptions] = useState<Array<{ id: string; name: string }>>([])

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0] ?? null,
    [selectedTenantId, tenants]
  )

  const { loginHref: selectedTenantLoginHref } = useSaasCustomerLoginAccounts(
    selectedTenant?.id,
    selectedTenant?.companyName ?? ""
  )

  const billableTenants = useMemo(
    () => tenants.filter((tenant) => !isSaasPlatformInternalTenant(tenant)),
    [tenants]
  )

  const filteredTenants = useMemo(() => {
    const keyword = searchApplied.trim().toLowerCase()
    const rows = tenants.filter((tenant) => {
      if (!scope.isPlatform && isSaasPlatformInternalTenant(tenant)) return false
      if (scope.isPlatform && !showPlatformInternal && isSaasPlatformInternalTenant(tenant)) return false
      if (statusFilter !== "all" && tenant.status !== statusFilter) return false
      if (!matchesJoinPeriod(tenant.createdAt, joinPeriod, { fromYmd: joinFromYmd, toYmd: joinToYmd })) return false
      if (scope.isPlatform && partnerFilter !== "all") {
        if (partnerFilter === "__direct__" && tenant.partnerId) return false
        if (partnerFilter !== "__direct__" && tenant.partnerId !== partnerFilter) return false
      }
      if (!keyword) return true
      const bundle =
        `${tenant.id} ${tenant.companyName} ${tenant.ownerName} ${tenant.phone} ${tenant.billingCompany?.legalName || ""} ${tenant.billingCompany?.taxId || ""}`.toLowerCase()
      return bundle.includes(keyword)
    })
    const withExpiry = expiryOnly ? rows.filter((x) => getExpiryInfo(x, t) != null) : rows
    if (sortBy === "risk_desc") {
      return [...withExpiry].sort((a, b) => tenantRiskCount(b) - tenantRiskCount(a))
    }
    if (sortBy === "expiry_soon") {
      return [...withExpiry].sort((a, b) => {
        const da = diffDaysFromTodayBangkok(a.status === "trial" ? a.trialEndsAt : a.nextBillingDate)
        const db = diffDaysFromTodayBangkok(b.status === "trial" ? b.trialEndsAt : b.nextBillingDate)
        const va = da == null ? Number.POSITIVE_INFINITY : da
        const vb = db == null ? Number.POSITIVE_INFINITY : db
        return va - vb
      })
    }
    return withExpiry
  }, [
    expiryOnly,
    joinFromYmd,
    joinPeriod,
    joinToYmd,
    partnerFilter,
    scope.isPlatform,
    searchApplied,
    showPlatformInternal,
    sortBy,
    statusFilter,
    t,
    tenants,
  ])

  const applySearch = () => {
    setSearchApplied(searchInput.trim())
  }

  const stats = useMemo(() => {
    const active = billableTenants.filter((x) => x.status === "active").length
    const trial = billableTenants.filter((x) => x.status === "trial").length
    const grace = billableTenants.filter((x) => x.status === "grace").length
    const suspended = billableTenants.filter((x) => x.status === "suspended").length
    const highRisk = billableTenants.filter((x) => tenantRiskCount(x) > 0).length
    const totalOrders = billableTenants.reduce((acc, x) => acc + x.usage.monthlyOrders, 0)
    return { active, trial, grace, suspended, highRisk, totalOrders, totalCustomers: billableTenants.length }
  }, [billableTenants])

  const filteredAuditTrail = useMemo(() => {
    const rows = selectedTenant?.auditTrail || []
    const base =
      auditFilter === "employee_only"
        ? rows.filter((row) => String(row.action || "").trim().toLowerCase() === "employee.updated")
        : rows
    const byPeriod = base.filter((row) => matchesAuditPeriod(String(row.changedAt || ""), auditPeriod))
    const q = auditActorQuery.trim().toLowerCase()
    if (!q) return byPeriod
    return byPeriod.filter((row) => {
      const actor = `${row.actorName || ""} ${row.actorRole || ""}`.toLowerCase()
      return actor.includes(q)
    })
  }, [auditActorQuery, auditFilter, auditPeriod, selectedTenant?.auditTrail])

  const updateTenant = (updater: (tenant: TenantItem) => TenantItem) => {
    if (!selectedTenant) return
    setTenants((prev) => prev.map((tenant) => (tenant.id === selectedTenant.id ? updater(tenant) : tenant)))
  }

  const loadTenants = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/getSaasTenantSettings")
      const json = (await res.json()) as { success?: boolean; fallback?: boolean; message?: string; tenants?: TenantItem[] }
      if (!res.ok || json.success !== true || !Array.isArray(json.tenants)) {
        throw new Error(json.message || t("saasAdminCust_errLoadSettings"))
      }
      const rows = normalizeTenantRows(json.tenants)
      if (rows.length > 0) {
        setTenants(rows)
        setSelectedTenantId((prev) => {
          if (rows.some((item) => item.id === prev)) return prev
          return rows[0]!.id
        })
      } else {
        setTenants([])
      }
      setLoadNotice(json.fallback ? json.message || t("saasAdminCust_sampleData") : "")
    } catch (error) {
      const msg = String(error)
      setLoadNotice(tr(t, "saasAdminCust_loadFailed", { msg }))
      setTenants([])
      setSelectedTenantId("")
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadTenants()
  }, [loadTenants])

  useEffect(() => {
    if (!scope.isPlatform) return
    void (async () => {
      try {
        const res = await apiFetch("/api/saasAdminPartners")
        const json = (await res.json()) as { success?: boolean; partners?: Array<{ id: string; name: string }> }
        if (res.ok && json.success === true && Array.isArray(json.partners)) {
          setPartnerOptions(json.partners.map((p) => ({ id: p.id, name: p.name })))
        }
      } catch {
        setPartnerOptions([])
      }
    })()
  }, [scope.isPlatform])

  useEffect(() => {
    const tenant = searchParams.get("tenant")?.trim()
    const tab = searchParams.get("tab")
    if (tenant) setSelectedTenantId(tenant)

    if (tab === "bootstrap" || tab === "integrations") {
      const href = tenant ? onboardingHref(tenant) : "/saas-admin/onboarding"
      router.replace(href)
      return
    }
    if (tab === "policy") {
      setDetailTab("plan")
      if (tenant) {
        router.replace(`/saas-admin/customers?tenant=${encodeURIComponent(tenant)}&tab=plan`, { scroll: false })
      }
      return
    }
    if (isCustomerDetailTab(tab)) setDetailTab(tab)
  }, [router, searchParams, selectedTenantId])

  const syncCustomersUrl = useCallback(
    (patch: { tenantId?: string; tab?: CustomerDetailTab; created?: boolean }) => {
      const p = new URLSearchParams(searchParams.toString())
      const tenantId = patch.tenantId ?? selectedTenantId
      const tab = patch.tab ?? detailTab
      if (tenantId) p.set("tenant", tenantId)
      else p.delete("tenant")
      p.set("tab", tab)
      if (patch.created) p.set("created", "1")
      else p.delete("created")
      router.replace(`/saas-admin/customers?${p.toString()}`, { scroll: false })
    },
    [detailTab, router, searchParams, selectedTenantId]
  )

  const onDetailTabChange = (value: string) => {
    if (!isCustomerDetailTab(value)) return
    setDetailTab(value)
    syncCustomersUrl({ tab: value })
  }

  useEffect(() => {
    if (filteredTenants.some((x) => x.id === selectedTenantId)) return
    if (filteredTenants.length > 0) {
      setSelectedTenantId(filteredTenants[0]!.id)
    }
  }, [filteredTenants, selectedTenantId])

  useEffect(() => {
    setAuditFilter("all")
    setAuditPeriod("all")
    setAuditActorQuery("")
  }, [selectedTenantId])

  useEffect(() => {
    const allowed = new Set(filteredTenants.map((x) => x.id))
    setSelectedIds((prev) => prev.filter((id) => allowed.has(id)))
  }, [filteredTenants])

  const persistTenant = async (tenant: TenantItem) => {
    const res = await apiFetch("/api/saveSaasTenantSettings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant }),
    })
    const json = (await res.json()) as { success?: boolean; message?: string }
    if (!res.ok || json.success !== true) {
      throw new Error(json.message || t("saasAdminCust_errSave"))
    }
  }

  const saveTenantSettings = async () => {
    if (!selectedTenant) return
    setSaving(true)
    try {
      await persistTenant(selectedTenant)
      await appAlert(tr(t, "saasAdminCust_saved", { name: selectedTenant.companyName }))
      await loadTenants()
    } catch (error) {
      await appAlert(tr(t, "saasAdminCust_saveFailed", { msg: String(error) }))
    } finally {
      setSaving(false)
    }
  }

  const createTenant = async () => {
    const id = newTenantId.trim().toLowerCase()
    const name = newTenantName.trim()
    if (!id || !name) {
      await appAlert(t("saasAdminCust_errRequiredIdName"))
      return
    }
    if (!/^[a-z0-9_-]{3,40}$/.test(id)) {
      await appAlert(t("saasAdminCust_errIdFormat"))
      return
    }
    if (tenants.some((x) => x.id === id)) {
      await appAlert(t("saasAdminCust_errIdExists"))
      return
    }
    const catalog = (await fetchGlobalModulePrices()) ?? cloneDefaultModulePrices()
    const draft = createNewTenantDraft({
      id,
      companyName: name,
      ownerName: newOwnerName,
      phone: newPhone,
      catalog,
      partnerMarginPct: scope.isPartner ? scope.defaultMarginPct : 0,
    })

    setLoading(true)
    try {
      await persistTenant(draft)
      await appAlert(tr(t, "saasAdminCust_created", { name: draft.companyName }))
      setOpenCreate(false)
      setNewTenantId("")
      setNewTenantName("")
      setNewOwnerName("")
      setNewPhone("")
      await loadTenants()
      router.push(onboardingHref(id))
    } catch (error) {
      await appAlert(tr(t, "saasAdminCust_createFailed", { msg: String(error) }))
    } finally {
      setLoading(false)
    }
  }

  const toggleTenantSelection = (tenantId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(tenantId) ? prev : [...prev, tenantId]
      return prev.filter((id) => id !== tenantId)
    })
  }

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredTenants.map((x) => x.id))
      return
    }
    setSelectedIds([])
  }

  const requestBulkUpdateStatus = async (status: TenantItem["status"]) => {
    const targets = tenants.filter((x) => selectedIds.includes(x.id))
    if (targets.length === 0) {
      await appAlert(t("saasAdminCust_selectBulkFirst"))
      return
    }
    setBulkPendingStatus(status)
    setBulkConfirmOpen(true)
  }

  const bulkUpdateStatus = async () => {
    const status = bulkPendingStatus
    if (!status) return
    const targets = tenants.filter((x) => selectedIds.includes(x.id))
    if (targets.length === 0) {
      setBulkConfirmOpen(false)
      setBulkPendingStatus(null)
      return
    }
    setLoading(true)
    try {
      for (const tenant of targets) {
        await persistTenant({ ...tenant, status })
      }
      await appAlert(
        tr(t, "saasAdminCust_bulkStatusDone", {
          n: String(targets.length),
          status: saasAdminStatusLabel(status, t),
        })
      )
      await loadTenants()
    } catch (error) {
      await appAlert(tr(t, "saasAdminCust_bulkStatusFailed", { msg: String(error) }))
    } finally {
      setLoading(false)
      setBulkConfirmOpen(false)
      setBulkPendingStatus(null)
    }
  }

  const exportCsv = () => {
    const headers = [
      "tenant_id",
      "company_name",
      "owner_name",
      "phone",
      "legal_name",
      "tax_id",
      "billing_email",
      "status",
      "plan_tier",
      "billing_cycle",
      "next_billing_date",
      "trial_ends_at",
      "max_stores",
      "max_staff_accounts",
      "max_tablets",
      "max_pos_devices",
      "monthly_order_quota",
      "used_stores",
      "used_staff_accounts",
      "used_tablets",
      "used_pos_devices",
      "used_monthly_orders",
      "risk_count",
    ]
    const lines = [headers.join(",")]
    for (const row of filteredTenants) {
      lines.push(
        [
          row.id,
          row.companyName,
          row.ownerName,
          row.phone,
          row.billingCompany?.legalName || "",
          row.billingCompany?.taxId || "",
          row.billingCompany?.billingEmail || "",
          row.status,
          row.planTier,
          row.billingCycle,
          row.nextBillingDate,
          row.trialEndsAt,
          row.limits.maxStores,
          row.limits.maxStaffAccounts,
          row.limits.maxTablets,
          row.limits.maxPosDevices,
          row.limits.monthlyOrderQuota,
          row.usage.stores,
          row.usage.staffAccounts,
          row.usage.tablets,
          row.usage.posDevices,
          row.usage.monthlyOrders,
          tenantRiskCount(row),
        ]
          .map((v) => escapeCsv(v))
          .join(",")
      )
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `saas_customers_${bangkokYmd()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const exportTenantJson = async () => {
    if (!selectedTenant) return
    try {
      const res = await apiFetch(
        `/api/saasAdminTenantExport?tenantId=${encodeURIComponent(selectedTenant.id)}&download=1`
      )
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success === false) {
        await appAlert(json.message || t("saasAdminCust_exportTenantFailed"))
        return
      }
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `tenant-export-${selectedTenant.id}_${bangkokYmd()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const moduleInvoiceLabels = (): Record<string, string> =>
    Object.fromEntries(Object.values(SAAS_MODULE_LABEL_KEY).map((key) => [key, t(key)]))

  const exportModuleInvoiceCsv = () => {
    const csv = buildModuleInvoiceCsv(selectedTenant, moduleInvoiceLabels())
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `saas_invoice_${selectedTenant.id}_${bangkokYmd()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printModuleInvoice = () => {
    const html = buildModuleInvoiceHtml(selectedTenant, moduleInvoiceLabels())
    const w = window.open("", "_blank", "noopener,noreferrer")
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  const sendModuleInvoiceEmail = async () => {
    const email = invoiceEmail.trim()
    if (!email) {
      await appAlert(t("saasAdminCust_invoiceEmailRequired"))
      return
    }
    setInvoiceSending(true)
    try {
      const res = await apiFetch("/api/saasAdminModuleInvoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant: selectedTenant,
          tenantId: selectedTenant.id,
          email,
          note: invoiceNote.trim() || undefined,
          lang,
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminCust_invoiceEmailFailed"))
        return
      }
      await appAlert(t("saasAdminCust_invoiceEmailSent"))
      setInvoiceEmailOpen(false)
      setInvoiceEmail("")
      setInvoiceNote("")
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setInvoiceSending(false)
    }
  }

  const exportAuditCsv = () => {
    const headers = [
      "tenant_id",
      "company_name",
      "employee_id",
      "changed_at_bangkok",
      "action",
      "actor_name",
      "actor_role",
      "summary",
    ]
    const lines = [headers.join(",")]
    for (const row of filteredAuditTrail) {
      lines.push(
        [
          selectedTenant.id,
          selectedTenant.companyName,
          row.employeeId || "",
          formatBangkokDateTime(row.changedAt, dateLocale),
          row.action,
          row.actorName,
          row.actorRole,
          row.summary || "",
        ]
          .map((v) => escapeCsv(v))
          .join(",")
      )
    }
    const safeTenant = String(selectedTenant.id || "tenant").replace(/[^a-z0-9_-]/gi, "_")
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `saas_audit_${safeTenant}_${bangkokYmd()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const setTenantStatus = (status: TenantItem["status"]) => {
    updateTenant((tenant) => ({ ...tenant, status }))
  }

  const employeeAuditLink = (employeeId: number): string => {
    const p = new URLSearchParams()
    if (selectedTenant?.companyName) p.set("company", selectedTenant.companyName)
    p.set("employeeId", String(employeeId))
    return `/admin/employees?${p.toString()}`
  }

  return (
    <main className="space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border bg-gradient-to-br from-slate-50 via-white to-sky-50/60 p-5 shadow-sm dark:from-slate-950/40 dark:via-card dark:to-sky-950/20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700/80 dark:text-sky-300/80">
            SaaS Control
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("saasAdminCust_pageTitle")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("saasAdminCust_pageIntro")}</p>
          {loadNotice ? <p className="mt-2 text-xs text-amber-600">{loadNotice}</p> : null}
        </div>
        <Button
          type="button"
          className="shadow-sm shadow-primary/20"
          onClick={() => setOpenCreate(true)}
          disabled={loading}
        >
          <Plus className="size-4" />
          {t("saasAdminCust_addTenant")}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label={t("saasAdminCust_statTotal")}
          value={loading ? "…" : stats.totalCustomers}
          icon={Users}
          tone="slate"
        />
        <StatCard
          label={t("saasAdminCust_statActiveTrial")}
          value={loading ? "…" : stats.active + stats.trial}
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          label={t("saasAdminCust_statGrace")}
          value={loading ? "…" : stats.grace}
          icon={Clock3}
          tone="amber"
        />
        <StatCard
          label={t("saasAdminCust_statSuspended")}
          value={loading ? "…" : stats.suspended}
          icon={Ban}
          tone="rose"
        />
        <StatCard
          label={t("saasAdminCust_statHighRisk")}
          value={loading ? "…" : stats.highRisk}
          icon={ShieldAlert}
          tone="orange"
        />
        <StatCard
          label={t("saasAdminCust_statMonthlyOrders")}
          value={loading ? "…" : stats.totalOrders.toLocaleString()}
          icon={ShoppingCart}
          tone="sky"
        />
      </div>

      <Card className="border-slate-200/80 shadow-sm dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("saasAdminCust_searchLabel")}</CardTitle>
          <CardDescription>{t("saasAdminCust_searchPh")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="space-y-2">
          <Label>{t("saasAdminCust_searchLabel")}</Label>
          <div className="flex gap-2">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applySearch()
              }}
              placeholder={t("saasAdminCust_searchPh")}
              className="min-w-0 flex-1 bg-background"
            />
            <Button
              type="button"
              onClick={applySearch}
              disabled={loading}
              className="shrink-0 bg-sky-600 text-white shadow-sm shadow-sky-600/25 hover:bg-sky-700"
            >
              <Search className="size-4" />
              {t("search")}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("saasAdminCust_statusFilter")}</Label>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | TenantItem["status"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="active">{saasAdminStatusLabel("active", t)}</SelectItem>
              <SelectItem value="trial">{saasAdminStatusLabel("trial", t)}</SelectItem>
              <SelectItem value="grace">{saasAdminStatusLabel("grace", t)}</SelectItem>
              <SelectItem value="suspended">{saasAdminStatusLabel("suspended", t)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("saasAdminCust_joinPeriodFilter")}</Label>
          <Select
            value={joinPeriod}
            onValueChange={(value) => {
              const next = value as JoinPeriodFilter
              setJoinPeriod(next)
              if (next !== "custom") {
                setJoinFromYmd("")
                setJoinToYmd("")
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="today">{t("saasAdminCust_joinPeriodToday")}</SelectItem>
              <SelectItem value="7d">{t("saasAdminCust_joinPeriod7d")}</SelectItem>
              <SelectItem value="30d">{t("saasAdminCust_joinPeriod30d")}</SelectItem>
              <SelectItem value="90d">{t("saasAdminCust_joinPeriod90d")}</SelectItem>
              <SelectItem value="this_month">{t("saasAdminCust_joinPeriodThisMonth")}</SelectItem>
              <SelectItem value="this_year">{t("saasAdminCust_joinPeriodThisYear")}</SelectItem>
              <SelectItem value="custom">{t("saasAdminCust_joinPeriodCustom")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {joinPeriod === "custom" ? (
          <div className="space-y-2 md:col-span-2 xl:col-span-2">
            <Label>{t("saasAdminCust_joinPeriodCustomRange")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={joinFromYmd}
                onChange={(event) => setJoinFromYmd(event.target.value)}
                className="min-w-[9.5rem] flex-1"
                aria-label={t("saasAdminCust_joinPeriodFrom")}
              />
              <span className="text-sm text-muted-foreground shrink-0">~</span>
              <Input
                type="date"
                value={joinToYmd}
                onChange={(event) => setJoinToYmd(event.target.value)}
                className="min-w-[9.5rem] flex-1"
                aria-label={t("saasAdminCust_joinPeriodTo")}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("saasAdminCust_joinPeriodCustomHint")}</p>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>{t("saasAdminCust_sortLabel")}</Label>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as "default" | "risk_desc" | "expiry_soon")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t("saasAdminCust_sortDefault")}</SelectItem>
              <SelectItem value="risk_desc">{t("saasAdminCust_sortRiskDesc")}</SelectItem>
              <SelectItem value="expiry_soon">{t("saasAdminCust_sortExpirySoon")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("saasAdminCust_quickFilter")}</Label>
          <label className="flex h-9 items-center gap-2 rounded-md border px-3">
            <Checkbox checked={expiryOnly} onCheckedChange={(checked) => setExpiryOnly(Boolean(checked))} />
            <span className="text-sm">{t("saasAdminCust_expiryOnly")}</span>
          </label>
        </div>
        {scope.isPlatform ? (
          <div className="space-y-2">
            <Label>{t("saasAdminCust_partnerFilter")}</Label>
            <Select value={partnerFilter} onValueChange={setPartnerFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                <SelectItem value="__direct__">{t("saasAdminCust_partnerDirect")}</SelectItem>
                {partnerOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {scope.isPlatform ? (
          <div className="flex items-center gap-2 md:col-span-2 xl:col-span-6">
            <Checkbox
              id="show-platform-internal"
              checked={showPlatformInternal}
              onCheckedChange={(v) => setShowPlatformInternal(Boolean(v))}
            />
            <Label htmlFor="show-platform-internal" className="text-sm font-normal cursor-pointer">
              {t("saasAdminCust_showPlatformInternal")}
            </Label>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button
          type="button"
          size="sm"
          className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
          variant="outline"
          onClick={() => requestBulkUpdateStatus("active")}
          disabled={loading}
        >
          <CheckCircle2 className="size-3.5" />
          {t("saasAdminCust_bulkActivate")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/50"
          variant="outline"
          onClick={() => requestBulkUpdateStatus("grace")}
          disabled={loading}
        >
          <Clock3 className="size-3.5" />
          {t("saasAdminCust_bulkGrace")}
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => requestBulkUpdateStatus("suspended")} disabled={loading}>
          <Ban className="size-3.5" />
          {t("saasAdminCust_bulkSuspend")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="ml-auto shadow-sm"
          onClick={exportCsv}
          disabled={filteredTenants.length === 0}
        >
          <Download className="size-3.5" />
          {t("saasAdminCust_exportCsv")}
        </Button>
      </div>
        </CardContent>
      </Card>

      {loading && tenants.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">{t("saasAdmin_loading")}</p>
          </CardContent>
        </Card>
      ) : null}

      {!loading && tenants.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">{t("saasAdminCust_noTenants")}</p>
          </CardContent>
        </Card>
      ) : null}

      {tenants.length > 0 && selectedTenant ? <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden border-slate-200/80 shadow-sm dark:border-slate-800">
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="size-4 text-sky-600" />
              {t("saasAdminCust_listTitle")}
            </CardTitle>
            <CardDescription>
              {tr(t, "saasAdminCust_listDesc", { n: String(filteredTenants.length) })}
              {searchApplied ? t("saasAdminCust_searchMode") : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={filteredTenants.length > 0 && selectedIds.length === filteredTenants.length}
                      onCheckedChange={(checked) => toggleSelectAllFiltered(Boolean(checked))}
                    />
                  </TableHead>
                  <TableHead>{t("saasAdminCust_colTenant")}</TableHead>
                  <TableHead>{t("saasAdminCust_colPlan")}</TableHead>
                  <TableHead>{t("saasAdminCust_colSalesStage")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("saasAdminCust_colExpiry")}</TableHead>
                  <TableHead className="pr-4">{t("saasAdminCust_colRisk")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((tenant) => {
                  const active = tenant.id === selectedTenant.id
                  const risks = tenantRiskCount(tenant)
                  const expiry = getExpiryInfo(tenant, t)
                  return (
                    <TableRow
                      key={tenant.id}
                      className={cn(
                        "cursor-pointer transition-colors",
                        active
                          ? "bg-sky-50/90 hover:bg-sky-50 dark:bg-sky-950/30 dark:hover:bg-sky-950/40"
                          : "hover:bg-muted/50"
                      )}
                      onClick={() => setSelectedTenantId(tenant.id)}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.includes(tenant.id)}
                          onCheckedChange={(checked) => toggleTenantSelection(tenant.id, Boolean(checked))}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("font-medium", active && "text-sky-900 dark:text-sky-100")}>
                            {tenant.companyName}
                          </span>
                          {isSaasPlatformInternalTenant(tenant) ? (
                            <Badge variant="secondary">{t("saasAdminCust_platformInternalBadge")}</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{tenant.ownerName}</p>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium tabular-nums">
                          {tenant.pricing.currentChargeAmount.toLocaleString()} {tenant.pricing.currency}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {tenant.billingCycle === "yearly"
                            ? t("saasAdminCust_billingYearly")
                            : t("saasAdminCust_billingMonthly")}
                          {" · "}
                          {tenantPricingModeLabel(tenant, t)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{saasAdminStageLabel(tenant.policy.salesStage, t)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={STATUS_VARIANT[tenant.status]}
                          className={cn(
                            tenant.status === "active" && "bg-emerald-600 hover:bg-emerald-600",
                            tenant.status === "grace" &&
                              "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                          )}
                        >
                          {saasAdminStatusLabel(tenant.status, t)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {expiry ? <Badge variant={expiry.variant}>{expiry.text}</Badge> : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4">
                        {risks > 0 ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="size-3" />
                            {tr(t, "saasAdminCust_riskCount", { n: String(risks) })}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300">
                            {t("saasAdminCust_riskOk")}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredTenants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      {t("saasAdminCust_noFilterMatch")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200/80 shadow-sm dark:border-slate-800">
          <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-sky-50/40 pb-3 dark:from-slate-950/40 dark:to-sky-950/20">
              <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg">{selectedTenant.companyName}</CardTitle>
                  {isSaasPlatformInternalTenant(selectedTenant) ? (
                    <Badge variant="secondary">{t("saasAdminCust_platformInternalBadge")}</Badge>
                  ) : null}
                  <Badge
                    variant={STATUS_VARIANT[selectedTenant.status]}
                    className={cn(
                      selectedTenant.status === "active" && "bg-emerald-600 hover:bg-emerald-600",
                      selectedTenant.status === "grace" &&
                        "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                    )}
                  >
                    {saasAdminStatusLabel(selectedTenant.status, t)}
                  </Badge>
                </div>
                <CardDescription>{tr(t, "saasAdminCust_tenantIdLine", { id: selectedTenant.id })}</CardDescription>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void exportTenantJson()}
                  disabled={loading || saving}
                >
                  <Download className="mr-1.5 size-3.5" />
                  {t("saasAdminCust_exportTenantJson")}
                </Button>
                <Button
                  type="button"
                  className="shadow-sm shadow-primary/20"
                  onClick={() => void saveTenantSettings()}
                  disabled={loading || saving}
                >
                  {saving ? t("saasAdminCust_saving") : t("save")}
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button asChild size="sm" className="bg-sky-600 text-white hover:bg-sky-700">
                <Link href={selectedTenantLoginHref}>{t("saasAdminCust_loginLink")}</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={selectedTenantLoginHref} target="_blank" rel="noopener noreferrer">
                  {t("saasAdminCust_loginNewTab")}
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                onClick={() => setTenantStatus("active")}
              >
                {saasAdminStatusLabel("active", t)}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                onClick={() => setTenantStatus("grace")}
              >
                {saasAdminStatusLabel("grace", t)}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setTenantStatus("suspended")}>
                {saasAdminStatusLabel("suspended", t)}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={detailTab} onValueChange={onDetailTabChange} className="w-full">
              <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-card pb-2">
                <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1.5">
                  <TabsTrigger value="plan" className={DETAIL_TAB_TRIGGER_CN}>
                    {t("saasAdminCust_tabPlan")}
                  </TabsTrigger>
                  <TabsTrigger value="company" className={DETAIL_TAB_TRIGGER_CN}>
                    {t("saasAdminCust_tabCompany")}
                  </TabsTrigger>
                  <TabsTrigger value="login" className={DETAIL_TAB_TRIGGER_CN}>
                    {t("saasAdminCust_tabBootstrap")}
                  </TabsTrigger>
                  <TabsTrigger value="limits" className={DETAIL_TAB_TRIGGER_CN}>
                    {t("saasAdminCust_tabLimits")}
                  </TabsTrigger>
                  <TabsTrigger value="tablets" className={DETAIL_TAB_TRIGGER_CN}>
                    {t("saasAdminCust_tabTablets")}
                  </TabsTrigger>
                  <TabsTrigger value="usage" className={DETAIL_TAB_TRIGGER_CN}>
                    {t("saasAdminCust_tabUsage")}
                  </TabsTrigger>
                  <TabsTrigger value="billing" className={DETAIL_TAB_TRIGGER_CN}>
                    {t("saasAdminCust_tabBilling")}
                  </TabsTrigger>
                  <TabsTrigger value="audit" className={DETAIL_TAB_TRIGGER_CN}>
                    {t("saasAdminCust_tabAudit")}
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-200/70 bg-sky-50/80 px-3 py-2 dark:border-sky-900/50 dark:bg-sky-950/30">
                  <p className="text-sm text-muted-foreground">{t("saasAdminCust_savePanelHint")}</p>
                  <Button
                    type="button"
                    size="sm"
                    className="shadow-sm shadow-primary/20"
                    onClick={() => void saveTenantSettings()}
                    disabled={loading || saving}
                  >
                    {saving ? t("saasAdminCust_saving") : t("save")}
                  </Button>
                </div>
              </div>

              <TabsContent value="plan" className="space-y-4 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
                  <div>
                    <p className="text-sm font-medium">{t("saasAdminCust_onboardingLinkTitle")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("saasAdminCust_onboardingLinkDesc")}</p>
                  </div>
                  <Button type="button" size="sm" variant="secondary" asChild>
                    <Link href={onboardingHref(selectedTenant.id)}>{t("saasAdminCust_goOnboarding")}</Link>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("saasAdminCust_planChargeSummary")}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {tr(t, "saasAdminCust_currentCharge", {
                        amount: selectedTenant.pricing.currentChargeAmount.toLocaleString(),
                        currency: selectedTenant.pricing.currency,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedTenant.billingCycle === "yearly"
                        ? t("saasAdminCust_billingYearly")
                        : t("saasAdminCust_billingMonthly")}
                      {" · "}
                      {tenantPricingModeLabel(selectedTenant, t)}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href="/saas-admin/pricing">{t("saasAdminCust_globalPricingLink")}</Link>
                  </Button>
                </div>

                <SaasModulePricingPanel tenant={selectedTenant} onChange={updateTenant} />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("saasAdminCust_planTier")}</Label>
                    <Select
                      value={selectedTenant.planTier}
                      onValueChange={(value) =>
                        updateTenant((tenant) => ({ ...tenant, planTier: value as PlanTier }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="growth">Growth</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("saasAdminCust_billingCycle")}</Label>
                    <Select
                      value={selectedTenant.billingCycle}
                      onValueChange={(value) =>
                        updateTenant((tenant) => {
                          const billingCycle = value as BillingCycle
                          const next = { ...tenant, billingCycle }
                          return {
                            ...next,
                            pricing: recalcTenantPricing(next, {}),
                          }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">{t("saasAdminCust_billingMonthly")}</SelectItem>
                        <SelectItem value="yearly">{t("saasAdminCust_billingYearly")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("saasAdminCust_nextBilling")}</Label>
                    <Input
                      type="date"
                      value={selectedTenant.nextBillingDate}
                      onChange={(event) =>
                        updateTenant((tenant) => ({ ...tenant, nextBillingDate: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("saasAdminCust_trialEnds")}</Label>
                    <Input
                      type="date"
                      value={selectedTenant.trialEndsAt}
                      onChange={(event) =>
                        updateTenant((tenant) => ({ ...tenant, trialEndsAt: event.target.value }))
                      }
                    />
                  </div>
                </div>

                {selectedTenant.policy.pricingMode === "module" ||
                selectedTenant.pricing.pricingMode === "module" ? (
                  <div className="rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
                    {t("saasAdminCust_featureFlagsFollowModules")}
                  </div>
                ) : (
                  <div className="grid gap-3 rounded-md border p-3">
                    <h3 className="text-sm font-semibold">{t("saasAdminCust_featureFlags")}</h3>
                    <p className="text-xs text-muted-foreground">{t("saasAdminCust_featureFlagsStageHint")}</p>
                    {SAAS_ADMIN_FEATURE_KEYS.map((featureKey) => (
                      <label key={featureKey} className="flex items-start gap-3 rounded-md border p-3">
                        <Checkbox
                          checked={selectedTenant.features[featureKey]}
                          onCheckedChange={(checked) =>
                            updateTenant((tenant) => {
                              const features = { ...tenant.features, [featureKey]: Boolean(checked) }
                              return { ...tenant, features }
                            })
                          }
                        />
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{t(`saasAdminFeature_${featureKey}`)}</p>
                          <p className="text-xs text-muted-foreground">{t(`saasAdminFeature_${featureKey}_desc`)}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                <div className="space-y-4 rounded-md border p-3">
                  <div>
                    <h3 className="text-sm font-semibold">{t("saasAdminCust_planOpsSection")}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("saasAdminCust_policyIntro")}</p>
                  </div>

                  {scope.isPlatform ? (
                    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                      <div className="space-y-2">
                        <Label>{t("saasAdminCust_assignedPartner")}</Label>
                        <Select
                          value={selectedTenant.partnerId || "__none__"}
                          onValueChange={(value) =>
                            updateTenant((tenant) => ({
                              ...tenant,
                              partnerId: value === "__none__" ? null : value,
                              partnerName:
                                value === "__none__"
                                  ? null
                                  : partnerOptions.find((p) => p.id === value)?.name || value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">{t("saasAdminCust_partnerDirect")}</SelectItem>
                            {partnerOptions.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{t("saasAdminCust_assignedPartnerHint")}</p>
                      </div>
                    </div>
                  ) : selectedTenant.partnerName || scope.partnerName ? (
                    <div className="rounded-md border p-3 text-sm">
                      {tr(t, "saasAdminCust_partnerBadge", {
                        name: selectedTenant.partnerName || scope.partnerName || "-",
                      })}
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                    <div className="space-y-2">
                      <Label>{t("saasAdminCust_salesStage")}</Label>
                      <Select
                        value={selectedTenant.policy.salesStage}
                        onValueChange={(value) =>
                          updateTenant((tenant) => {
                            const salesStage = value as SalesStage
                            const next = { ...tenant, policy: { ...tenant.policy, salesStage } }
                            return {
                              ...next,
                              pricing: recalcTenantPricing(next, {}),
                            }
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SAAS_ADMIN_SALES_STAGES.map((stage) => (
                            <SelectItem key={stage} value={stage}>
                              {saasAdminStageLabel(stage, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        updateTenant((tenant) => {
                          const features = applySalesStageFeatures(tenant.features, tenant.policy.salesStage)
                          const pricingMode = tenant.policy.pricingMode ?? tenant.pricing.pricingMode ?? "stage"
                          if (pricingMode !== "module") {
                            return { ...tenant, features }
                          }
                          const modulePrices = syncModuleEnabledFromFeatures(
                            normalizeModulePrices(tenant.pricing.modulePrices),
                            features
                          )
                          return {
                            ...tenant,
                            features,
                            pricing: recalcTenantPricing(tenant, { modulePrices }),
                          }
                        })
                      }
                    >
                      {t("saasAdminCust_applyStageFeatures")}
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("saasAdminCust_posBillingBasis")}</Label>
                      <Select
                        value={selectedTenant.policy.posDeviceBillingBasis ?? "usage"}
                        onValueChange={(value) =>
                          updateTenant((tenant) => {
                            const posDeviceBillingBasis = value as TenantItem["policy"]["posDeviceBillingBasis"]
                            const next = { ...tenant, policy: { ...tenant.policy, posDeviceBillingBasis } }
                            return { ...next, pricing: recalcTenantPricing(next, {}) }
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="erp_admin">{t("saasAdminCust_posBillingErpAdmin")}</SelectItem>
                          <SelectItem value="saas_limit">{t("saasAdminCust_posBillingSaasLimit")}</SelectItem>
                          <SelectItem value="usage">{t("saasAdminCust_posBillingUsage")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{t("saasAdminCust_posBillingBasisDesc")}</p>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedTenant.policy.autoSuspendOnOverdue}
                        onCheckedChange={(checked) =>
                          updateTenant((tenant) => ({
                            ...tenant,
                            policy: { ...tenant.policy, autoSuspendOnOverdue: Boolean(checked) },
                          }))
                        }
                      />
                      {t("saasAdminCust_autoSuspendOverdue")}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedTenant.policy.allowOverage}
                        onCheckedChange={(checked) =>
                          updateTenant((tenant) => ({
                            ...tenant,
                            policy: { ...tenant.policy, allowOverage: Boolean(checked) },
                          }))
                        }
                      />
                      {t("saasAdminCust_allowOverage")}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedTenant.policy.require2faAdmin}
                        onCheckedChange={(checked) =>
                          updateTenant((tenant) => ({
                            ...tenant,
                            policy: { ...tenant.policy, require2faAdmin: Boolean(checked) },
                          }))
                        }
                      />
                      {t("saasAdminCust_require2fa")}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedTenant.policy.requireIpAllowlist}
                        onCheckedChange={(checked) =>
                          updateTenant((tenant) => ({
                            ...tenant,
                            policy: { ...tenant.policy, requireIpAllowlist: Boolean(checked) },
                          }))
                        }
                      />
                      {t("saasAdminCust_requireIpAllowlist")}
                    </label>
                    {selectedTenant.policy.requireIpAllowlist ? (
                      <div className="space-y-2 rounded-md border border-dashed p-3">
                        <Label>{t("saasAdminCust_allowedIps")}</Label>
                        <Textarea
                          rows={4}
                          value={(selectedTenant.policy.allowedIps || []).join("\n")}
                          onChange={(event) =>
                            updateTenant((tenant) => ({
                              ...tenant,
                              policy: {
                                ...tenant.policy,
                                allowedIps: event.target.value
                                  .split(/[\n,]+/)
                                  .map((x) => x.trim())
                                  .filter(Boolean),
                              },
                            }))
                          }
                          placeholder={t("saasAdminCust_allowedIpsPh")}
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">{t("saasAdminCust_allowedIpsHint")}</p>
                      </div>
                    ) : null}
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedTenant.policy.forceWeeklyBackup}
                        onCheckedChange={(checked) =>
                          updateTenant((tenant) => ({
                            ...tenant,
                            policy: { ...tenant.policy, forceWeeklyBackup: Boolean(checked) },
                          }))
                        }
                      />
                      {t("saasAdminCust_forceWeeklyBackup")}
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>{t("saasAdminCust_overdueGraceDays")}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={selectedTenant.policy.overdueGraceDays}
                        onChange={(event) =>
                          updateTenant((tenant) => ({
                            ...tenant,
                            policy: { ...tenant.policy, overdueGraceDays: Number(event.target.value || 0) },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("saasAdminCust_dataRetentionDays")}</Label>
                      <Input
                        type="number"
                        min={90}
                        value={selectedTenant.policy.dataRetentionDays}
                        onChange={(event) =>
                          updateTenant((tenant) => ({
                            ...tenant,
                            policy: { ...tenant.policy, dataRetentionDays: Number(event.target.value || 0) },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("saasAdminCust_supportTier")}</Label>
                      <Select
                        value={selectedTenant.policy.supportTier}
                        onValueChange={(value) =>
                          updateTenant((tenant) => ({
                            ...tenant,
                            policy: { ...tenant.policy, supportTier: value as SupportTier },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">{t("saasAdminCust_supportStandard")}</SelectItem>
                          <SelectItem value="priority">{t("saasAdminCust_supportPriority")}</SelectItem>
                          <SelectItem value="dedicated">{t("saasAdminCust_supportDedicated")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-sm font-medium">{t("saasAdminCust_integrationsOnboardingTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("saasAdminCust_integrationsOnboardingDesc")}</p>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href={onboardingHref(selectedTenant.id)}>{t("saasAdminCust_goOnboardingIntegrations")}</Link>
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="limits" className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">{t("saasAdminCust_limitsIntro")}</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("saasAdminCust_maxStores")}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={selectedTenant.limits.maxStores}
                      onChange={(event) =>
                        updateTenant((tenant) => ({
                          ...tenant,
                          limits: { ...tenant.limits, maxStores: Number(event.target.value || 0) },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("saasAdminCust_maxManagers")}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={selectedTenant.limits.maxManagerAccounts}
                      onChange={(event) =>
                        updateTenant((tenant) => ({
                          ...tenant,
                          limits: { ...tenant.limits, maxManagerAccounts: Number(event.target.value || 0) },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("saasAdminCust_maxStaff")}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={selectedTenant.limits.maxStaffAccounts}
                      onChange={(event) =>
                        updateTenant((tenant) => ({
                          ...tenant,
                          limits: { ...tenant.limits, maxStaffAccounts: Number(event.target.value || 0) },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("saasAdminCust_maxTablets")}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={selectedTenant.limits.maxTablets}
                      onChange={(event) =>
                        updateTenant((tenant) => ({
                          ...tenant,
                          limits: { ...tenant.limits, maxTablets: Number(event.target.value || 0) },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("saasAdminCust_maxPos")}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={selectedTenant.limits.maxPosDevices}
                      disabled={selectedTenant.policy.posDeviceBillingBasis === "erp_admin"}
                      onChange={(event) =>
                        updateTenant((tenant) => ({
                          ...tenant,
                          limits: { ...tenant.limits, maxPosDevices: Number(event.target.value || 0) },
                        }))
                      }
                    />
                    {selectedTenant.policy.posDeviceBillingBasis === "erp_admin" ? (
                      <p className="text-xs text-muted-foreground">
                        {tr(t, "saasAdminCust_maxPosErpHint", {
                          licensed: String(selectedTenant.usage.licensedPosDevices ?? selectedTenant.limits.maxPosDevices),
                          inUse: String(selectedTenant.usage.posDevices),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label>{t("saasAdminCust_maxApiKeys")}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={selectedTenant.limits.maxApiKeys}
                      onChange={(event) =>
                        updateTenant((tenant) => ({
                          ...tenant,
                          limits: { ...tenant.limits, maxApiKeys: Number(event.target.value || 0) },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>{t("saasAdminCust_monthlyOrderQuota")}</Label>
                    <Input
                      type="number"
                      min={1000}
                      step={1000}
                      value={selectedTenant.limits.monthlyOrderQuota}
                      onChange={(event) =>
                        updateTenant((tenant) => ({
                          ...tenant,
                          limits: { ...tenant.limits, monthlyOrderQuota: Number(event.target.value || 0) },
                        }))
                      }
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="login" className="space-y-4 pt-2">
                <SaasCustomerLoginInfoPanel
                  tenantId={selectedTenant.id}
                  companyName={selectedTenant.companyName}
                  isPlatformInternal={selectedTenant.isPlatformInternal}
                />
              </TabsContent>

              <TabsContent value="tablets" className="space-y-4 pt-2">
                <SaasCustomerTabletsPanel tenantId={selectedTenant.id} />
              </TabsContent>

              <TabsContent value="company" className="space-y-4 pt-2">
                <div className="rounded-md border bg-muted/20 p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">{t("saasAdminBillingCompany_title")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("saasAdminBillingCompany_desc")}</p>
                  </div>
                  <SaasBillingCompanyFields
                    mode="tenant"
                    t={t}
                    values={{
                      companyName: selectedTenant.companyName,
                      ownerName: selectedTenant.ownerName,
                      phone: selectedTenant.phone,
                      billingCompany: selectedTenant.billingCompany,
                    }}
                    onChange={(patch) => {
                      updateTenant((tenant) => ({
                        ...tenant,
                        companyName: patch.companyName ?? tenant.companyName,
                        ownerName: patch.ownerName ?? tenant.ownerName,
                        phone: patch.phone ?? tenant.phone,
                        billingCompany: {
                          ...tenant.billingCompany,
                          ...patch.billingCompany,
                        },
                      }))
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{t("saasAdminBillingCompany_saveHint")}</p>
                </div>
              </TabsContent>

              <TabsContent value="usage" className="space-y-4 pt-2">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{t("saasAdminCust_usageStores")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <UsageBar current={selectedTenant.usage.stores} max={selectedTenant.limits.maxStores} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{t("saasAdminCust_usageManagers")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <UsageBar
                        current={selectedTenant.usage.managerAccounts}
                        max={selectedTenant.limits.maxManagerAccounts}
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{t("saasAdminCust_usageStaff")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <UsageBar
                        current={selectedTenant.usage.staffAccounts}
                        max={selectedTenant.limits.maxStaffAccounts}
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{t("saasAdminCust_usageTablets")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <UsageBar current={selectedTenant.usage.tablets} max={selectedTenant.limits.maxTablets} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{t("saasAdminCust_usagePos")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <UsageBar current={selectedTenant.usage.posDevices} max={selectedTenant.limits.maxPosDevices} />
                      {selectedTenant.policy.posDeviceBillingBasis === "erp_admin" &&
                      (selectedTenant.usage.licensedPosDevices ?? 0) > 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {tr(t, "saasAdminCust_maxPosErpHint", {
                            licensed: String(selectedTenant.usage.licensedPosDevices),
                            inUse: String(selectedTenant.usage.posDevices),
                          })}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{t("saasAdminCust_usageOrders")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <UsageBar
                        current={selectedTenant.usage.monthlyOrders}
                        max={selectedTenant.limits.monthlyOrderQuota}
                      />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="billing" className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("saasAdminCust_billingEstimateTitle")}</p>
                    <p className="text-base font-semibold tabular-nums">
                      {tr(t, "saasAdminCust_currentCharge", {
                        amount: selectedTenant.pricing.currentChargeAmount.toLocaleString(),
                        currency: selectedTenant.pricing.currency,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{tenantPricingModeLabel(selectedTenant, t)}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href={`/saas-admin/customers?tenant=${encodeURIComponent(selectedTenant.id)}&tab=plan`}>
                      {t("saasAdminCust_billingEditPricing")}
                    </Link>
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">{t("saasAdminCust_billingIntro")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={exportModuleInvoiceCsv}>
                      {t("saasAdminCust_invoiceExportCsv")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={printModuleInvoice}>
                      {t("saasAdminCust_invoicePrint")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setInvoiceEmailOpen(true)}>
                      {t("saasAdminCust_invoiceEmail")}
                    </Button>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("saasAdminCust_billingTime")}</TableHead>
                      <TableHead>{t("saasAdminCust_billingEvent")}</TableHead>
                      <TableHead>{t("saasAdminCust_billingAmount")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead>{t("saasAdminCust_billingMemo")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTenant.billingHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          {t("saasAdminCust_noBilling")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedTenant.billingHistory.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{formatBangkokDateTime(row.happenedAt, dateLocale)}</TableCell>
                          <TableCell>{row.eventType}</TableCell>
                          <TableCell>
                            {row.amount.toLocaleString()} {row.currency}
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.status === "ok" ? "default" : "outline"}>{row.status}</Badge>
                          </TableCell>
                          <TableCell>{row.memo || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="audit" className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">{t("saasAdminCust_auditIntro")}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={auditFilter === "all" ? "default" : "outline"}
                      onClick={() => setAuditFilter("all")}
                    >
                      {t("all")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={auditFilter === "employee_only" ? "default" : "outline"}
                      onClick={() => setAuditFilter("employee_only")}
                    >
                      {t("saasAdminCust_auditEmployeeOnly")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={exportAuditCsv} disabled={filteredAuditTrail.length === 0}>
                      {t("saasAdminCust_exportCsv")}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={auditPeriod === "all" ? "default" : "outline"}
                    onClick={() => setAuditPeriod("all")}
                  >
                    {t("saasAdminCust_auditPeriodAll")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={auditPeriod === "today" ? "default" : "outline"}
                    onClick={() => setAuditPeriod("today")}
                  >
                    {t("saasAdminCust_auditPeriodToday")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={auditPeriod === "7d" ? "default" : "outline"}
                    onClick={() => setAuditPeriod("7d")}
                  >
                    {t("saasAdminCust_auditPeriod7d")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={auditPeriod === "30d" ? "default" : "outline"}
                    onClick={() => setAuditPeriod("30d")}
                  >
                    {t("saasAdminCust_auditPeriod30d")}
                  </Button>
                </div>
                <div className="max-w-sm space-y-1">
                  <Label>{t("saasAdminCust_auditActorSearch")}</Label>
                  <Input
                    value={auditActorQuery}
                    onChange={(e) => setAuditActorQuery(e.target.value)}
                    placeholder={t("saasAdminCust_auditActorPh")}
                  />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("saasAdminCust_billingTime")}</TableHead>
                      <TableHead>{t("saasAdminCust_auditAction")}</TableHead>
                      <TableHead>{t("saasAdminCust_auditActor")}</TableHead>
                      <TableHead>{t("saasAdminCust_auditSummary")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAuditTrail.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          {auditFilter === "employee_only" ? t("saasAdminCust_noAuditEmployee") : t("saasAdminCust_noAudit")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAuditTrail.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{formatBangkokDateTime(row.changedAt, dateLocale)}</TableCell>
                          <TableCell>{row.action}</TableCell>
                          <TableCell>
                            {row.actorName} ({row.actorRole})
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{row.summary || "-"}</span>
                              {row.employeeId ? (
                                <Button asChild type="button" size="sm" variant="outline" className="h-6 px-2 text-xs">
                                  <Link href={employeeAuditLink(row.employeeId)}>
                                    {tr(t, "saasAdminCust_employeeLink", { id: String(row.employeeId) })}
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div> : null}

      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saasAdminCust_bulkConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {tr(t, "saasAdminCust_bulkConfirmDesc", {
                n: String(selectedIds.length),
                status: bulkPendingStatus ? saasAdminStatusLabel(bulkPendingStatus, t) : "-",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkConfirmOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant={bulkPendingStatus === "suspended" ? "destructive" : "default"}
              onClick={bulkUpdateStatus}
              disabled={loading}
            >
              {t("saasAdminCust_bulkConfirmApply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saasAdminCust_createTitle")}</DialogTitle>
            <DialogDescription>{t("saasAdminCust_createDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>{t("saasAdminCust_tenantIdLabel")}</Label>
              <Input value={newTenantId} onChange={(e) => setNewTenantId(e.target.value)} placeholder={t("saasAdminCust_tenantIdPh")} />
            </div>
            <div className="space-y-1">
              <Label>{t("saasAdminCust_tenantNameLabel")}</Label>
              <Input value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} placeholder={t("saasAdminCust_tenantNamePh")} />
            </div>
            <div className="space-y-1">
              <Label>{t("saasAdminCust_ownerLabel")}</Label>
              <Input value={newOwnerName} onChange={(e) => setNewOwnerName(e.target.value)} placeholder={t("saasAdminCust_optionalInput")} />
            </div>
            <div className="space-y-1">
              <Label>{t("saasAdminCust_phoneLabel")}</Label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder={t("saasAdminCust_optionalInput")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={createTenant} disabled={loading}>
              {t("saasAdminCust_createSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceEmailOpen} onOpenChange={setInvoiceEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saasAdminCust_invoiceEmailTitle")}</DialogTitle>
            <DialogDescription>{t("saasAdminCust_invoiceEmailDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>{t("saasAdminCust_invoiceEmailTo")}</Label>
              <Input
                type="email"
                value={invoiceEmail}
                onChange={(e) => setInvoiceEmail(e.target.value)}
                placeholder="billing@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("saasAdminCust_invoiceEmailNote")}</Label>
              <Input value={invoiceNote} onChange={(e) => setInvoiceNote(e.target.value)} placeholder={t("saasAdminCust_optionalInput")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInvoiceEmailOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={() => void sendModuleInvoiceEmail()} disabled={invoiceSending}>
              {t("saasAdminCust_invoiceEmailSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

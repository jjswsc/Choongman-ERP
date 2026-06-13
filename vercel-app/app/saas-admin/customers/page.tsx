"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import {
  applySalesStageFeatures,
  DEFAULT_POLICY,
  DEFAULT_STAGE_PRICES,
  FALLBACK_TENANTS,
  resolveCurrentChargeAmount,
  type BillingCycle,
  type PlanTier,
  type SalesStage,
  type SupportTier,
  type TenantItem,
} from "@/lib/saas-admin-control-plane"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SaasAdminTenantIntegrationsPanel } from "@/components/saas/saas-admin-tenant-integrations-panel"
import { SaasModulePricingPanel } from "@/components/saas/saas-module-pricing-panel"
import { SaasBillingCompanyFields } from "@/components/saas/saas-billing-company-fields"
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
  applyIntegrationFlagsToModules,
  cloneDefaultModulePrices,
  normalizeModulePrices,
  SAAS_MODULE_LABEL_KEY,
  syncFeaturesFromModules,
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

const CUSTOMER_DETAIL_TABS = [
  "plan",
  "company",
  "bootstrap",
  "limits",
  "policy",
  "usage",
  "billing",
  "audit",
  "integrations",
] as const

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
  const fallbackTenant = FALLBACK_TENANTS[0]!
  const [tenants, setTenants] = useState<TenantItem[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadNotice, setLoadNotice] = useState("")
  const [search, setSearch] = useState("")
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
  const [partnerFilter, setPartnerFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<"default" | "risk_desc" | "expiry_soon">("default")
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkPendingStatus, setBulkPendingStatus] = useState<TenantItem["status"] | null>(null)

  const [bootStoreName, setBootStoreName] = useState("")
  const [bootStoreCode, setBootStoreCode] = useState("")
  const [bootAdminName, setBootAdminName] = useState("")
  const [bootPw, setBootPw] = useState("")
  const [bootPw2, setBootPw2] = useState("")
  const [auditFilter, setAuditFilter] = useState<"all" | "employee_only">("all")
  const [auditActorQuery, setAuditActorQuery] = useState("")
  const [auditPeriod, setAuditPeriod] = useState<AuditPeriodFilter>("all")
  const [detailTab, setDetailTab] = useState<CustomerDetailTab>("plan")
  const [bootstrapHint, setBootstrapHint] = useState(false)
  const [partnerOptions, setPartnerOptions] = useState<Array<{ id: string; name: string }>>([])

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0] ?? fallbackTenant,
    [selectedTenantId, tenants, fallbackTenant]
  )

  const filteredTenants = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const rows = tenants.filter((tenant) => {
      if (statusFilter !== "all" && tenant.status !== statusFilter) return false
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
  }, [expiryOnly, partnerFilter, scope.isPlatform, search, sortBy, statusFilter, t, tenants])

  const stats = useMemo(() => {
    const active = tenants.filter((x) => x.status === "active").length
    const trial = tenants.filter((x) => x.status === "trial").length
    const grace = tenants.filter((x) => x.status === "grace").length
    const suspended = tenants.filter((x) => x.status === "suspended").length
    const highRisk = tenants.filter((x) => tenantRiskCount(x) > 0).length
    const totalOrders = tenants.reduce((acc, x) => acc + x.usage.monthlyOrders, 0)
    return { active, trial, grace, suspended, highRisk, totalOrders }
  }, [tenants])

  const filteredAuditTrail = useMemo(() => {
    const rows = selectedTenant.auditTrail || []
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
  }, [auditActorQuery, auditFilter, auditPeriod, selectedTenant.auditTrail])

  const updateTenant = (updater: (tenant: TenantItem) => TenantItem) => {
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
      setTenants(FALLBACK_TENANTS)
      setSelectedTenantId(FALLBACK_TENANTS[0]!.id)
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
    if (isCustomerDetailTab(tab)) setDetailTab(tab)
    if (searchParams.get("created") === "1") setBootstrapHint(true)
  }, [searchParams])

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
    setLoading(true)
    try {
      await persistTenant(selectedTenant)
      await appAlert(tr(t, "saasAdminCust_saved", { name: selectedTenant.companyName }))
      await loadTenants()
    } catch (error) {
      await appAlert(tr(t, "saasAdminCust_saveFailed", { msg: String(error) }))
    } finally {
      setLoading(false)
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
      setSelectedTenantId(id)
      setDetailTab("bootstrap")
      setBootstrapHint(true)
      syncCustomersUrl({ tenantId: id, tab: "bootstrap", created: true })
    } catch (error) {
      await appAlert(tr(t, "saasAdminCust_createFailed", { msg: String(error) }))
    } finally {
      setLoading(false)
    }
  }

  const bootstrapTenantLogin = async () => {
    const tenantId = selectedTenant.id
    const storeName = bootStoreName.trim()
    const adminName = bootAdminName.trim()
    const pw = bootPw.trim()
    const pw2 = bootPw2.trim()
    if (!storeName || !adminName || !pw) {
      await appAlert(t("saasAdminCust_errBootstrapRequired"))
      return
    }
    if (pw.length < 4) {
      await appAlert(t("saasAdminCust_errPwMin"))
      return
    }
    if (pw !== pw2) {
      await appAlert(t("saasAdminCust_errPwMismatch"))
      return
    }
    setLoading(true)
    try {
      const res = await apiFetch("/api/saasBootstrapTenantLogin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          storeName,
          storeCode: bootStoreCode.trim() || undefined,
          adminName,
          password: pw,
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string; code?: string; companyName?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminCust_errBootstrapFailed"))
        return
      }
      await appAlert(
        tr(t, "saasAdminCust_bootstrapSuccess", {
          company: json.companyName || selectedTenant.companyName,
          store: storeName,
          admin: adminName,
        })
      )
      setBootStoreName("")
      setBootStoreCode("")
      setBootAdminName("")
      setBootPw("")
      setBootPw2("")
      await loadTenants()
    } catch (error) {
      await appAlert(tr(t, "saasAdminCust_errGeneric", { msg: String(error) }))
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

  const selectedTenantLoginHref = useMemo(() => {
    const p = new URLSearchParams()
    p.set("redirect", "/admin")
    if (selectedTenant.companyName) p.set("company", selectedTenant.companyName)
    return `/admin/login?${p.toString()}`
  }, [selectedTenant.companyName])

  const employeeAuditLink = (employeeId: number): string => {
    const p = new URLSearchParams()
    if (selectedTenant.companyName) p.set("company", selectedTenant.companyName)
    p.set("employeeId", String(employeeId))
    return `/admin/employees?${p.toString()}`
  }

  return (
    <main className="space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("saasAdminCust_pageTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("saasAdminCust_pageIntro")}</p>
          {loadNotice ? <p className="mt-2 text-xs text-amber-600">{loadNotice}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setOpenCreate(true)} disabled={loading}>
            {t("saasAdminCust_addTenant")}
          </Button>
          <Button type="button" onClick={saveTenantSettings} disabled={loading || tenants.length === 0}>
            {t("saasAdminCust_saveSettings")}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("saasAdminCust_statTotal")}</p>
            <p className="text-2xl font-semibold">{loading ? "…" : tenants.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("saasAdminCust_statActiveTrial")}</p>
            <p className="text-2xl font-semibold">{loading ? "…" : stats.active + stats.trial}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("saasAdminCust_statGrace")}</p>
            <p className="text-2xl font-semibold">{loading ? "…" : stats.grace}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("saasAdminCust_statSuspended")}</p>
            <p className="text-2xl font-semibold">{loading ? "…" : stats.suspended}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("saasAdminCust_statHighRisk")}</p>
            <p className="text-2xl font-semibold">{loading ? "…" : stats.highRisk}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("saasAdminCust_statMonthlyOrders")}</p>
            <p className="text-2xl font-semibold">{loading ? "…" : stats.totalOrders.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-2">
          <Label>{t("saasAdminCust_searchLabel")}</Label>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("saasAdminCust_searchPh")}
          />
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
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => requestBulkUpdateStatus("active")} disabled={loading}>
          {t("saasAdminCust_bulkActivate")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => requestBulkUpdateStatus("grace")} disabled={loading}>
          {t("saasAdminCust_bulkGrace")}
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => requestBulkUpdateStatus("suspended")} disabled={loading}>
          {t("saasAdminCust_bulkSuspend")}
        </Button>
        <Button type="button" size="sm" onClick={exportCsv} disabled={filteredTenants.length === 0}>
          {t("saasAdminCust_exportCsv")}
        </Button>
      </div>

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

      {tenants.length > 0 ? <div className="grid gap-4 lg:grid-cols-[minmax(380px,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t("saasAdminCust_listTitle")}</CardTitle>
            <CardDescription>
              {tr(t, "saasAdminCust_listDesc", { n: String(filteredTenants.length) })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
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
                  <TableHead>{t("saasAdminCust_colRisk")}</TableHead>
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
                      className={active ? "bg-muted/60" : ""}
                      onClick={() => setSelectedTenantId(tenant.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.includes(tenant.id)}
                          onCheckedChange={(checked) => toggleTenantSelection(tenant.id, Boolean(checked))}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{tenant.companyName}</div>
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
                        <Badge variant={STATUS_VARIANT[tenant.status]}>{saasAdminStatusLabel(tenant.status, t)}</Badge>
                      </TableCell>
                      <TableCell>{expiry ? <Badge variant={expiry.variant}>{expiry.text}</Badge> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                      <TableCell>
                        {risks > 0 ? (
                          <Badge variant="destructive">{tr(t, "saasAdminCust_riskCount", { n: String(risks) })}</Badge>
                        ) : (
                          <Badge variant="outline">{t("saasAdminCust_riskOk")}</Badge>
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

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{selectedTenant.companyName}</CardTitle>
                <CardDescription>{tr(t, "saasAdminCust_tenantIdLine", { id: selectedTenant.id })}</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button asChild size="sm" variant="secondary">
                  <Link href={selectedTenantLoginHref}>{t("saasAdminCust_loginLink")}</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={selectedTenantLoginHref} target="_blank" rel="noopener noreferrer">
                    {t("saasAdminCust_loginNewTab")}
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTenantStatus("active")}>
                  {saasAdminStatusLabel("active", t)}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTenantStatus("grace")}>
                  {saasAdminStatusLabel("grace", t)}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setTenantStatus("suspended")}>
                  {saasAdminStatusLabel("suspended", t)}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={detailTab} onValueChange={onDetailTabChange} className="w-full">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="plan">{t("saasAdminCust_tabPlan")}</TabsTrigger>
                <TabsTrigger value="company">{t("saasAdminCust_tabCompany")}</TabsTrigger>
                <TabsTrigger value="bootstrap">{t("saasAdminCust_tabBootstrap")}</TabsTrigger>
                <TabsTrigger value="limits">{t("saasAdminCust_tabLimits")}</TabsTrigger>
                <TabsTrigger value="policy">{t("saasAdminCust_tabPolicy")}</TabsTrigger>
                <TabsTrigger value="usage">{t("saasAdminCust_tabUsage")}</TabsTrigger>
                <TabsTrigger value="billing">{t("saasAdminCust_tabBilling")}</TabsTrigger>
                <TabsTrigger value="audit">{t("saasAdminCust_tabAudit")}</TabsTrigger>
                <TabsTrigger value="integrations">{t("saasAdminCust_tabIntegrations")}</TabsTrigger>
              </TabsList>

              <TabsContent value="plan" className="space-y-4 pt-2">
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

                <div className="grid gap-3 rounded-md border p-3">
                  <h3 className="text-sm font-semibold">{t("saasAdminCust_featureFlags")}</h3>
                  {SAAS_ADMIN_FEATURE_KEYS.map((featureKey) => (
                    <label key={featureKey} className="flex items-start gap-3 rounded-md border p-3">
                      <Checkbox
                        checked={selectedTenant.features[featureKey]}
                        onCheckedChange={(checked) =>
                          updateTenant((tenant) => {
                            const features = { ...tenant.features, [featureKey]: Boolean(checked) }
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
                      />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{t(`saasAdminFeature_${featureKey}`)}</p>
                        <p className="text-xs text-muted-foreground">{t(`saasAdminFeature_${featureKey}_desc`)}</p>
                      </div>
                    </label>
                  ))}
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

              <TabsContent value="policy" className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">{t("saasAdminCust_policyIntro")}</p>

                {scope.isPlatform ? (
                  <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-end">
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

                <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-end">
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

                <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
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

                <div className="grid gap-3 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{t("saasAdminCust_stagePricing")}</h3>
                    <Badge variant="outline">
                      {tr(t, "saasAdminCust_currentCharge", {
                        amount: selectedTenant.pricing.currentChargeAmount.toLocaleString(),
                        currency: selectedTenant.pricing.currency,
                      })}
                    </Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("saasAdminCust_stageCol")}</TableHead>
                        <TableHead>{t("saasAdminCust_monthlyThb")}</TableHead>
                        <TableHead>{t("saasAdminCust_yearlyThb")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {SAAS_ADMIN_SALES_STAGES.map((stage) => (
                        <TableRow key={stage}>
                          <TableCell>{saasAdminStageLabel(stage, t)}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={selectedTenant.pricing.stagePrices[stage].monthly}
                              onChange={(event) =>
                                updateTenant((tenant) => {
                                  const monthly = Math.max(0, Number(event.target.value || 0))
                                  const stagePrices = {
                                    ...tenant.pricing.stagePrices,
                                    [stage]: {
                                      ...tenant.pricing.stagePrices[stage],
                                      monthly,
                                    },
                                  }
                                  return {
                                    ...tenant,
                                    pricing: recalcTenantPricing(tenant, { stagePrices }),
                                  }
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={selectedTenant.pricing.stagePrices[stage].yearly}
                              onChange={(event) =>
                                updateTenant((tenant) => {
                                  const yearly = Math.max(0, Number(event.target.value || 0))
                                  const stagePrices = {
                                    ...tenant.pricing.stagePrices,
                                    [stage]: {
                                      ...tenant.pricing.stagePrices[stage],
                                      yearly,
                                    },
                                  }
                                  return {
                                    ...tenant,
                                    pricing: recalcTenantPricing(tenant, { stagePrices }),
                                  }
                                })
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid gap-3 rounded-md border p-3">
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
              </TabsContent>

              <TabsContent value="integrations" className="space-y-4 pt-2">
                <SaasAdminTenantIntegrationsPanel
                  tenantId={selectedTenant.id}
                  companyName={selectedTenant.companyName}
                  onIntegrationEnabledChange={(provider, enabled) => {
                    if (!enabled) return
                    updateTenant((tenant) => {
                      const modulePrices = applyIntegrationFlagsToModules(
                        normalizeModulePrices(tenant.pricing.modulePrices),
                        provider === "kbank" ? { kbank: true } : { grab: true }
                      )
                      const features = syncFeaturesFromModules(tenant.features, modulePrices)
                      return {
                        ...tenant,
                        features,
                        pricing: recalcTenantPricing(tenant, { modulePrices }),
                      }
                    })
                  }}
                />
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

              <TabsContent value="bootstrap" className="space-y-4 pt-2">
                {bootstrapHint ? (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                    <p>{t("saasAdminCust_bootstrapBanner")}</p>
                    <Button asChild size="sm" variant="secondary" className="mt-2">
                      <Link href="/saas-admin/onboarding">{t("saasAdminNavOnboarding")}</Link>
                    </Button>
                  </div>
                ) : null}
                <p className="text-sm text-muted-foreground">{t("saasAdminCust_bootstrapIntro")}</p>
                <div className="rounded-md border border-dashed p-4 space-y-3">
                  <p className="text-sm font-medium">
                    {tr(t, "saasAdminCust_selectedTenant", { name: selectedTenant.companyName })}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("saasAdminCust_firstStoreName")}</Label>
                      <Input
                        value={bootStoreName}
                        onChange={(e) => setBootStoreName(e.target.value)}
                        placeholder={t("saasAdminCust_firstStorePh")}
                        autoComplete="off"
                      />
                      <p className="text-xs text-muted-foreground">{t("saasAdminCust_firstStoreHint")}</p>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("saasAdmin_storeCodeOptional")}</Label>
                      <Input
                        value={bootStoreCode}
                        onChange={(e) => setBootStoreCode(e.target.value)}
                        placeholder={t("saasAdmin_autoGenerate")}
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("saasAdminCust_adminDisplayName")}</Label>
                      <Input
                        value={bootAdminName}
                        onChange={(e) => setBootAdminName(e.target.value)}
                        placeholder={t("saasAdminCust_adminDisplayPh")}
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("saasAdmin_password")}</Label>
                      <Input
                        type="password"
                        value={bootPw}
                        onChange={(e) => setBootPw(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>{t("saasAdmin_passwordConfirm")}</Label>
                      <Input
                        type="password"
                        value={bootPw2}
                        onChange={(e) => setBootPw2(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <Button type="button" onClick={() => void bootstrapTenantLogin()} disabled={loading}>
                    {t("saasAdminCust_bootstrapCreate")}
                  </Button>
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

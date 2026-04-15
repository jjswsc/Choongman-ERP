"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
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
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_LIMITS_BY_TIER,
  DEFAULT_POLICY,
  DEFAULT_STAGE_PRICES,
  FALLBACK_TENANTS,
  resolveCurrentChargeAmount,
  SALES_STAGE_LABEL,
  type BillingCycle,
  type PlanTier,
  type SalesStage,
  type SupportTier,
  type TenantItem,
} from "@/lib/saas-admin-control-plane"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const PLAN_LABEL: Record<PlanTier, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
}

const STATUS_LABEL = {
  trial: "체험중",
  active: "정상",
  grace: "유예중",
  suspended: "정지",
}

const STATUS_VARIANT = {
  trial: "secondary",
  active: "default",
  grace: "outline",
  suspended: "destructive",
} as const

const FEATURE_LABELS: { key: keyof TenantItem["features"]; label: string; desc: string }[] = [
  { key: "pos", label: "POS 주문/결제", desc: "매장 주문, 결제, 영수증 출력" },
  { key: "kitchenDisplay", label: "주방 디스플레이", desc: "주문 티켓/주방 프린트 관리" },
  { key: "inventory", label: "재고관리", desc: "입출고/재고 대시보드" },
  { key: "payroll", label: "급여관리", desc: "근태/급여 계산" },
  { key: "accounting", label: "회계/정산", desc: "매출/입출금/정산" },
  { key: "analytics", label: "리포트 분석", desc: "지점/기간별 KPI 분석" },
  { key: "marketing", label: "마케팅", desc: "캠페인/소재/성과 관리" },
  { key: "aiAssistant", label: "AI 도우미", desc: "AI 질의 및 자동 추천" },
  { key: "apiAccess", label: "외부 API 연동", desc: "Webhook/API Key 발급" },
  { key: "sso", label: "SSO 로그인", desc: "SAML/OIDC 기반 로그인" },
]

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

function formatBangkokDateTime(value: string): string {
  const text = String(value || "").trim()
  if (!text) return "-"
  const dt = new Date(text)
  if (Number.isNaN(dt.getTime())) return text
  return dt.toLocaleString("ko-KR", { timeZone: "Asia/Bangkok", hour12: false })
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
  return rows.map((row) => ({
    ...row,
    policy: {
      ...row.policy,
      salesStage: row.policy?.salesStage || "basic",
    },
    billingHistory: Array.isArray(row.billingHistory) ? row.billingHistory : [],
    auditTrail: Array.isArray(row.auditTrail) ? row.auditTrail : [],
  }))
}

function getExpiryInfo(tenant: TenantItem): { text: string; variant: "destructive" | "outline" | "secondary" } | null {
  const base = tenant.status === "trial" ? tenant.trialEndsAt : tenant.nextBillingDate
  const d = diffDaysFromTodayBangkok(base)
  if (d == null) return null
  if (d < 0) return { text: `${Math.abs(d)}일 지남`, variant: "destructive" }
  if (d === 0) return { text: "오늘 만료", variant: "destructive" }
  if (d <= 3) return { text: `${d}일 남음`, variant: "outline" }
  if (d <= 7) return { text: `${d}일 남음`, variant: "secondary" }
  return null
}

function escapeCsv(value: unknown): string {
  const s = String(value ?? "")
  if (!/[",\n]/.test(s)) return s
  return `"${s.replace(/"/g, '""')}"`
}

export default function SaasCustomersPage() {
  const fallbackTenant = FALLBACK_TENANTS[0]!
  const [tenants, setTenants] = useState<TenantItem[]>(FALLBACK_TENANTS)
  const [selectedTenantId, setSelectedTenantId] = useState<string>(fallbackTenant.id)
  const [loading, setLoading] = useState(false)
  const [loadNotice, setLoadNotice] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | TenantItem["status"]>("all")
  const [openCreate, setOpenCreate] = useState(false)
  const [newTenantId, setNewTenantId] = useState("")
  const [newTenantName, setNewTenantName] = useState("")
  const [newOwnerName, setNewOwnerName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [expiryOnly, setExpiryOnly] = useState(false)
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

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0] ?? fallbackTenant,
    [selectedTenantId, tenants, fallbackTenant]
  )

  const filteredTenants = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const rows = tenants.filter((tenant) => {
      if (statusFilter !== "all" && tenant.status !== statusFilter) return false
      if (!keyword) return true
      const bundle = `${tenant.id} ${tenant.companyName} ${tenant.ownerName} ${tenant.phone}`.toLowerCase()
      return bundle.includes(keyword)
    })
    const withExpiry = expiryOnly ? rows.filter((x) => getExpiryInfo(x) != null) : rows
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
  }, [expiryOnly, search, sortBy, statusFilter, tenants])

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
        throw new Error(json.message || "고객사 설정을 불러오지 못했습니다.")
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
      setLoadNotice(json.fallback ? json.message || "샘플 데이터로 표시 중입니다." : "")
    } catch (error) {
      const msg = String(error)
      setLoadNotice(`불러오기 실패: ${msg}`)
      setTenants(FALLBACK_TENANTS)
      setSelectedTenantId(FALLBACK_TENANTS[0]!.id)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTenants()
  }, [loadTenants])

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
      throw new Error(json.message || "저장에 실패했습니다.")
    }
  }

  const saveTenantSettings = async () => {
    setLoading(true)
    try {
      await persistTenant(selectedTenant)
      await appAlert(`[${selectedTenant.companyName}] 설정을 저장했습니다.`)
      await loadTenants()
    } catch (error) {
      await appAlert(`저장 실패: ${String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const createTenant = async () => {
    const id = newTenantId.trim().toLowerCase()
    const name = newTenantName.trim()
    if (!id || !name) {
      await appAlert("고객사 ID와 고객사명은 필수입니다.")
      return
    }
    if (!/^[a-z0-9_-]{3,40}$/.test(id)) {
      await appAlert("고객사 ID는 영문 소문자/숫자/_/-만 사용하고 3~40자로 입력해 주세요.")
      return
    }
    if (tenants.some((x) => x.id === id)) {
      await appAlert("이미 존재하는 고객사 ID입니다.")
      return
    }
    const draft: TenantItem = {
      id,
      companyName: name,
      ownerName: newOwnerName.trim() || "-",
      phone: newPhone.trim() || "-",
      planTier: "starter",
      billingCycle: "monthly",
      status: "trial",
      nextBillingDate: "",
      trialEndsAt: "",
      timezone: "Asia/Bangkok",
      features: { ...DEFAULT_FEATURE_FLAGS },
      limits: { ...DEFAULT_LIMITS_BY_TIER.starter },
      policy: { ...DEFAULT_POLICY },
      usage: {
        stores: 0,
        managerAccounts: 0,
        staffAccounts: 0,
        tablets: 0,
        posDevices: 0,
        monthlyOrders: 0,
      },
      pricing: {
        currency: "THB",
        stagePrices: { ...DEFAULT_STAGE_PRICES },
        currentChargeAmount: resolveCurrentChargeAmount(
          DEFAULT_POLICY.salesStage,
          "monthly",
          DEFAULT_STAGE_PRICES
        ),
      },
      billingHistory: [],
      auditTrail: [],
    }

    setLoading(true)
    try {
      await persistTenant(draft)
      await appAlert(`[${draft.companyName}] 고객사를 생성했습니다.`)
      setOpenCreate(false)
      setNewTenantId("")
      setNewTenantName("")
      setNewOwnerName("")
      setNewPhone("")
      await loadTenants()
      setSelectedTenantId(id)
    } catch (error) {
      await appAlert(`고객사 생성 실패: ${String(error)}`)
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
      await appAlert("첫 매장명, 관리자 표시 이름, 비밀번호를 모두 입력해 주세요.")
      return
    }
    if (pw.length < 4) {
      await appAlert("비밀번호는 4자 이상으로 입력해 주세요.")
      return
    }
    if (pw !== pw2) {
      await appAlert("비밀번호 확인이 일치하지 않습니다.")
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
        await appAlert(json.message || "초기 계정 생성에 실패했습니다.")
        return
      }
      await appAlert(
        `로그인 안내: 회사「${json.companyName || selectedTenant.companyName}」·매장「${storeName}」·이름「${adminName}」로 /login 또는 /admin/login 에서 로그인할 수 있습니다.`
      )
      setBootStoreName("")
      setBootStoreCode("")
      setBootAdminName("")
      setBootPw("")
      setBootPw2("")
      await loadTenants()
    } catch (error) {
      await appAlert(`오류: ${String(error)}`)
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
      await appAlert("먼저 일괄 변경할 고객사를 선택해 주세요.")
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
      await appAlert(`${targets.length}개 고객사의 상태를 ${STATUS_LABEL[status]}(으)로 변경했습니다.`)
      await loadTenants()
    } catch (error) {
      await appAlert(`일괄 상태 변경 실패: ${String(error)}`)
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
          formatBangkokDateTime(row.changedAt),
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
          <h1 className="text-2xl font-semibold">고객사 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            요금제, 기능 권한, 계정 허용량, 태블릿/POS 단말, 과금/보안 정책을 통합 관리합니다.
          </p>
          {loadNotice ? <p className="mt-2 text-xs text-amber-600">{loadNotice}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setOpenCreate(true)} disabled={loading}>
            신규 고객사 추가
          </Button>
          <Button type="button" onClick={saveTenantSettings} disabled={loading || tenants.length === 0}>
            현재 설정 저장
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">전체 고객사</p>
            <p className="text-2xl font-semibold">{tenants.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">정상/체험</p>
            <p className="text-2xl font-semibold">{stats.active + stats.trial}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">유예</p>
            <p className="text-2xl font-semibold">{stats.grace}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">정지</p>
            <p className="text-2xl font-semibold">{stats.suspended}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">한도 위험 고객사</p>
            <p className="text-2xl font-semibold">{stats.highRisk}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">이번달 주문합계</p>
            <p className="text-2xl font-semibold">{stats.totalOrders.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-2">
          <Label>고객사 검색</Label>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="고객사명/ID/담당자/전화번호 검색"
          />
        </div>
        <div className="space-y-2">
          <Label>상태 필터</Label>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | TenantItem["status"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="active">정상</SelectItem>
              <SelectItem value="trial">체험중</SelectItem>
              <SelectItem value="grace">유예중</SelectItem>
              <SelectItem value="suspended">정지</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>정렬</Label>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as "default" | "risk_desc" | "expiry_soon")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">기본순</SelectItem>
              <SelectItem value="risk_desc">위험도 높은 순</SelectItem>
              <SelectItem value="expiry_soon">만료 임박 순</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>빠른 조건</Label>
          <label className="flex h-9 items-center gap-2 rounded-md border px-3">
            <Checkbox checked={expiryOnly} onCheckedChange={(checked) => setExpiryOnly(Boolean(checked))} />
            <span className="text-sm">만료예정 고객만 보기</span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => requestBulkUpdateStatus("active")} disabled={loading}>
          선택 고객사 정상 전환
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => requestBulkUpdateStatus("grace")} disabled={loading}>
          선택 고객사 유예 전환
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => requestBulkUpdateStatus("suspended")} disabled={loading}>
          선택 고객사 정지 전환
        </Button>
        <Button type="button" size="sm" onClick={exportCsv} disabled={filteredTenants.length === 0}>
          CSV 내보내기
        </Button>
      </div>

      {tenants.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              등록된 고객사가 없습니다. 먼저 `tenants`/`tenant_subscriptions` 데이터를 생성해 주세요.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {tenants.length > 0 ? <div className="grid gap-4 lg:grid-cols-[minmax(380px,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">고객사 목록</CardTitle>
            <CardDescription>
              실 고객사 운영 상태와 구독 상태를 확인하고 편집 대상을 선택합니다. ({filteredTenants.length}개 표시)
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
                  <TableHead>고객사</TableHead>
                  <TableHead>요금제</TableHead>
                  <TableHead>판매단계</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>만료예정</TableHead>
                  <TableHead>위험</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((tenant) => {
                  const active = tenant.id === selectedTenant.id
                  const risks = tenantRiskCount(tenant)
                  const expiry = getExpiryInfo(tenant)
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
                      <TableCell>{PLAN_LABEL[tenant.planTier]}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{SALES_STAGE_LABEL[tenant.policy.salesStage]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[tenant.status]}>{STATUS_LABEL[tenant.status]}</Badge>
                      </TableCell>
                      <TableCell>{expiry ? <Badge variant={expiry.variant}>{expiry.text}</Badge> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                      <TableCell>
                        {risks > 0 ? <Badge variant="destructive">{risks}건</Badge> : <Badge variant="outline">정상</Badge>}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredTenants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      검색/필터 조건에 맞는 고객사가 없습니다.
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
                <CardDescription>테넌트 ID: {selectedTenant.id}</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button asChild size="sm" variant="secondary">
                  <Link href={selectedTenantLoginHref}>회사 로그인 바로가기</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={selectedTenantLoginHref} target="_blank" rel="noopener noreferrer">
                    로그인 새 탭
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTenantStatus("active")}>
                  정상
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTenantStatus("grace")}>
                  유예
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setTenantStatus("suspended")}>
                  정지
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="plan" className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="plan">요금제/기능</TabsTrigger>
                <TabsTrigger value="limits">허용량/단말</TabsTrigger>
                <TabsTrigger value="policy">운영정책</TabsTrigger>
                <TabsTrigger value="usage">실사용량</TabsTrigger>
                <TabsTrigger value="billing">과금이력</TabsTrigger>
                <TabsTrigger value="audit">변경이력</TabsTrigger>
                <TabsTrigger value="bootstrap">초기 로그인</TabsTrigger>
              </TabsList>

              <TabsContent value="plan" className="space-y-4 pt-2">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>요금제 티어</Label>
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
                    <Label>과금 주기</Label>
                    <Select
                      value={selectedTenant.billingCycle}
                      onValueChange={(value) =>
                        updateTenant((tenant) => ({ ...tenant, billingCycle: value as BillingCycle }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">월간 과금</SelectItem>
                        <SelectItem value="yearly">연간 과금</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>다음 청구일</Label>
                    <Input
                      type="date"
                      value={selectedTenant.nextBillingDate}
                      onChange={(event) =>
                        updateTenant((tenant) => ({ ...tenant, nextBillingDate: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>체험 종료일</Label>
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
                  <h3 className="text-sm font-semibold">기능 토글 (Feature Flag)</h3>
                  {FEATURE_LABELS.map((feature) => (
                    <label key={feature.key} className="flex items-start gap-3 rounded-md border p-3">
                      <Checkbox
                        checked={selectedTenant.features[feature.key]}
                        onCheckedChange={(checked) =>
                          updateTenant((tenant) => ({
                            ...tenant,
                            features: { ...tenant.features, [feature.key]: Boolean(checked) },
                          }))
                        }
                      />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{feature.label}</p>
                        <p className="text-xs text-muted-foreground">{feature.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="limits" className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  실제 운영 중 가장 많이 요청되는 제한값(계정 수, 태블릿 수, POS 단말 수, API 키 수)을 고객사별로 조정합니다.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>매장 허용 개수</Label>
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
                    <Label>매니저 계정 허용 개수</Label>
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
                    <Label>일반 직원 계정 허용 개수</Label>
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
                    <Label>태블릿 허용 개수</Label>
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
                    <Label>POS 단말 허용 개수</Label>
                    <Input
                      type="number"
                      min={1}
                      value={selectedTenant.limits.maxPosDevices}
                      onChange={(event) =>
                        updateTenant((tenant) => ({
                          ...tenant,
                          limits: { ...tenant.limits, maxPosDevices: Number(event.target.value || 0) },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>API Key 허용 개수</Label>
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
                    <Label>월 주문량 제한</Label>
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
                <p className="text-sm text-muted-foreground">
                  단순 요금제 외에 연체 대응/보안 기준/백업/데이터 보존 정책을 고객사별로 차등 적용합니다.
                </p>

                <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <Label>판매 단계(패키지)</Label>
                    <Select
                      value={selectedTenant.policy.salesStage}
                      onValueChange={(value) =>
                        updateTenant((tenant) => ({ ...tenant, policy: { ...tenant.policy, salesStage: value as SalesStage } }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">{SALES_STAGE_LABEL.basic}</SelectItem>
                        <SelectItem value="payment">{SALES_STAGE_LABEL.payment}</SelectItem>
                        <SelectItem value="delivery">{SALES_STAGE_LABEL.delivery}</SelectItem>
                        <SelectItem value="erp1">{SALES_STAGE_LABEL.erp1}</SelectItem>
                        <SelectItem value="erp2">{SALES_STAGE_LABEL.erp2}</SelectItem>
                        <SelectItem value="ai">{SALES_STAGE_LABEL.ai}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      updateTenant((tenant) => ({
                        ...tenant,
                        features: applySalesStageFeatures(tenant.features, tenant.policy.salesStage),
                      }))
                    }
                  >
                    단계 기능 자동 적용
                  </Button>
                </div>

                <div className="grid gap-3 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">단계별 가격표 (고객사 커스텀)</h3>
                    <Badge variant="outline">
                      현재 청구 예상: {selectedTenant.pricing.currentChargeAmount.toLocaleString()}{" "}
                      {selectedTenant.pricing.currency}
                    </Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>단계</TableHead>
                        <TableHead>월간 청구(THB)</TableHead>
                        <TableHead>연간 청구(THB)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(["basic", "payment", "delivery", "erp1", "erp2", "ai"] as SalesStage[]).map((stage) => (
                        <TableRow key={stage}>
                          <TableCell>{SALES_STAGE_LABEL[stage]}</TableCell>
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
                                    pricing: {
                                      ...tenant.pricing,
                                      stagePrices,
                                      currentChargeAmount: resolveCurrentChargeAmount(
                                        tenant.policy.salesStage,
                                        tenant.billingCycle,
                                        stagePrices
                                      ),
                                    },
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
                                    pricing: {
                                      ...tenant.pricing,
                                      stagePrices,
                                      currentChargeAmount: resolveCurrentChargeAmount(
                                        tenant.policy.salesStage,
                                        tenant.billingCycle,
                                        stagePrices
                                      ),
                                    },
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
                    연체 시 자동 정지
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
                    허용량 초과 사용 허용 (후불 청구)
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
                    관리자 2차 인증(2FA) 필수
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
                    허용 IP 목록(Allowlist) 필수
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
                    주간 백업 강제
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>연체 유예일</Label>
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
                    <Label>데이터 보존일</Label>
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
                    <Label>지원 등급</Label>
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
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="priority">Priority</SelectItem>
                        <SelectItem value="dedicated">Dedicated CSM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="bootstrap" className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">tenants</code>에 등록된 고객사명과 동일한{" "}
                  <strong>회사명</strong>으로 로그인할 수 있게, 첫 매장(
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">erp_stores</code>)과 초기 관리자(
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">employees</code>)를 만듭니다. 이미 해당 테넌트에 직원이 있으면
                  생성할 수 없습니다.
                </p>
                <div className="rounded-md border border-dashed p-4 space-y-3">
                  <p className="text-sm font-medium">선택 고객사: {selectedTenant.companyName}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>첫 매장명</Label>
                      <Input
                        value={bootStoreName}
                        onChange={(e) => setBootStoreName(e.target.value)}
                        placeholder='예: 본사, HQ'
                        autoComplete="off"
                      />
                      <p className="text-xs text-muted-foreground">로그인 화면의 「매장」에 그대로 입력합니다.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>매장 코드 (선택)</Label>
                      <Input
                        value={bootStoreCode}
                        onChange={(e) => setBootStoreCode(e.target.value)}
                        placeholder="비우면 자동 생성"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>관리자 표시 이름</Label>
                      <Input
                        value={bootAdminName}
                        onChange={(e) => setBootAdminName(e.target.value)}
                        placeholder="로그인 이름과 동일"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>비밀번호</Label>
                      <Input
                        type="password"
                        value={bootPw}
                        onChange={(e) => setBootPw(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>비밀번호 확인</Label>
                      <Input
                        type="password"
                        value={bootPw2}
                        onChange={(e) => setBootPw2(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <Button type="button" onClick={() => void bootstrapTenantLogin()} disabled={loading}>
                    첫 매장·초기 관리자 생성
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="usage" className="space-y-4 pt-2">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">매장 사용량</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <UsageBar current={selectedTenant.usage.stores} max={selectedTenant.limits.maxStores} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">매니저 계정 사용량</CardTitle>
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
                      <CardTitle className="text-sm">직원 계정 사용량</CardTitle>
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
                      <CardTitle className="text-sm">태블릿 사용량</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <UsageBar current={selectedTenant.usage.tablets} max={selectedTenant.limits.maxTablets} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">POS 단말 사용량</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <UsageBar current={selectedTenant.usage.posDevices} max={selectedTenant.limits.maxPosDevices} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">월 주문량 사용량</CardTitle>
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
                <p className="text-sm text-muted-foreground">청구/결제/수정 이벤트를 최신순으로 표시합니다.</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>시각(방콕)</TableHead>
                      <TableHead>이벤트</TableHead>
                      <TableHead>금액</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>메모</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTenant.billingHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          과금 이력이 없습니다.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedTenant.billingHistory.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{formatBangkokDateTime(row.happenedAt)}</TableCell>
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
                  <p className="text-sm text-muted-foreground">누가 어떤 설정을 바꿨는지 감사 로그를 확인합니다.</p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={auditFilter === "all" ? "default" : "outline"}
                      onClick={() => setAuditFilter("all")}
                    >
                      전체
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={auditFilter === "employee_only" ? "default" : "outline"}
                      onClick={() => setAuditFilter("employee_only")}
                    >
                      직원 변경만
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={exportAuditCsv} disabled={filteredAuditTrail.length === 0}>
                      CSV 내보내기
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
                    기간 전체
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={auditPeriod === "today" ? "default" : "outline"}
                    onClick={() => setAuditPeriod("today")}
                  >
                    오늘
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={auditPeriod === "7d" ? "default" : "outline"}
                    onClick={() => setAuditPeriod("7d")}
                  >
                    최근 7일
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={auditPeriod === "30d" ? "default" : "outline"}
                    onClick={() => setAuditPeriod("30d")}
                  >
                    최근 30일
                  </Button>
                </div>
                <div className="max-w-sm space-y-1">
                  <Label>작업자 검색</Label>
                  <Input
                    value={auditActorQuery}
                    onChange={(e) => setAuditActorQuery(e.target.value)}
                    placeholder="작업자 이름/역할 검색"
                  />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>시각(방콕)</TableHead>
                      <TableHead>액션</TableHead>
                      <TableHead>작업자</TableHead>
                      <TableHead>요약</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAuditTrail.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          {auditFilter === "employee_only" ? "직원 변경 이력이 없습니다." : "변경 이력이 없습니다."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAuditTrail.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{formatBangkokDateTime(row.changedAt)}</TableCell>
                          <TableCell>{row.action}</TableCell>
                          <TableCell>
                            {row.actorName} ({row.actorRole})
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{row.summary || "-"}</span>
                              {row.employeeId ? (
                                <Button asChild type="button" size="sm" variant="outline" className="h-6 px-2 text-xs">
                                  <Link href={employeeAuditLink(row.employeeId)}>직원#{row.employeeId}</Link>
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
            <DialogTitle>일괄 상태 변경 확인</DialogTitle>
            <DialogDescription>
              선택된 {selectedIds.length}개 고객사의 상태를{" "}
              {bulkPendingStatus ? STATUS_LABEL[bulkPendingStatus] : "-"}(으)로 변경합니다. 계속하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkConfirmOpen(false)}>
              취소
            </Button>
            <Button
              type="button"
              variant={bulkPendingStatus === "suspended" ? "destructive" : "default"}
              onClick={bulkUpdateStatus}
              disabled={loading}
            >
              확인 후 적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>신규 고객사 추가</DialogTitle>
            <DialogDescription>기본 플랜(Starter/월간)으로 고객사를 생성한 뒤 상세 정책을 조정하세요.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>고객사 ID</Label>
              <Input value={newTenantId} onChange={(e) => setNewTenantId(e.target.value)} placeholder="예: omni-kr-001" />
            </div>
            <div className="space-y-1">
              <Label>고객사명</Label>
              <Input value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} placeholder="예: CM Bangkok 1호점" />
            </div>
            <div className="space-y-1">
              <Label>담당자명</Label>
              <Input value={newOwnerName} onChange={(e) => setNewOwnerName(e.target.value)} placeholder="선택 입력" />
            </div>
            <div className="space-y-1">
              <Label>연락처</Label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="선택 입력" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
              취소
            </Button>
            <Button type="button" onClick={createTenant} disabled={loading}>
              생성 후 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

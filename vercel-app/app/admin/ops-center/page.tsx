"use client"

import * as React from "react"
import Link from "next/link"
import { LayoutDashboard, RotateCw } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { useStoreList } from "@/lib/api-client"
import { useStoreView, filterOperationalStorePickerOptions } from "@/lib/store-view-context"
import { SalesSubnav } from "@/components/erp/sales-subnav"
import { SalesPageHeader } from "@/components/erp/sales-page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { ADMIN_NUMERIC_CN } from "@/lib/admin-ui-standards"

type OpsKpi = {
  orderSuccess: number
  orderFailed: number
  paymentFailed: number
  printFailed: number
  printQueued: number
  closePending: number
}

type OpsAlert = {
  code: string
  severity: "warning" | "critical"
  message: string
}

type HqStoreScore = {
  storeCode: string
  printFailed: number
  printQueued: number
  closePending: number
  score: number
}

function alertActionHref(code: string): string | null {
  if (code === "PRINT_FAILED" || code === "PRINT_BACKLOG") return "/admin/pos-printers"
  if (code === "CLOSE_PENDING") return "/admin/pos-settlement"
  return null
}

export default function AdminOpsCenterPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { viewStore, setViewStore } = useStoreView()
  const { stores, formatStoreLabel, loading: storesLoading } = useStoreList()

  const isOfficeSelector =
    Boolean(auth) && (isOfficeRole(auth?.role || "") || isOfficeStore(auth?.store || ""))

  const branchStores = React.useMemo(() => filterOperationalStorePickerOptions(stores), [stores])

  const [opsStoreCode, setOpsStoreCode] = React.useState("")

  React.useEffect(() => {
    if (!isOfficeSelector || branchStores.length === 0) return
    setOpsStoreCode((prev) => {
      if (prev && branchStores.includes(prev)) return prev
      const fromView = String(viewStore || "").trim()
      if (fromView && fromView !== "All" && branchStores.includes(fromView)) return fromView
      return branchStores[0]
    })
  }, [isOfficeSelector, branchStores, viewStore])

  const apiStoreCode = React.useMemo(() => {
    if (!isOfficeSelector) {
      return String(auth?.store || "").trim()
    }
    return opsStoreCode.trim()
  }, [isOfficeSelector, auth?.store, opsStoreCode])

  const franchiseStoreLabel = React.useMemo(() => {
    const code = String(auth?.store || "").trim()
    if (!code) return ""
    return formatStoreLabel(code) || code
  }, [auth?.store, formatStoreLabel])

  const [date, setDate] = React.useState(() => getBangkokTodayDateString())
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [kpi, setKpi] = React.useState<OpsKpi | null>(null)
  const [alerts, setAlerts] = React.useState<OpsAlert[]>([])
  const [hqStores, setHqStores] = React.useState<HqStoreScore[]>([])
  const [hqLoading, setHqLoading] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (isOfficeSelector && !apiStoreCode.trim()) {
        if (storesLoading) {
          setKpi(null)
          setAlerts([])
          setLoading(false)
          return
        }
        setLoadError(t("adminOpsCenterNeedBranchStore"))
        setKpi(null)
        setAlerts([])
        setLoading(false)
        return
      }

      const qs = new URLSearchParams()
      qs.set("date", date.slice(0, 10))
      if (apiStoreCode.trim()) {
        qs.set("storeCode", apiStoreCode.trim())
      }
      const q = qs.toString()
      const [kpiRes, alertRes] = await Promise.all([
        fetch(`/api/ops/kpi?${q}`, { cache: "no-store", credentials: "same-origin" }),
        fetch(`/api/ops/alerts?${q}`, { cache: "no-store", credentials: "same-origin" }),
      ])
      const kpiJson = (await kpiRes.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        kpi?: OpsKpi
      }
      const alertJson = (await alertRes.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        alerts?: OpsAlert[]
      }
      if (!kpiRes.ok || kpiJson.success === false) {
        setLoadError(String(kpiJson.message || kpiRes.statusText || t("adminOpsCenterLoadError")))
        setKpi(null)
        setAlerts([])
        return
      }
      if (!alertRes.ok || alertJson.success === false) {
        setLoadError(String(alertJson.message || alertRes.statusText || t("adminOpsCenterLoadError")))
        setKpi(kpiJson.kpi || null)
        setAlerts([])
        return
      }
      setKpi(kpiJson?.kpi || null)
      setAlerts(Array.isArray(alertJson?.alerts) ? alertJson.alerts : [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("adminOpsCenterLoadError"))
      setKpi(null)
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }, [date, apiStoreCode, isOfficeSelector, storesLoading, t])

  const loadHqSummary = React.useCallback(async () => {
    if (!isOfficeSelector) {
      setHqStores([])
      return
    }
    setHqLoading(true)
    try {
      const qs = new URLSearchParams({ date: date.slice(0, 10), limit: "8" })
      const res = await fetch(`/api/ops/hq-summary?${qs}`, {
        cache: "no-store",
        credentials: "same-origin",
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        stores?: HqStoreScore[]
      }
      setHqStores(res.ok && json.success && Array.isArray(json.stores) ? json.stores : [])
    } catch {
      setHqStores([])
    } finally {
      setHqLoading(false)
    }
  }, [date, isOfficeSelector])

  React.useEffect(() => {
    void load()
    void loadHqSummary()
  }, [load, loadHqSummary])

  const kpiTiles: { key: keyof OpsKpi; label: string; tone?: "danger" | "warning" }[] = [
    { key: "orderSuccess", label: t("adminOpsCenterKpiOrderSuccess") },
    { key: "orderFailed", label: t("adminOpsCenterKpiOrderFailed"), tone: "warning" },
    { key: "paymentFailed", label: t("adminOpsCenterKpiPaymentFailed"), tone: "danger" },
    { key: "printFailed", label: t("adminOpsCenterKpiPrintFailed"), tone: "danger" },
    { key: "printQueued", label: t("adminOpsCenterKpiPrintQueued"), tone: "warning" },
    { key: "closePending", label: t("adminOpsCenterKpiClosePending"), tone: "warning" },
  ]

  const alertHint = (code: string) => {
    if (code === "PRINT_FAILED") return t("adminOpsCenterAlertPrintFailed")
    if (code === "PRINT_BACKLOG") return t("adminOpsCenterAlertPrintBacklog")
    if (code === "CLOSE_PENDING") return t("adminOpsCenterAlertClosePending")
    return ""
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <SalesSubnav />
        <SalesPageHeader
          href="/admin/ops-center"
          title={tOr(t, "adminOpsCenterTitle", t("adminOpsCenter"))}
          subtitle={t("adminOpsCenterSub")}
          icon={LayoutDashboard}
          actions={
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                void load()
                void loadHqSummary()
              }}
              disabled={loading}
            >
              <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {t("adminOpsCenterReload")}
            </Button>
          }
        />

        <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card/40 p-4">
          {isOfficeSelector ? (
            <div className="grid gap-2">
              <Label htmlFor="ops-center-store" className="text-xs text-muted-foreground">
                {t("adminOpsCenterStoreLabel")}
              </Label>
              {storesLoading && branchStores.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("adminOpsCenterStoreLoading")}</p>
              ) : branchStores.length === 0 ? (
                <p className="text-sm text-destructive">{t("adminOpsCenterNeedBranchStore")}</p>
              ) : (
                <Select
                  value={opsStoreCode || branchStores[0]}
                  onValueChange={(code) => {
                    setOpsStoreCode(code)
                    setViewStore(code)
                  }}
                >
                  <SelectTrigger id="ops-center-store" className="h-9 w-[min(100%,14rem)] text-sm">
                    <SelectValue placeholder={t("adminOpsCenterStoreLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {branchStores.map((code) => (
                      <SelectItem key={code} value={code}>
                        {formatStoreLabel(code) || code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : franchiseStoreLabel ? (
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">{t("adminOpsCenterStoreLabel")}</Label>
              <p className="text-sm font-medium">{franchiseStoreLabel}</p>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="ops-center-date" className="text-xs text-muted-foreground">
              {t("adminOpsCenterDateLabel")}
            </Label>
            <Input
              id="ops-center-date"
              type="date"
              className="w-[11rem]"
              value={date.slice(0, 10)}
              onChange={(e) => setDate(e.target.value.slice(0, 10))}
            />
          </div>
        </div>

        {loadError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        {isOfficeSelector ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("adminOpsCenterHqSummaryTitle")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("adminOpsCenterHqSummarySub")}</p>
            </CardHeader>
            <CardContent>
              {hqLoading ? (
                <p className="text-sm text-muted-foreground">{t("loading")}</p>
              ) : hqStores.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("adminOpsCenterNoAlerts")}</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {hqStores.map((s) => (
                    <li
                      key={s.storeCode}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <Link
                        href={`/admin/ops-center?store=${encodeURIComponent(s.storeCode)}`}
                        className="font-medium hover:underline"
                        onClick={(e) => {
                          e.preventDefault()
                          setOpsStoreCode(s.storeCode)
                          setViewStore(s.storeCode)
                        }}
                      >
                        {formatStoreLabel(s.storeCode) || s.storeCode}
                      </Link>
                      <span className={`text-xs text-muted-foreground ${ADMIN_NUMERIC_CN}`}>
                        {t("adminOpsCenterKpiPrintFailed")} {s.printFailed} ·{" "}
                        {t("adminOpsCenterKpiPrintQueued")} {s.printQueued} ·{" "}
                        {t("adminOpsCenterKpiClosePending")} {s.closePending}
                      </span>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/admin/live-store-sales">{t("adminOpsCenterLinkLiveSales")}</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {kpiTiles.map(({ key, label, tone }) => {
            const value = kpi?.[key] ?? 0
            const highlight =
              tone === "danger" && value > 0
                ? "border-destructive/40 bg-destructive/5"
                : tone === "warning" && value > 0
                  ? "border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20"
                  : ""
            return (
              <Card key={key} className={highlight}>
                <CardHeader className="pb-1 pt-3">
                  <CardTitle className="text-[11px] font-medium text-muted-foreground leading-snug">
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className={`pb-3 text-2xl font-semibold ${ADMIN_NUMERIC_CN}`}>
                  {Number(value).toLocaleString()}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("adminOpsCenterAlertsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("adminOpsCenterNoAlerts")}</p>
            ) : (
              <ul className="space-y-2">
                {alerts.map((a) => {
                  const href = alertActionHref(a.code)
                  const hint = alertHint(a.code)
                  return (
                    <li
                      key={`${a.code}-${a.message}`}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        a.severity === "critical"
                          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            [{a.code}] {a.message}
                          </p>
                          {hint ? <p className="mt-1 text-xs opacity-90">{hint}</p> : null}
                        </div>
                        {href ? (
                          <Button asChild size="sm" variant="secondary">
                            <Link href={href}>
                              {a.code.startsWith("PRINT")
                                ? t("adminOpsCenterLinkPosPrinters")
                                : t("adminOpsCenterLinkPosSettlement")}
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("adminOpsCenterQuickLinksTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/live-store-sales">{t("adminOpsCenterLinkLiveSales")}</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/pos-settlement">{t("adminOpsCenterLinkSettlement")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/pos-printers">{t("adminOpsCenterLinkPosPrinters")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/sales-management">{t("adminSalesManagement")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

"use client"

import * as React from "react"
import Link from "next/link"
import { LayoutDashboard, RotateCw } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { useStoreView } from "@/lib/store-view-context"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { HelpSumHowBlocks } from "@/components/erp/help-sum-how-blocks"
import { hrefToHelpSummaryKey } from "@/lib/admin-help-registry"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"

const OPS_CENTER_HELP_SUM = hrefToHelpSummaryKey("/admin/ops-center")

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

export default function AdminOpsCenterPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { viewStore } = useStoreView()

  const isOfficeSelector =
    Boolean(auth) && (isOfficeRole(auth?.role || "") || isOfficeStore(auth?.store || ""))

  const effectiveStoreCode = React.useMemo(() => {
    if (isOfficeSelector && viewStore) return viewStore.trim()
    return (auth?.store || "").trim()
  }, [isOfficeSelector, viewStore, auth?.store])

  const [date, setDate] = React.useState(() => getBangkokTodayDateString())
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [kpi, setKpi] = React.useState<OpsKpi | null>(null)
  const [alerts, setAlerts] = React.useState<OpsAlert[]>([])

  const scopeLabel =
    effectiveStoreCode === "All" || !effectiveStoreCode
      ? t("store_all_stores")
      : effectiveStoreCode || "—"

  const load = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const qs = new URLSearchParams()
      qs.set("date", date.slice(0, 10))
      if (effectiveStoreCode && effectiveStoreCode !== "All") {
        qs.set("storeCode", effectiveStoreCode)
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
  }, [date, effectiveStoreCode, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const kpiTiles: [string, number][] = [
    [t("adminOpsCenterKpiOrderSuccess"), kpi?.orderSuccess ?? 0],
    [t("adminOpsCenterKpiOrderFailed"), kpi?.orderFailed ?? 0],
    [t("adminOpsCenterKpiPaymentFailed"), kpi?.paymentFailed ?? 0],
    [t("adminOpsCenterKpiPrintFailed"), kpi?.printFailed ?? 0],
    [t("adminOpsCenterKpiPrintQueued"), kpi?.printQueued ?? 0],
    [t("adminOpsCenterKpiClosePending"), kpi?.closePending ?? 0],
  ]

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <LayoutDashboard className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">
                {tOr(t, "adminOpsCenterTitle", t("adminOpsCenter"))}
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">{scopeLabel}</p>
            <p className="text-xs text-muted-foreground">
              {t("adminOpsCenterSub")}
            </p>
            <HelpSumHowBlocks helpSumKey={OPS_CENTER_HELP_SUM} className="mt-2 max-w-xl" compact />
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={() => void load()} disabled={loading}>
            <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("adminOpsCenterReload")}
          </Button>
        </div>

        {isOfficeSelector ? <MobileStoreSelectorBar /> : null}

        <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card/40 p-4">
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

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {kpiTiles.map(([label, value]) => (
            <div key={label} className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{Number(value).toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="rounded-md border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">{t("adminOpsCenterAlertsTitle")}</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("adminOpsCenterNoAlerts")}</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li
                  key={`${a.code}-${a.message}`}
                  className={`rounded px-3 py-2 text-sm ${
                    a.severity === "critical"
                      ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                  }`}
                >
                  [{a.code}] {a.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border bg-muted/30 p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("adminOpsCenterQuickLinksTitle")}</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/live-store-sales">{t("adminOpsCenterLinkLiveSales")}</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/pos-settlement">{t("adminOpsCenterLinkSettlement")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

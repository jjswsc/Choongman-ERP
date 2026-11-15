"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Gift,
  Plus,
  Trash2,
  Loader2,
  Search,
  Download,
  Store,
  Users,
  Wallet,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Settings2,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/use-store-list"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { roleTextMatchesManager } from "@/lib/permissions"
import {
  getSalesBonusPreview,
  getSalesBonusSettings,
  saveSalesBonusSettings,
  type SalesBonusStorePreviewDto,
  type SalesBonusTierDto,
  type StoreSalesBonusSettingsDto,
} from "@/lib/api-client/hr-sales-bonus"
import { HelpSumHowBlocks } from "@/components/erp/help-sum-how-blocks"
import { hrefToHelpSummaryKey } from "@/lib/admin-help-registry"
import { cn } from "@/lib/utils"

const ALL_STORES = "__all__"

function currentPayrollMonthLabel(): string {
  return getBangkokTodayDateString().slice(0, 7)
}

function fmtBaht(n: number): string {
  return Math.round(n || 0).toLocaleString("en-US")
}

function emptySettings(storeCode: string): StoreSalesBonusSettingsDto {
  return {
    storeCode,
    enabled: false,
    absencePenaltyPctPerDay: 5,
    managerMultiplier: 2,
    staffMultiplier: 1,
    tiers: [{ threshold: 500000, amount: 1000 }],
  }
}

function nextTierProgress(sales: number, tiers: SalesBonusTierDto[]) {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold)
  const next = sorted.find((t) => sales < t.threshold)
  if (!next) {
    return { next: null as SalesBonusTierDto | null, pct: 100, remaining: 0 }
  }
  const prev = [...sorted].reverse().find((t) => sales >= t.threshold)
  const base = prev?.threshold ?? 0
  const span = Math.max(1, next.threshold - base)
  const pct = Math.min(100, Math.max(0, ((sales - base) / span) * 100))
  return { next, pct, remaining: Math.max(0, next.threshold - sales) }
}

type EmpFlat = {
  storeCode: string
  storeLabel: string
  employeeId: number
  name: string
  role: string
  absenceDays: number
  baseAmount: number
  multiplier: number
  roleAmount: number
  penaltyAmount: number
  finalAmount: number
  isManager: boolean
}

function KpiCard(props: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  tone?: "default" | "emerald" | "amber" | "sky"
}) {
  const Icon = props.icon
  const tone =
    props.tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
      : props.tone === "amber"
        ? "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200"
        : props.tone === "sky"
          ? "border-sky-500/30 bg-sky-500/5 text-sky-800 dark:text-sky-200"
          : "border-border bg-card"
  return (
    <Card className={cn("border shadow-sm", tone)}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/80 border">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{props.label}</p>
          <p className="text-xl font-bold tabular-nums tracking-tight">{props.value}</p>
          {props.hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{props.hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function HrSalesBonusContent() {
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, storeLabels, loading: storesLoading } = useStoreList()
  const [tab, setTab] = useState("query")
  const [settingsStore, setSettingsStore] = useState("")
  const [queryStore, setQueryStore] = useState(ALL_STORES)
  const [settings, setSettings] = useState<StoreSalesBonusSettingsDto | null>(null)
  const [settingsList, setSettingsList] = useState<StoreSalesBonusSettingsDto[]>([])
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [saving, setSaving] = useState(false)
  const [month, setMonth] = useState(currentPayrollMonthLabel)
  const [previewStores, setPreviewStores] = useState<SalesBonusStorePreviewDto[]>([])
  const [loadingQuery, setLoadingQuery] = useState(false)
  const [queried, setQueried] = useState(false)
  const [statusMsg, setStatusMsg] = useState("")
  const [statusOk, setStatusOk] = useState(false)

  const storeOptions = useMemo(() => {
    return (stores || []).filter((s) => {
      const lo = s.toLowerCase()
      return !/office|본사|오피스|hq|test/.test(lo)
    })
  }, [stores])

  const labelOf = useCallback((code: string) => storeLabels?.[code] || code, [storeLabels])

  useEffect(() => {
    if (!settingsStore && storeOptions.length > 0) setSettingsStore(storeOptions[0])
  }, [settingsStore, storeOptions])

  const loadSettingsList = useCallback(async () => {
    try {
      const all = await getSalesBonusSettings()
      setSettingsList(all.list || [])
    } catch {
      /* 배지·개요용 — 실패해도 조회는 가능 */
    }
  }, [])

  useEffect(() => {
    void loadSettingsList()
  }, [loadSettingsList])

  const loadSettings = useCallback(
    async (storeCode: string) => {
      if (!storeCode) return
      setLoadingSettings(true)
      setStatusMsg("")
      try {
        const [one, all] = await Promise.all([
          getSalesBonusSettings(storeCode),
          getSalesBonusSettings().catch(() => ({ list: [] as StoreSalesBonusSettingsDto[] })),
        ])
        setSettings(one.settings || emptySettings(storeCode))
        setSettingsList(all.list || [])
      } catch (e) {
        setSettings(emptySettings(storeCode))
        setStatusOk(false)
        setStatusMsg(e instanceof Error ? e.message : String(e))
      } finally {
        setLoadingSettings(false)
      }
    },
    []
  )

  useEffect(() => {
    if (settingsStore && tab === "settings") void loadSettings(settingsStore)
  }, [settingsStore, loadSettings, tab])

  const updateTier = (tiers: SalesBonusTierDto[]) => {
    setSettings((prev) => (prev ? { ...prev, tiers } : prev))
  }

  const onSave = async () => {
    if (!settings || !settingsStore) return
    setSaving(true)
    setStatusMsg("")
    try {
      const saved = await saveSalesBonusSettings({ ...settings, storeCode: settingsStore })
      setSettings(saved)
      setSettingsList((prev) => {
        const others = prev.filter((x) => x.storeCode !== saved.storeCode)
        return [...others, saved].sort((a, b) => a.storeCode.localeCompare(b.storeCode))
      })
      setStatusOk(true)
      setStatusMsg(t("saved"))
    } catch (e) {
      setStatusOk(false)
      setStatusMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const runQuery = useCallback(async () => {
    if (!month || storeOptions.length === 0) return
    setLoadingQuery(true)
    setStatusMsg("")
    setQueried(false)
    try {
      const codes =
        queryStore === ALL_STORES ? storeOptions : [queryStore].filter(Boolean)
      if (codes.length === 0) {
        setPreviewStores([])
        setQueried(true)
        return
      }
      // 너무 많으면 배치로 (한 번에 최대 8매장)
      const batchSize = 8
      const all: SalesBonusStorePreviewDto[] = []
      for (let i = 0; i < codes.length; i += batchSize) {
        const chunk = codes.slice(i, i + batchSize)
        const rows =
          chunk.length === 1
            ? await getSalesBonusPreview({ month, store: chunk[0] })
            : await getSalesBonusPreview({ month, stores: chunk })
        all.push(...rows)
      }
      all.sort((a, b) => a.storeCode.localeCompare(b.storeCode))
      setPreviewStores(all)
      setQueried(true)
    } catch (e) {
      setPreviewStores([])
      setQueried(true)
      setStatusOk(false)
      setStatusMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingQuery(false)
    }
  }, [month, queryStore, storeOptions])

  useEffect(() => {
    if (tab === "query" && storeOptions.length > 0 && !queried && !loadingQuery) {
      void runQuery()
    }
    // 최초 진입·매장목록 준비 시 1회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, storeOptions.length])

  const flatEmployees: EmpFlat[] = useMemo(() => {
    const rows: EmpFlat[] = []
    for (const st of previewStores) {
      for (const e of st.employees) {
        rows.push({
          storeCode: st.storeCode,
          storeLabel: labelOf(st.storeCode),
          employeeId: e.employeeId,
          name: e.name,
          role: e.role,
          absenceDays: e.absenceDays,
          baseAmount: e.result.baseAmount,
          multiplier: e.result.multiplier,
          roleAmount: e.result.roleAmount,
          penaltyAmount: e.result.penaltyAmount,
          finalAmount: e.result.finalAmount,
          isManager: roleTextMatchesManager(e.role),
        })
      }
    }
    rows.sort((a, b) =>
      a.storeLabel !== b.storeLabel
        ? a.storeLabel.localeCompare(b.storeLabel)
        : a.name.localeCompare(b.name)
    )
    return rows
  }, [previewStores, labelOf])

  const totals = useMemo(() => {
    const salesTotal = previewStores.reduce((s, x) => s + (x.salesTotal || 0), 0)
    const bonusTotal = flatEmployees.reduce((s, x) => s + x.finalAmount, 0)
    const penaltyTotal = flatEmployees.reduce((s, x) => s + x.penaltyAmount, 0)
    const enabledStores = previewStores.filter((x) => x.settings.enabled).length
    const paidPeople = flatEmployees.filter((x) => x.finalAmount > 0).length
    const absentPeople = flatEmployees.filter((x) => x.absenceDays > 0).length
    return {
      salesTotal,
      bonusTotal,
      penaltyTotal,
      storeCount: previewStores.length,
      enabledStores,
      empCount: flatEmployees.length,
      paidPeople,
      absentPeople,
      avgBonus: paidPeople > 0 ? bonusTotal / paidPeople : 0,
    }
  }, [previewStores, flatEmployees])

  const storeRows = useMemo(() => {
    return previewStores.map((st) => {
      const bonusSum = st.employees.reduce((s, e) => s + e.result.finalAmount, 0)
      const paid = st.employees.filter((e) => e.result.finalAmount > 0).length
      const applied = st.employees[0]?.result.appliedTiers?.length
        ? st.employees[0].result.appliedTiers
        : st.settings.tiers.filter((tier) => st.salesTotal >= tier.threshold)
      const prog = nextTierProgress(st.salesTotal, st.settings.tiers)
      return {
        storeCode: st.storeCode,
        label: labelOf(st.storeCode),
        enabled: st.settings.enabled,
        salesTotal: st.salesTotal,
        bonusSum,
        empCount: st.employees.length,
        paid,
        appliedCount: applied?.length || 0,
        basePerPerson: st.employees[0]?.result.baseAmount ?? 0,
        period: st.period,
        progress: prog,
      }
    })
  }, [previewStores, labelOf])

  const periodLabel = previewStores[0]?.period
    ? `${previewStores[0].period.start} ~ ${previewStores[0].period.end}`
    : ""

  const exportCsv = () => {
    if (flatEmployees.length === 0) return
    const cols = [
      t("hrSalesBonus_month"),
      t("hrSalesBonus_col_store"),
      t("hrSalesBonus_col_name"),
      t("hrSalesBonus_col_role"),
      t("hrSalesBonus_col_base"),
      t("hrSalesBonus_col_mult"),
      t("hrSalesBonus_col_role_amt"),
      t("hrSalesBonus_col_absent"),
      t("hrSalesBonus_col_penalty"),
      t("hrSalesBonus_col_final"),
    ]
    const lines = [cols.join(",")]
    for (const e of flatEmployees) {
      lines.push(
        [
          month,
          `"${e.storeLabel.replace(/"/g, '""')}"`,
          `"${e.name.replace(/"/g, '""')}"`,
          `"${(e.role || "").replace(/"/g, '""')}"`,
          e.baseAmount,
          e.multiplier,
          e.roleAmount,
          e.absenceDays,
          e.penaltyAmount,
          e.finalAmount,
        ].join(",")
      )
    }
    lines.push(
      [
        "",
        t("hrSalesBonus_total"),
        String(totals.empCount),
        "",
        "",
        "",
        "",
        "",
        totals.penaltyTotal,
        totals.bonusTotal,
      ].join(",")
    )
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sales-bonus-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const enabledSettingsCount = settingsList.filter((s) => s.enabled).length

  return (
    <div className="space-y-4">
      <HelpSumHowBlocks helpSumKey={hrefToHelpSummaryKey("/admin/hr-sales-bonus")} />

      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-emerald-500/10 via-background to-sky-500/10 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Gift className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t("adminHrSalesBonus")}</h2>
              <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
                {t("adminHrSalesBonusSub")}
              </p>
            </div>
          </div>
          {enabledSettingsCount > 0 ? (
            <Badge variant="secondary" className="bg-emerald-600/15 text-emerald-800 dark:text-emerald-200">
              {t("hrSalesBonus_enabled_stores_count").replace(
                "{n}",
                String(enabledSettingsCount)
              )}
            </Badge>
          ) : null}
        </div>
      </div>

      {statusMsg ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            statusOk
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          )}
        >
          {statusOk ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{statusMsg}</span>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 sm:inline-flex sm:w-auto">
          <TabsTrigger value="query" className="gap-1.5">
            <Search className="h-3.5 w-3.5" />
            {t("hrSalesBonus_tab_query")}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            {t("hrSalesBonus_tab_settings")}
          </TabsTrigger>
        </TabsList>

        {/* ─── 조회 ─── */}
        <TabsContent value="query" className="space-y-4 pt-3">
          <Card className="shadow-sm">
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <div className="space-y-1.5">
                <Label>{t("hrSalesBonus_month")}</Label>
                <Input
                  type="month"
                  className="w-[170px]"
                  value={month}
                  onChange={(e) => {
                    setMonth(e.target.value)
                    setQueried(false)
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("hrSalesBonus_store")}</Label>
                <Select
                  value={queryStore}
                  onValueChange={(v) => {
                    setQueryStore(v)
                    setQueried(false)
                  }}
                  disabled={storesLoading}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_STORES}>{t("hrSalesBonus_all_stores")}</SelectItem>
                    {storeOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {labelOf(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={() => void runQuery()} disabled={loadingQuery || storesLoading}>
                {loadingQuery ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-1.5 h-4 w-4" />
                )}
                {t("hrSalesBonus_run_query")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={exportCsv}
                disabled={flatEmployees.length === 0}
              >
                <Download className="mr-1.5 h-4 w-4" />
                {t("hrSalesBonus_export_csv")}
              </Button>
              {periodLabel ? (
                <p className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
                  {t("hrSalesBonus_period")}: {periodLabel}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {loadingQuery ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("loading")}
            </div>
          ) : queried ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  icon={TrendingUp}
                  label={t("hrSalesBonus_kpi_sales")}
                  value={`฿${fmtBaht(totals.salesTotal)}`}
                  hint={t("hrSalesBonus_kpi_stores").replace("{n}", String(totals.storeCount))}
                  tone="sky"
                />
                <KpiCard
                  icon={Wallet}
                  label={t("hrSalesBonus_kpi_bonus")}
                  value={`฿${fmtBaht(totals.bonusTotal)}`}
                  hint={t("hrSalesBonus_kpi_avg").replace("{n}", fmtBaht(totals.avgBonus))}
                  tone="emerald"
                />
                <KpiCard
                  icon={Users}
                  label={t("hrSalesBonus_kpi_people")}
                  value={String(totals.paidPeople)}
                  hint={t("hrSalesBonus_kpi_people_sub")
                    .replace("{paid}", String(totals.paidPeople))
                    .replace("{all}", String(totals.empCount))}
                />
                <KpiCard
                  icon={AlertCircle}
                  label={t("hrSalesBonus_kpi_penalty")}
                  value={`฿${fmtBaht(totals.penaltyTotal)}`}
                  hint={t("hrSalesBonus_kpi_absent_people").replace(
                    "{n}",
                    String(totals.absentPeople)
                  )}
                  tone="amber"
                />
              </div>

              {/* 매장 요약 */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Store className="h-4 w-4" />
                    {t("hrSalesBonus_store_summary")}
                  </CardTitle>
                  <CardDescription>{t("hrSalesBonus_store_summary_hint")}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <AdminTableScroll>
                    <table className="w-full min-w-[720px] text-sm border-collapse">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                          <th className="p-2 font-medium">{t("hrSalesBonus_col_store")}</th>
                          <th className="p-2 font-medium">{t("hrSalesBonus_status")}</th>
                          <th className="p-2 font-medium text-right">{t("hrSalesBonus_sales_total")}</th>
                          <th className="p-2 font-medium text-right">{t("hrSalesBonus_col_tiers_hit")}</th>
                          <th className="p-2 font-medium text-right">{t("hrSalesBonus_col_base")}</th>
                          <th className="p-2 font-medium text-right">{t("hrSalesBonus_col_people")}</th>
                          <th className="p-2 font-medium text-right">{t("hrSalesBonus_col_final")}</th>
                          <th className="p-2 font-medium min-w-[140px]">{t("hrSalesBonus_next_tier")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeRows.map((r) => (
                          <tr key={r.storeCode} className="border-b border-border/60 hover:bg-muted/30">
                            <td className="p-2 font-medium">{r.label}</td>
                            <td className="p-2">
                              {r.enabled ? (
                                <Badge className="bg-emerald-600 hover:bg-emerald-600">
                                  {t("hrSalesBonus_on")}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">{t("hrSalesBonus_off")}</Badge>
                              )}
                            </td>
                            <td className="p-2 text-right tabular-nums">฿{fmtBaht(r.salesTotal)}</td>
                            <td className="p-2 text-right tabular-nums">{r.appliedCount}</td>
                            <td className="p-2 text-right tabular-nums">฿{fmtBaht(r.basePerPerson)}</td>
                            <td className="p-2 text-right tabular-nums">
                              {r.paid}/{r.empCount}
                            </td>
                            <td className="p-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                              ฿{fmtBaht(r.bonusSum)}
                            </td>
                            <td className="p-2">
                              {r.progress.next ? (
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span>฿{fmtBaht(r.progress.next.threshold)}</span>
                                    <span>−฿{fmtBaht(r.progress.remaining)}</span>
                                  </div>
                                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-sky-500 transition-all"
                                      style={{ width: `${r.progress.pct}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-emerald-600">{t("hrSalesBonus_top_tier")}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 bg-muted/60 font-semibold">
                          <td className="p-2" colSpan={2}>
                            {t("hrSalesBonus_total")}
                          </td>
                          <td className="p-2 text-right tabular-nums">฿{fmtBaht(totals.salesTotal)}</td>
                          <td className="p-2" />
                          <td className="p-2" />
                          <td className="p-2 text-right tabular-nums">{totals.empCount}</td>
                          <td className="p-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                            ฿{fmtBaht(totals.bonusTotal)}
                          </td>
                          <td className="p-2" />
                        </tr>
                      </tfoot>
                    </table>
                  </AdminTableScroll>
                  {storeRows.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {t("hrSalesBonus_no_query_result")}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              {/* 직원 상세 */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {t("hrSalesBonus_emp_detail")}
                  </CardTitle>
                  <CardDescription>{t("hrSalesBonus_emp_detail_hint")}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <AdminTableScroll>
                    <table className="w-full min-w-[860px] text-sm border-collapse">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                          <th className="p-2 font-medium">#</th>
                          {queryStore === ALL_STORES ? (
                            <th className="p-2 font-medium">{t("hrSalesBonus_col_store")}</th>
                          ) : null}
                          <th className="p-2 font-medium">{t("hrSalesBonus_col_name")}</th>
                          <th className="p-2 font-medium">{t("hrSalesBonus_col_role")}</th>
                          <th className="p-2 font-medium text-right">{t("hrSalesBonus_col_base")}</th>
                          <th className="p-2 font-medium text-right">{t("hrSalesBonus_col_mult")}</th>
                          <th className="p-2 font-medium text-right">{t("hrSalesBonus_col_role_amt")}</th>
                          <th className="p-2 font-medium text-right">{t("hrSalesBonus_col_absent")}</th>
                          <th className="p-2 font-medium text-right">{t("hrSalesBonus_col_penalty")}</th>
                          <th className="p-2 font-medium text-right">{t("hrSalesBonus_col_final")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flatEmployees.map((e, i) => (
                          <tr
                            key={`${e.storeCode}-${e.employeeId}-${e.name}`}
                            className={cn(
                              "border-b border-border/60 hover:bg-muted/30",
                              e.isManager && "bg-violet-500/5"
                            )}
                          >
                            <td className="p-2 text-muted-foreground">{i + 1}</td>
                            {queryStore === ALL_STORES ? (
                              <td className="p-2 text-muted-foreground">{e.storeLabel}</td>
                            ) : null}
                            <td className="p-2 font-medium">{e.name}</td>
                            <td className="p-2">
                              <span className="inline-flex items-center gap-1">
                                {e.role || "—"}
                                {e.isManager ? (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    ×{e.multiplier}
                                  </Badge>
                                ) : null}
                              </span>
                            </td>
                            <td className="p-2 text-right tabular-nums">{fmtBaht(e.baseAmount)}</td>
                            <td className="p-2 text-right tabular-nums">×{e.multiplier}</td>
                            <td className="p-2 text-right tabular-nums">{fmtBaht(e.roleAmount)}</td>
                            <td className="p-2 text-right tabular-nums">
                              {e.absenceDays > 0 ? (
                                <span className="text-amber-700 dark:text-amber-300">{e.absenceDays}</span>
                              ) : (
                                0
                              )}
                            </td>
                            <td className="p-2 text-right tabular-nums text-amber-700 dark:text-amber-300">
                              {e.penaltyAmount > 0 ? `−${fmtBaht(e.penaltyAmount)}` : "0"}
                            </td>
                            <td className="p-2 text-right tabular-nums font-semibold">
                              {fmtBaht(e.finalAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 bg-muted/60 font-semibold">
                          <td className="p-2" colSpan={queryStore === ALL_STORES ? 4 : 3}>
                            {t("hrSalesBonus_total")} ({totals.empCount})
                          </td>
                          <td className="p-2" />
                          <td className="p-2" />
                          <td className="p-2" />
                          <td className="p-2" />
                          <td className="p-2 text-right tabular-nums text-amber-700 dark:text-amber-300">
                            −{fmtBaht(totals.penaltyTotal)}
                          </td>
                          <td className="p-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                            ฿{fmtBaht(totals.bonusTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </AdminTableScroll>
                  {flatEmployees.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {t("hrSalesBonus_no_employees")}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-dashed shadow-none">
              <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <Search className="h-8 w-8 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">{t("hrSalesBonus_preview_hint")}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── 설정 ─── */}
        <TabsContent value="settings" className="space-y-4 pt-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>{t("hrSalesBonus_store")}</Label>
              <Select value={settingsStore} onValueChange={setSettingsStore} disabled={storesLoading}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder={storesLoading ? t("loading") : t("hrSalesBonus_store")} />
                </SelectTrigger>
                <SelectContent>
                  {storeOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {labelOf(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loadingSettings || !settings ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <>
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gift className="h-4 w-4" />
                    {labelOf(settingsStore)} — {t("hrSalesBonus_tab_settings")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-3 hover:bg-muted/40">
                    <div>
                      <p className="text-sm font-medium">{t("hrSalesBonus_enabled")}</p>
                      <p className="text-xs text-muted-foreground">{t("hrSalesBonus_enabled_hint")}</p>
                    </div>
                    <Checkbox
                      checked={settings.enabled}
                      onCheckedChange={(v) => setSettings({ ...settings, enabled: v === true })}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>{t("hrSalesBonus_penalty_pct")}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={settings.absencePenaltyPctPerDay}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            absencePenaltyPctPerDay: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("hrSalesBonus_mgr_mult")}</Label>
                      <Input
                        type="number"
                        min={0.1}
                        max={20}
                        step={0.1}
                        value={settings.managerMultiplier}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            managerMultiplier: Number(e.target.value) || 2,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("hrSalesBonus_staff_mult")}</Label>
                      <Input
                        type="number"
                        min={0.1}
                        max={20}
                        step={0.1}
                        value={settings.staffMultiplier}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            staffMultiplier: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="text-base">{t("hrSalesBonus_tiers")}</CardTitle>
                    <CardDescription className="mt-1">{t("hrSalesBonus_tiers_hint")}</CardDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateTier([
                        ...settings.tiers,
                        {
                          threshold:
                            (settings.tiers[settings.tiers.length - 1]?.threshold || 400000) + 100000,
                          amount: 1000,
                        },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t("hrSalesBonus_add_tier")}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {settings.tiers.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {t("hrSalesBonus_no_tiers")}
                    </p>
                  ) : (
                    settings.tiers.map((tier, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg border bg-muted/20 p-2.5"
                      >
                        <div className="space-y-1">
                          <Label className="text-xs">{t("hrSalesBonus_threshold")}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={tier.threshold}
                            onChange={(e) => {
                              const next = [...settings.tiers]
                              next[idx] = { ...tier, threshold: Number(e.target.value) || 0 }
                              updateTier(next)
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("hrSalesBonus_amount")}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={tier.amount}
                            onChange={(e) => {
                              const next = [...settings.tiers]
                              next[idx] = { ...tier, amount: Number(e.target.value) || 0 }
                              updateTier(next)
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-destructive"
                          onClick={() => updateTier(settings.tiers.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="button" onClick={() => void onSave()} disabled={saving || !settingsStore}>
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  {t("save")}
                </Button>
              </div>

              {settingsList.length > 0 ? (
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t("hrSalesBonus_settings_overview")}</CardTitle>
                    <CardDescription>{t("hrSalesBonus_settings_overview_hint")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {settingsList.map((s) => (
                        <button
                          key={s.storeCode}
                          type="button"
                          onClick={() => setSettingsStore(s.storeCode)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                            s.storeCode === settingsStore
                              ? "border-primary bg-primary/10"
                              : "hover:bg-muted"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              s.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
                            )}
                          />
                          {labelOf(s.storeCode)}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

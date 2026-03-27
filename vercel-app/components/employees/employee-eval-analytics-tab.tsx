"use client"

import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Loader2, PieChart as PieChartIcon, Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getEvaluationAnalytics,
  summarizeEvaluationAnalytics,
  type EvaluationAnalyticsPayload,
} from "@/lib/api-client"
import { getBangkokMonthRange, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { appAlert } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const GRADE_COLORS = ["#22c55e", "#3b82f6", "#eab308", "#f97316", "#ef4444", "#94a3b8"]

export interface EmployeeEvalAnalyticsTabProps {
  stores: string[]
  /** 본사·회계: 전체 매장 선택 가능 */
  canPickAllStores: boolean
  /** AI 요약 버튼 (본사·회계) */
  canUseAiSummary: boolean
}

export function EmployeeEvalAnalyticsTab({
  stores,
  canPickAllStores,
  canUseAiSummary,
}: EmployeeEvalAnalyticsTabProps) {
  const { lang } = useLang()
  const t = useT(lang)

  const initialRange = React.useMemo(() => getBangkokMonthRange(), [])
  const [start, setStart] = React.useState(initialRange.startStr)
  const [end, setEnd] = React.useState(() => {
    const today = getBangkokTodayDateString()
    return today < initialRange.endStr ? today : initialRange.endStr
  })
  const [type, setType] = React.useState("all")
  const [storeFilter, setStoreFilter] = React.useState("All")
  const [data, setData] = React.useState<EvaluationAnalyticsPayload | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [aiLoading, setAiLoading] = React.useState(false)
  const [aiText, setAiText] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const payload = await getEvaluationAnalytics({
        start,
        end,
        type,
        store: canPickAllStores ? storeFilter : undefined,
      })
      setData(payload)
    } catch (e) {
      setData(null)
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [start, end, type, storeFilter, canPickAllStores])

  /** 조건 변경 시 이전 집계는 숨김 — 반드시 [검색]으로 다시 조회 */
  React.useEffect(() => {
    setData(null)
  }, [start, end, type, storeFilter, canPickAllStores])

  const onAi = async () => {
    if (!canUseAiSummary) return
    setAiLoading(true)
    setAiText("")
    try {
      const r = await summarizeEvaluationAnalytics({
        start,
        end,
        type,
        store: canPickAllStores ? storeFilter : undefined,
      })
      setAiText(r.summary || "")
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setAiLoading(false)
    }
  }

  const gradeChartData = React.useMemo(() => {
    if (!data?.gradeDistribution) return []
    return Object.entries(data.gradeDistribution).map(([name, value]) => ({
      name,
      value,
    }))
  }, [data])

  const storeBarData = React.useMemo(() => {
    if (!data?.byStore?.length) return []
    return data.byStore.map((r) => ({
      name: r.store.length > 14 ? r.store.slice(0, 14) + "…" : r.store,
      full: r.store,
      avg: r.avgScore != null ? Number(r.avgScore.toFixed(2)) : 0,
      evaluations: r.evaluations,
    }))
  }, [data])

  const monthData = React.useMemo(() => {
    if (!data?.byMonth?.length) return []
    return data.byMonth.map((m) => ({
      ym: m.yearMonth,
      evaluations: m.evaluations,
      avg: m.avgScore != null ? Number(m.avgScore.toFixed(2)) : null,
    }))
  }, [data])

  const typeRows = data?.byType ?? []

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("eval_analytics_bangkok_hint")}</p>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("eval_date")}</label>
            <Input type="date" className="h-9" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">~</label>
            <Input type="date" className="h-9" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("eval_analytics_type")}</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 w-[140px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("eval_analytics_type_all")}</SelectItem>
                <SelectItem value="kitchen">{t("eval_analytics_type_kitchen")}</SelectItem>
                <SelectItem value="service">{t("eval_analytics_type_service")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {canPickAllStores && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("eval_analytics_store")}</label>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="h-9 min-w-[160px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{t("eval_analytics_store_all")}</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <Button type="button" variant="default" size="sm" className="shrink-0 gap-1.5" onClick={() => void load()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" aria-hidden />}
          {t("eval_analytics_search")}
        </Button>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {t("eval_analytics_source")}:{" "}
            <strong className="text-foreground">
              {data.source === "rpc" ? t("eval_analytics_source_rpc") : t("eval_analytics_source_fallback")}
            </strong>
          </span>
        </div>
      )}

      {!data && !loading && (
        <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
          {t("eval_analytics_search_hint")}
        </div>
      )}

      {loading && !data && (
        <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("loading")}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("eval_analytics_kpi_total")}</div>
              <div className="text-xl font-semibold tabular-nums">{data.summary.totalEvaluations}</div>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("eval_analytics_kpi_unique")}</div>
              <div className="text-xl font-semibold tabular-nums">{data.summary.uniqueEmployees}</div>
            </div>
            <div className="rounded-lg border bg-primary/10 px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("eval_analytics_kpi_avg")}</div>
              <div className="text-xl font-semibold tabular-nums">
                {data.summary.avgTotalScore != null ? data.summary.avgTotalScore.toFixed(2) : "—"}
              </div>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("eval_analytics_evaluators_count")}</div>
              <div className="text-xl font-semibold tabular-nums">{data.byEvaluator.length}</div>
            </div>
          </div>

          {data.coverage != null ? (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-1 text-sm font-semibold">{t("eval_analytics_coverage_title")}</h3>
              <p className="mb-3 text-xs text-muted-foreground">{t("eval_analytics_coverage_hint")}</p>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-md border bg-muted/30 px-2 py-1.5">
                  <div className="text-[10px] text-muted-foreground">{t("eval_analytics_coverage_active")}</div>
                  <div className="text-lg font-semibold tabular-nums">{data.coverage.activeEmployeesInPeriod}</div>
                </div>
                <div className="rounded-md border bg-muted/30 px-2 py-1.5">
                  <div className="text-[10px] text-muted-foreground">{t("eval_analytics_coverage_evaluated")}</div>
                  <div className="text-lg font-semibold tabular-nums">{data.coverage.evaluatedEmployees}</div>
                </div>
                <div className="rounded-md border border-amber-500/30 bg-amber-50/50 px-2 py-1.5 dark:bg-amber-950/20">
                  <div className="text-[10px] text-muted-foreground">{t("eval_analytics_coverage_unevaluated")}</div>
                  <div className="text-lg font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                    {data.coverage.unevaluatedEmployees}
                  </div>
                </div>
              </div>
              {data.coverage.unevaluated.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("eval_analytics_coverage_none")}</p>
              ) : (
                <div className="max-h-[360px] overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-2 py-2">{t("eval_analytics_store")}</th>
                        <th className="px-2 py-2">{t("emp_label_name")}</th>
                        <th className="px-2 py-2">{t("emp_label_nickname")}</th>
                        <th className="px-2 py-2">{t("eval_analytics_col_job")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.coverage.unevaluated.map((r) => (
                        <tr key={`${r.store}|${r.name}|${r.nick}`} className="border-b border-border/60">
                          <td className="px-2 py-1.5">{r.store}</td>
                          <td className="px-2 py-1.5 font-medium">{r.name}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{r.nick || "—"}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{r.job || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              {t("eval_analytics_coverage_unavailable")}
            </div>
          )}

          {data.sectionAverages && Object.keys(data.sectionAverages).length > 0 && (
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="mb-2 text-xs font-medium text-foreground">{t("eval_analytics_sections")}</div>
              <div className="flex flex-wrap gap-3 text-sm">
                {(["menu", "cost", "hygiene", "attitude"] as const).map((k) => {
                  const v = data.sectionAverages![k]
                  const labelKey =
                    k === "menu"
                      ? "eval_main_menu"
                      : k === "cost"
                        ? "eval_main_cost"
                        : k === "hygiene"
                          ? "eval_main_hygiene"
                          : "eval_main_attitude"
                  return (
                    <span key={k} className="tabular-nums">
                      <span className="text-muted-foreground">{t(labelKey)}:</span>{" "}
                      {v != null ? v.toFixed(2) : "—"}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {canUseAiSummary && (
            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-primary" aria-hidden />
                <span className="text-sm font-medium">{t("eval_analytics_ai_summary")}</span>
                <Button type="button" size="sm" variant="default" disabled={aiLoading} onClick={() => void onAi()}>
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("eval_analytics_ai_run")}
                </Button>
              </div>
              {aiText ? (
                <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md bg-background/80 p-3 text-xs leading-relaxed">
                  {aiText}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">{t("eval_analytics_ai_hint")}</p>
              )}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold">{t("eval_analytics_grade_dist")}</h3>
              {gradeChartData.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("emp_result_empty")}</p>
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={gradeChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={88}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {gradeChartData.map((_, i) => (
                          <Cell key={i} fill={GRADE_COLORS[i % GRADE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold">{t("eval_analytics_by_type")}</h3>
              {typeRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("emp_result_empty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-2">{t("eval_analytics_type")}</th>
                        <th className="py-2 pr-2">{t("eval_analytics_kpi_total")}</th>
                        <th className="py-2 pr-2">{t("eval_analytics_kpi_unique")}</th>
                        <th className="py-2 pr-2">{t("eval_analytics_kpi_avg")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {typeRows.map((r) => (
                        <tr key={r.evalType} className="border-b border-border/60">
                          <td className="py-2 pr-2 font-medium">{r.evalType}</td>
                          <td className="py-2 pr-2 tabular-nums">{r.evaluations}</td>
                          <td className="py-2 pr-2 tabular-nums">{r.uniqueEmployees}</td>
                          <td className="py-2 pr-2 tabular-nums">
                            {r.avgScore != null ? r.avgScore.toFixed(2) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">{t("eval_analytics_by_store")}</h3>
            {storeBarData.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("emp_result_empty")}</p>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={storeBarData.slice(0, 20)} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, "auto"]} />
                    <Tooltip
                      formatter={(v: number) => [v, t("eval_analytics_kpi_avg")]}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload as { full?: string } | undefined
                        return p?.full || ""
                      }}
                    />
                    <Bar dataKey="avg" fill="#3b82f6" name={t("eval_analytics_kpi_avg")} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">{t("eval_analytics_by_month")}</h3>
            {monthData.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("emp_result_empty")}</p>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, "auto"]} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="evaluations" fill="#94a3b8" name={t("eval_analytics_kpi_total")} />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="avg"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot
                      name={t("eval_analytics_kpi_avg")}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">{t("eval_analytics_by_evaluator")}</h3>
            {data.byEvaluator.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("emp_result_empty")}</p>
            ) : (
              <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-2">{t("eval_analytics_col_evaluator")}</th>
                      <th className="py-2 pr-2">{t("eval_analytics_kpi_total")}</th>
                      <th className="py-2 pr-2">{t("eval_analytics_kpi_avg")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byEvaluator.map((r) => (
                      <tr key={r.evaluator} className="border-b border-border/60">
                        <td className="py-2 pr-2">{r.evaluator}</td>
                        <td className="py-2 pr-2 tabular-nums">{r.evaluations}</td>
                        <td className="py-2 pr-2 tabular-nums">
                          {r.avgScore != null ? r.avgScore.toFixed(2) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

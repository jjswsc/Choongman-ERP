"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, RefreshCw } from "lucide-react"
import { appAlert } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { ADMIN_DIALOG_SCROLL_CN } from "@/lib/admin-ui-standards"
import { cn } from "@/lib/utils"
import {
  getDailyPlanBoard,
  getMyDailyPlan,
  type DailyPlanBoardRow,
  type DailyPlanBundle,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { buildDailyPlanLineText, dailyPlanLabelers, dailyPlanLinkHref, minutesLabel } from "@/lib/daily-plan-i18n"
import { DailyPlanItems } from "@/components/daily-plan/daily-plan-items"

type T = (k: string) => string

const ROLE_ORDER: Record<string, number> = { supervisor: 0, manager: 1, staff: 2 }

export function DailyPlanBoard({ t }: { t: T }) {
  const label = dailyPlanLabelers(t)
  const [date, setDate] = useState(getBangkokTodayDateString)
  const [rows, setRows] = useState<DailyPlanBoardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [notReady, setNotReady] = useState(false)
  const [role, setRole] = useState<string>("all")
  const [detail, setDetail] = useState<DailyPlanBundle | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getDailyPlanBoard(date)
      setRows(Array.isArray(res.plans) ? res.plans : [])
      setNotReady(!!res.notReady)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = useCallback(async (planId: number) => {
    const res = await getMyDailyPlan({ planId })
    setDetail(res.today)
  }, [])

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => role === "all" || r.role_scope === role)
        .sort((a, b) => (ROLE_ORDER[a.role_scope] ?? 9) - (ROLE_ORDER[b.role_scope] ?? 9)),
    [rows, role]
  )

  const kpi = useMemo(() => {
    const total = filtered.reduce((s, r) => s + r.total, 0)
    const done = filtered.reduce((s, r) => s + r.done, 0)
    return {
      people: filtered.length,
      rate: total > 0 ? Math.round((done / total) * 100) : 0,
      late: filtered.reduce((s, r) => s + r.late, 0),
      closed: filtered.filter((r) => r.status === "closed").length,
      est: filtered.reduce((s, r) => s + r.estMinutes, 0),
      actual: filtered.reduce((s, r) => s + r.actualMinutes, 0),
    }
  }, [filtered])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
        <div className="flex gap-1">
          {["all", "supervisor", "manager", "staff"].map((r) => (
            <Button
              key={r}
              size="sm"
              variant={role === r ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setRole(r)}
            >
              {r === "all" ? t("dp_all") : label.role(r)}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {notReady ? <p className="text-sm text-amber-600">{t("dp_not_ready")}</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t("dp_kpi_people"), value: `${kpi.people}`, sub: `${t("dp_plan_closed")} ${kpi.closed}` },
          { label: t("dp_kpi_rate"), value: `${kpi.rate}%`, sub: "" },
          { label: t("dp_kpi_late"), value: `${kpi.late}`, sub: "", warn: kpi.late > 0 },
          {
            label: t("dp_kpi_time"),
            value: minutesLabel(kpi.actual, t),
            sub: `${t("dp_est")} ${minutesLabel(kpi.est, t)}`,
          },
        ].map((k) => (
          <Card key={k.label} className={cn("border-l-4", k.warn ? "border-red-500/50" : "border-blue-500/30")}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-xl font-bold tabular-nums">{loading ? "—" : k.value}</p>
              {k.sub ? <p className="text-[11px] text-muted-foreground">{k.sub}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-2">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">{loading ? t("loading") : t("dp_empty_board")}</p>
          ) : (
            <AdminTableScroll>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-1.5">{t("dp_col_person")}</th>
                    <th className="p-1.5">{t("dp_col_store")}</th>
                    <th className="p-1.5 text-right">{t("dp_col_progress")}</th>
                    <th className="p-1.5 text-right">{t("dp_kpi_late")}</th>
                    <th className="p-1.5">{t("dp_col_now")}</th>
                    <th className="p-1.5 text-right">{t("dp_col_time")}</th>
                    <th className="p-1.5">{t("dp_col_status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const rate = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0
                    const route = (r.route_stores || []).join(", ")
                    return (
                      <tr
                        key={r.id}
                        className="cursor-pointer border-b hover:bg-muted/40"
                        onClick={() => void openDetail(r.id)}
                      >
                        <td className="p-1.5">
                          <p className="font-medium">{r.employee_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {label.role(r.role_scope)}
                            {r.role_scope === "staff" ? ` · ${label.position(r.position)}` : ""}
                            {r.shift_in ? ` · ${r.shift_in}–${r.shift_out}` : ""}
                          </p>
                        </td>
                        <td className="p-1.5">
                          {route || r.store_name}
                          {r.visitsTotal > 0 ? (
                            <span className="ml-1 text-[10px] text-emerald-700">
                              ({t("dp_visit_title")} {r.visitsDone}/{r.visitsTotal})
                            </span>
                          ) : null}
                        </td>
                        <td className="p-1.5 text-right tabular-nums">
                          {r.done}/{r.total} <span className="text-muted-foreground">({rate}%)</span>
                        </td>
                        <td className={cn("p-1.5 text-right tabular-nums", r.late > 0 && "font-semibold text-red-600")}>
                          {r.late}
                        </td>
                        <td className="max-w-[220px] truncate p-1.5">
                          {r.doingTitle ? `▶ ${r.doingTitle}` : r.nextTitle ? `… ${r.nextTitle}` : "—"}
                        </td>
                        <td className="p-1.5 text-right tabular-nums">
                          {minutesLabel(r.actualMinutes, t)} / {minutesLabel(r.estMinutes, t)}
                        </td>
                        <td className="p-1.5">
                          {label.planStatus(r.status)}
                          {!r.published_at && r.status !== "closed" ? (
                            <span className="ml-1 text-[10px] text-muted-foreground">({t("dp_unpublished")})</span>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </AdminTableScroll>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className={ADMIN_DIALOG_SCROLL_CN}>
          <DialogHeader>
            <DialogTitle>
              {detail ? `${detail.plan.employee_name} · ${detail.plan.plan_date}` : ""}
            </DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {label.role(detail.plan.role_scope)} · {t("dp_col_progress")} {detail.summary.done}/{detail.summary.total} ·{" "}
                {t("dp_actual")} {minutesLabel(detail.summary.actualTotal, t)} / {t("dp_est")}{" "}
                {minutesLabel(detail.summary.estTotal, t)}
              </p>
              {detail.plan.briefing_note ? (
                <p className="rounded bg-muted p-2 text-xs whitespace-pre-wrap">{detail.plan.briefing_note}</p>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={async () => {
                  const text = buildDailyPlanLineText(detail, t)
                  try {
                    await navigator.clipboard.writeText(text)
                    await appAlert(t("dp_line_copied"))
                  } catch {
                    await appAlert(text)
                  }
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {t("dp_line_copy")}
              </Button>
              <DailyPlanItems
                plan={detail.plan}
                items={detail.items}
                t={t}
                travelMinutes={detail.travelMinutes}
                onChanged={() => {
                  void openDetail(detail.plan.id)
                  void load()
                }}
                onLink={(it, kind) => {
                  const href = dailyPlanLinkHref(it, kind)
                  if (href) window.open(href, "_blank")
                }}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import {
  getStoreActionScorecard,
  type StoreActionScoreRow,
  type StoreActionScorecardResponse,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { cn } from "@/lib/utils"

function rateTone(rate: number, total: number): string {
  if (total === 0) return ""
  if (rate >= 80) return "text-emerald-600"
  if (rate >= 50) return "text-amber-600"
  return "text-red-600 font-semibold"
}

function ScoreTable(props: { title: string; keyLabel: string; rows: StoreActionScoreRow[]; t: (k: string) => string }) {
  const { title, keyLabel, rows, t } = props
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <p className="text-xs font-semibold">{title}</p>
        <AdminTableScroll>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-1.5">{keyLabel}</th>
                <th className="p-1.5 text-right">{t("action_sc_total")}</th>
                <th className="p-1.5 text-right">{t("action_sc_done")}</th>
                <th className="p-1.5 text-right">{t("action_sc_on_time_rate")}</th>
                <th className="p-1.5 text-right">{t("action_sc_overdue_open")}</th>
                <th className="p-1.5 text-right">{t("action_sc_avg_days")}</th>
                <th className="p-1.5 text-right">{t("action_sc_repeat")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b">
                  <td className="p-1.5 font-medium">{r.key}</td>
                  <td className="p-1.5 text-right tabular-nums">{r.total}</td>
                  <td className="p-1.5 text-right tabular-nums">{r.completed}</td>
                  <td className={cn("p-1.5 text-right tabular-nums", rateTone(r.onTimeRate, r.total))}>
                    {r.onTimeRate}%
                  </td>
                  <td className={cn("p-1.5 text-right tabular-nums", r.overdueOpen > 0 && "text-red-600")}>
                    {r.overdueOpen}
                  </td>
                  <td className="p-1.5 text-right tabular-nums">{r.avgCloseDays ?? "—"}</td>
                  <td className="p-1.5 text-right tabular-nums">{r.repeat}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    {t("action_empty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </AdminTableScroll>
      </CardContent>
    </Card>
  )
}

/** 월간 성과표 — 기한이 해당 월인 과제 기준 */
export function StoreActionScorecard(props: { t: (k: string) => string }) {
  const { t } = props
  const [month, setMonth] = useState(() => getBangkokTodayDateString().slice(0, 7))
  const [data, setData] = useState<StoreActionScorecardResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getStoreActionScorecard(month))
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    void load()
  }, [load])

  const total = data?.total
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-[150px] text-xs" />
        <Button type="button" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
          <Search className="h-3.5 w-3.5" />
        </Button>
        <p className="text-[11px] text-muted-foreground">{t("action_sc_hint")}</p>
      </div>

      {total ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: t("action_sc_total"), value: String(total.total) },
            { label: t("action_sc_on_time_rate"), value: `${total.onTimeRate}%` },
            { label: t("action_sc_overdue_open"), value: String(total.overdueOpen) },
            { label: t("action_sc_avg_days"), value: total.avgCloseDays == null ? "—" : String(total.avgCloseDays) },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground">{k.label}</p>
                <p className="text-xl font-bold tabular-nums">{loading ? "—" : k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <ScoreTable title={t("action_sc_by_store")} keyLabel={t("store_filter_store")} rows={data?.byStore || []} t={t} />
      <div className="grid gap-3 xl:grid-cols-2">
        <ScoreTable title={t("action_sc_by_owner")} keyLabel={t("action_field_owner")} rows={data?.byOwner || []} t={t} />
        <ScoreTable
          title={t("action_sc_by_verifier")}
          keyLabel={t("action_field_verifier")}
          rows={data?.byVerifier || []}
          t={t}
        />
      </div>
    </div>
  )
}

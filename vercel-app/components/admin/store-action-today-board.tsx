"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { appAlert } from "@/lib/app-message"
import { getStoreActionItems, type StoreActionItem } from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { addDaysYmd, storeActionLabelers } from "@/lib/store-action-i18n"
import { cn } from "@/lib/utils"

type Group = { key: string; title: string; tone: string; rows: StoreActionItem[] }

/** 오늘 할 일 — 기한초과·오늘 마감·재확인 대기·이번 주 마감 + 방문 추천 매장 */
export function StoreActionTodayBoard(props: {
  t: (k: string) => string
  canVerify: boolean
  onOpen: (id: number) => void
  refreshKey?: number
}) {
  const { t, canVerify, onOpen, refreshKey } = props
  const [mineOnly, setMineOnly] = useState(true)
  const [rows, setRows] = useState<StoreActionItem[]>([])
  const [loading, setLoading] = useState(false)
  const today = getBangkokTodayDateString()
  const weekEnd = addDaysYmd(today, 7)
  const label = storeActionLabelers(t)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await getStoreActionItems({ openOnly: true, mine: mineOnly }))
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [mineOnly])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const groups: Group[] = useMemo(() => {
    const overdue = rows.filter((r) => r.overdue)
    const pending = rows.filter((r) => r.status === "pending_verify")
    const dueToday = rows.filter((r) => !r.overdue && r.status !== "pending_verify" && r.dueDate === today)
    const week = rows.filter(
      (r) => !r.overdue && r.status !== "pending_verify" && r.dueDate > today && r.dueDate <= weekEnd
    )
    return [
      { key: "overdue", title: t("action_today_overdue"), tone: "border-red-500/50", rows: overdue },
      { key: "pending", title: t("action_today_pending"), tone: "border-amber-500/50", rows: pending },
      { key: "today", title: t("action_today_due_today"), tone: "border-blue-500/50", rows: dueToday },
      { key: "week", title: t("action_today_due_week"), tone: "border-slate-400/50", rows: week },
    ]
  }, [rows, today, weekEnd, t])

  const visitRank = useMemo(() => {
    const score = new Map<string, { overdue: number; pending: number; today: number }>()
    for (const r of rows) {
      const s = score.get(r.store) || { overdue: 0, pending: 0, today: 0 }
      if (r.overdue) s.overdue += 1
      else if (r.status === "pending_verify") s.pending += 1
      else if (r.dueDate === today) s.today += 1
      score.set(r.store, s)
    }
    return [...score.entries()]
      .map(([store, s]) => ({ store, ...s, w: s.overdue * 3 + s.pending * 2 + s.today }))
      .filter((x) => x.w > 0)
      .sort((a, b) => b.w - a.w)
      .slice(0, 8)
  }, [rows, today])

  const copyLine = async () => {
    const lines: string[] = [`${t("action_today_line_head")} (${today})`, ""]
    for (const g of groups) {
      if (g.key === "week" || g.rows.length === 0) continue
      lines.push(`**${g.title} ${g.rows.length}**`)
      for (const r of g.rows.slice(0, 15)) {
        lines.push(`- ${r.store} · ${r.title} · ${r.ownerName} (${r.dueDate || "-"})`)
      }
      lines.push("")
    }
    if (lines.length <= 2) lines.push(t("action_today_none"))
    lines.push(t("action_today_line_tail"))
    const text = lines.join("\n").trim()
    try {
      await navigator.clipboard.writeText(text)
      await appAlert(t("action_today_copied"))
    } catch {
      await appAlert(text)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canVerify ? (
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              className={cn("rounded px-2 py-1", mineOnly && "bg-primary text-primary-foreground")}
              onClick={() => setMineOnly(true)}
            >
              {t("action_today_mine")}
            </button>
            <button
              type="button"
              className={cn("rounded px-2 py-1", !mineOnly && "bg-primary text-primary-foreground")}
              onClick={() => setMineOnly(false)}
            >
              {t("action_today_all")}
            </button>
          </div>
        ) : null}
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          {t("btn_query_go")}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void copyLine()}>
          <Copy className="mr-1 h-3.5 w-3.5" />
          {t("action_today_copy_line")}
        </Button>
      </div>

      {visitRank.length > 0 ? (
        <Card>
          <CardContent className="p-3">
            <p className="mb-1 text-xs font-semibold">{t("action_today_visit_rank")}</p>
            <div className="flex flex-wrap gap-1.5">
              {visitRank.map((v) => (
                <span key={v.store} className="rounded border px-2 py-0.5 text-[11px]">
                  {v.store}
                  {v.overdue ? <span className="ml-1 text-red-600">●{v.overdue}</span> : null}
                  {v.pending ? <span className="ml-1 text-amber-600">●{v.pending}</span> : null}
                  {v.today ? <span className="ml-1 text-blue-600">●{v.today}</span> : null}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.key} className={cn("border-l-4", g.tone)}>
            <CardContent className="space-y-1.5 p-3">
              <p className="text-xs font-semibold">
                {g.title} <span className="tabular-nums text-muted-foreground">{loading ? "—" : g.rows.length}</span>
              </p>
              {g.rows.length === 0 && !loading ? (
                <p className="text-[11px] text-muted-foreground">-</p>
              ) : (
                g.rows.slice(0, 30).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="block w-full rounded border px-2 py-1.5 text-left text-[11px] hover:bg-muted/40"
                    onClick={() => onOpen(r.id)}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{r.title}</span>
                      <span className={cn("tabular-nums", r.overdue && "font-semibold text-red-600")}>
                        {r.dueDate || "—"}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {r.store} · {r.ownerName} · {label.status(r.status)}
                      {r.repeatCount > 0 ? ` · ${t("action_repeat_n").replace("{n}", String(r.repeatCount))}` : ""}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

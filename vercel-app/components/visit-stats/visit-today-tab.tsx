"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RefreshCw } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateVisitPurpose } from "@/lib/visit-i18n"
import { useAuth } from "@/lib/auth-context"
import {
  getStoreVisitTodaySnapshot,
  type StoreVisitTodaySnapshotSegment,
  type StoreVisitTodaySnapshotActive,
} from "@/lib/api-client"
import { RankedBarChart } from "./ranked-bar-chart"
import {
  AdminDesktopOnly,
  AdminMobileOnly,
} from "@/components/erp/admin-responsive-list"
import { attendanceBusinessDayBoundsMs } from "@/lib/attendance-utils"
import { useErpPolling } from "@/lib/erp-page-visibility"

const TZ = "Asia/Bangkok"
const POLL_MS = 60_000

function formatTimeBangkok(iso: string): string {
  const d = Date.parse(iso)
  if (Number.isNaN(d)) return iso
  return new Date(d).toLocaleTimeString(undefined, { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
}

function clipSegmentToBusinessWindow(
  seg: StoreVisitTodaySnapshotSegment,
  businessDateYmd: string,
  nowMs: number
): { leftPct: number; widthPct: number } | null {
  const { startMs, endMsExclusive } = attendanceBusinessDayBoundsMs(businessDateYmd)
  const s = Date.parse(seg.startAt)
  if (Number.isNaN(s)) return null
  const eRaw = seg.ongoing || !seg.endAt ? nowMs : Date.parse(seg.endAt)
  const e = Number.isNaN(eRaw) ? nowMs : eRaw
  const clipS = Math.max(s, startMs)
  const clipE = Math.min(e, endMsExclusive)
  if (clipE <= clipS) return null
  const winLen = endMsExclusive - startMs
  const leftPct = ((clipS - startMs) / winLen) * 100
  const widthPct = ((clipE - clipS) / winLen) * 100
  return { leftPct, widthPct: Math.max(widthPct, 0.25) }
}

function elapsedLabel(startedIso: string, nowMs: number, t: (k: string) => string): string {
  const s = Date.parse(startedIso)
  if (Number.isNaN(s)) return ""
  const m = Math.max(0, Math.floor((nowMs - s) / 60000))
  if (m < 60) return `${m}${t("att_min_unit")}`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}${t("att_min_unit")}` : `${h}h`
}

export function VisitTodayTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [todayYmd, setTodayYmd] = useState("")
  const [active, setActive] = useState<StoreVisitTodaySnapshotActive[]>([])
  const [segments, setSegments] = useState<StoreVisitTodaySnapshotSegment[]>([])
  const [byStore, setByStore] = useState<{ store: string; activeCount: number; segmentsTodayCount: number }[]>([])
  const [autoRefresh, setAutoRefresh] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getStoreVisitTodaySnapshot({
        userStore: auth?.store || "",
        userRole: auth?.role || "",
      })
      if (data.error) setError(data.error)
      setTodayYmd(data.today || "")
      setActive(data.active || [])
      setSegments(data.segments || [])
      setByStore(data.byStore || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setActive([])
      setSegments([])
      setByStore([])
    } finally {
      setLoading(false)
    }
  }, [auth?.store, auth?.role])

  useEffect(() => {
    load()
  }, [load])

  useErpPolling(load, POLL_MS, { enabled: autoRefresh, refetchOnActivate: true })

  useErpPolling(() => setTick((x) => x + 1), 30_000)

  const businessWindowTickLabels = useMemo(() => {
    if (!todayYmd) return [] as string[]
    const { startMs, endMsExclusive } = attendanceBusinessDayBoundsMs(todayYmd)
    const winLen = endMsExclusive - startMs
    const n = 5
    const labels: string[] = []
    for (let i = 0; i < n; i++) {
      const ms = i === n - 1 ? endMsExclusive - 60_000 : startMs + (winLen * i) / (n - 1)
      labels.push(
        new Date(ms).toLocaleTimeString(undefined, {
          timeZone: TZ,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      )
    }
    return labels
  }, [todayYmd])
  const visitorNames = useMemo(() => {
    const s = new Set<string>()
    for (const x of segments) s.add(x.name)
    for (const x of active) s.add(x.name)
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [segments, active])
  const visitorStores = useMemo(() => {
    const s = new Set<string>()
    for (const x of segments) s.add(x.store)
    for (const x of active) s.add(x.store)
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [segments, active])

  const visitorPurposes = useMemo(() => {
    const s = new Set<string>()
    for (const x of segments) {
      const p = String(x.purpose || "").trim() || "기타"
      s.add(p)
    }
    for (const x of active) {
      const p = String(x.purpose || "").trim() || "기타"
      s.add(p)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [segments, active])

  const storeChartData = useMemo(() => {
    const nowMs = Date.now()
    const map = new Map<string, { totalMin: number; visits: number }>()
    for (const seg of segments) {
      const s = Date.parse(seg.startAt)
      const e = seg.ongoing || !seg.endAt ? nowMs : Date.parse(seg.endAt)
      if (Number.isNaN(s)) continue
      const endOk = Number.isNaN(e) ? nowMs : e
      const min = Math.max(0, Math.floor((endOk - s) / 60000))
      const cur = map.get(seg.store) || { totalMin: 0, visits: 0 }
      cur.totalMin += min
      cur.visits += 1
      map.set(seg.store, cur)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, totalMin: v.totalMin, visits: v.visits }))
      .sort((a, b) => b.totalMin - a.totalMin || b.visits - a.visits)
  }, [segments, tick])

  const storeChartHeight = useMemo(
    () => Math.min(520, Math.max(200, 48 + storeChartData.length * 26)),
    [storeChartData.length]
  )

  void tick
  const now = Date.now()

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-3">
          {todayYmd ? (
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                {t("visit_today_date_label")}: <span className="font-medium text-foreground">{todayYmd}</span>
              </p>
              <p className="text-[10px]">{t("visit_today_business_window_hint")}</p>
            </div>
          ) : null}
          <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? t("loading") : t("visit_today_refresh")}
          </Button>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={autoRefresh} onCheckedChange={(v) => setAutoRefresh(!!v)} />
            {t("visit_today_auto_refresh")}
          </label>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("visit_today_error")}: {error}
        </div>
      ) : null}

      {!loading && (visitorNames.length > 0 || visitorStores.length > 0 || visitorPurposes.length > 0) ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("visit_today_overview_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <p className="font-medium text-muted-foreground mb-1.5">
                {t("visit_today_overview_people")} ({visitorNames.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visitorNames.map((n) => (
                  <span key={n} className="rounded-md border bg-muted/40 px-2 py-0.5 font-medium">
                    {n}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="font-medium text-muted-foreground mb-1.5">
                {t("visit_today_overview_stores")} ({visitorStores.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visitorStores.map((st) => (
                  <span key={st} className="rounded-md border bg-muted/40 px-2 py-0.5">
                    {st}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="font-medium text-muted-foreground mb-1.5">
                {t("visit_today_overview_purposes")} ({visitorPurposes.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visitorPurposes.map((raw) => (
                  <span key={raw} className="rounded-md border bg-muted/40 px-2 py-0.5 text-amber-900/90 dark:text-amber-200/90">
                    {translateVisitPurpose(raw, t) || raw}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!loading && storeChartData.length > 0 ? (
        <RankedBarChart
          title={t("visit_today_store_chart_title")}
          color="#2563eb"
          data={storeChartData}
          yAxisWidth={132}
          heightPx={storeChartHeight}
        />
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("visit_today_active_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">{t("visit_today_active_empty")}</p>
          ) : (
            <>
            <AdminDesktopOnly>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium">{t("visit_today_col_employee")}</th>
                    <th className="p-2 text-left font-medium">{t("visit_dept_col")}</th>
                    <th className="p-2 text-left font-medium">{t("visit_today_col_store")}</th>
                    <th className="p-2 text-left font-medium">{t("visit_today_col_purpose")}</th>
                    <th className="p-2 text-left font-medium">{t("visit_today_col_started")}</th>
                    <th className="p-2 text-right font-medium">{t("visit_col_duration")}</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((a) => (
                    <tr key={`${a.name}-${a.store}-${a.startedAt}`} className="border-b border-border/60">
                      <td className="p-2 font-medium">{a.name}</td>
                      <td className="p-2">{a.department}</td>
                      <td className="p-2">{a.store}</td>
                      <td className="p-2">{translateVisitPurpose(a.purpose, t) || "-"}</td>
                      <td className="p-2 tabular-nums">{formatTimeBangkok(a.startedAt)}</td>
                      <td className="p-2 text-right tabular-nums text-primary font-medium">
                        {elapsedLabel(a.startedAt, now, t)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </AdminDesktopOnly>
            <AdminMobileOnly className="divide-y divide-border/60 rounded-lg border border-border/60">
              {active.map((a) => (
                <div key={`${a.name}-${a.store}-${a.startedAt}`} className="space-y-1 px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{a.name}</p>
                    <span className="text-xs font-medium tabular-nums text-primary">
                      {elapsedLabel(a.startedAt, now, t)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {a.store} · {a.department || "-"} · {translateVisitPurpose(a.purpose, t) || "-"}
                  </p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {t("visit_today_col_started")}: {formatTimeBangkok(a.startedAt)}
                  </p>
                </div>
              ))}
            </AdminMobileOnly>
            </>
          )}
        </CardContent>
      </Card>

      {byStore.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("visit_today_by_store")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {byStore.map((b) => (
                <div
                  key={b.store}
                  className="rounded-md border bg-muted/30 px-3 py-2 text-xs"
                >
                  <span className="font-medium">{b.store}</span>
                  <span className="text-muted-foreground ml-2">
                    {t("visit_today_summary_active")} {b.activeCount}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    · {t("visit_today_summary_segments")} {b.segmentsTodayCount}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("visit_today_timeline_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">{t("visit_today_segments_empty")}</p>
          ) : (
            <>
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[720px] flex h-6 items-end justify-between border-b border-border/80 px-1 text-[10px] text-muted-foreground">
                  {businessWindowTickLabels.map((lb, i) => (
                    <span key={i} className="tabular-nums">
                      {lb}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-2 overflow-x-auto">
                <div className="min-w-[720px] space-y-2">
                  {segments.map((seg, idx) => {
                    const bar = todayYmd ? clipSegmentToBusinessWindow(seg, todayYmd, now) : null
                    return (
                      <div key={`${seg.name}-${seg.startAt}-${idx}`} className="grid grid-cols-[160px_1fr] gap-2 items-center text-xs">
                        <div className="min-w-0 truncate pr-1" title={`${seg.name} · ${seg.store} · ${seg.purpose}`}>
                          <span className="font-medium">{seg.name}</span>
                          <span className="text-muted-foreground block truncate text-[10px]">{seg.store}</span>
                          <span className="text-foreground/90 block truncate text-[10px] font-medium">
                            {translateVisitPurpose(seg.purpose, t) || "-"}
                          </span>
                        </div>
                        <div className="relative h-7 rounded bg-muted/50 overflow-hidden">
                          {bar ? (
                            <div
                              className={`absolute top-1 bottom-1 rounded ${seg.ongoing ? "bg-primary/80" : "bg-primary/50"}`}
                              style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%`, minWidth: 2 }}
                              title={`${formatTimeBangkok(seg.startAt)} – ${seg.ongoing ? t("visit_today_ongoing") : seg.endAt ? formatTimeBangkok(seg.endAt) : ""}`}
                            />
                          ) : null}
                        </div>
                        <div className="col-span-2 text-[10px] text-muted-foreground pl-0.5 -mt-1 tabular-nums">
                          {formatTimeBangkok(seg.startAt)}
                          {" – "}
                          {seg.ongoing ? t("visit_today_ongoing") : seg.endAt ? formatTimeBangkok(seg.endAt) : "-"}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

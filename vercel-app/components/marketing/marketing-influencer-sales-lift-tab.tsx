"use client"

import * as React from "react"
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  getMarketingInfluencerSalesLift,
  type InfluencerSalesLiftRow,
  type MarketingCampaign,
  type MarketingInfluencerProfile,
} from "@/lib/api-client"
import {
  SALES_LIFT_WINDOW_OPTIONS,
  addDaysYmd,
  isSalesLiftRowSettled,
  summarizeSalesLiftRows,
  type SalesLiftSeriesPoint,
} from "@/lib/marketing-influencer-sales-lift"

type TFn = (key: string) => string

function fill(template: string, vars: Record<string, string | number>): string {
  let s = template
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

function baht(n: number): string {
  return `฿${Math.round(n).toLocaleString()}`
}

function pctText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
}

function pctClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "text-muted-foreground"
  return n >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
}

function roiText(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(2)}x`
}

type Agg = {
  key: string
  label: string
  n: number
  preSum: number
  postSum: number
  inc: number
  netInc: number
  netN: number
  cost: number
}

function aggregate(rows: InfluencerSalesLiftRow[], keyOf: (r: InfluencerSalesLiftRow) => { key: string; label: string }): Agg[] {
  const m = new Map<string, Agg>()
  for (const r of rows) {
    if (!isSalesLiftRowSettled(r)) continue
    const l = r.lift!
    const { key, label } = keyOf(r)
    const a = m.get(key) || { key, label, n: 0, preSum: 0, postSum: 0, inc: 0, netInc: 0, netN: 0, cost: 0 }
    a.n++
    a.preSum += l.preAvg
    a.postSum += l.postAvg
    a.inc += l.incrementalSales
    if (l.netIncrementalSales != null) {
      a.netInc += l.netIncrementalSales
      a.netN++
    }
    a.cost += l.cost
    m.set(key, a)
  }
  return [...m.values()].sort((a, b) => (b.netN ? b.netInc : b.inc) - (a.netN ? a.netInc : a.inc))
}

function AggTable({ t, title, rows, hasControl }: { t: TFn; title: string; rows: Agg[]; hasControl: boolean }) {
  if (!rows.length) return null
  return (
    <div className="overflow-x-auto rounded-xl border border-border/80">
      <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold">{title}</div>
      <table className="w-full min-w-[560px] border-collapse text-xs">
        <thead>
          <tr className="border-b text-left text-[10px] text-muted-foreground">
            <th className="px-3 py-1.5" />
            <th className="px-3 py-1.5 text-right">{t("mktInfLiftColUploads")}</th>
            <th className="px-3 py-1.5 text-right">{t("mktInfLiftColLift")}</th>
            <th className="px-3 py-1.5 text-right">{t("mktInfLiftColIncremental")}</th>
            {hasControl ? <th className="px-3 py-1.5 text-right">{t("mktInfLiftColNetIncremental")}</th> : null}
            <th className="px-3 py-1.5 text-right">{t("mktInfLiftColCost")}</th>
            <th className="px-3 py-1.5 text-right">ROI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const lift = a.preSum > 0 ? ((a.postSum - a.preSum) / a.preSum) * 100 : null
            const roi = a.cost > 0 ? (hasControl && a.netN ? a.netInc : a.inc) / a.cost : null
            return (
              <tr key={a.key} className="border-b border-border/30 last:border-0">
                <td className="px-3 py-1.5 font-medium">{a.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{a.n}</td>
                <td className={cn("px-3 py-1.5 text-right tabular-nums", pctClass(lift))}>{pctText(lift)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{baht(a.inc)}</td>
                {hasControl ? (
                  <td className="px-3 py-1.5 text-right tabular-nums">{a.netN ? baht(a.netInc) : "—"}</td>
                ) : null}
                <td className="px-3 py-1.5 text-right tabular-nums">{baht(a.cost)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{roiText(roi)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function KpiCard({ label, value, sub, valueCls }: { label: string; value: string; sub?: string; valueCls?: string }) {
  return (
    <div className="rounded-xl border border-border/80 bg-card px-3 py-2.5">
      <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", valueCls)}>{value}</div>
      {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

/** 일별 매출 막대(전=회색, 후=primary) + 대조군 추세 점선 */
function LiftMiniChart({ t, series }: { t: TFn; series: SalesLiftSeriesPoint[] }) {
  if (!series.length) return <p className="text-[11px] text-muted-foreground">{t("mktInfLiftChartEmpty")}</p>
  const W = Math.max(240, series.length * 12)
  const H = 120
  const pad = 4
  const max = Math.max(1, ...series.map((p) => Math.max(p.sales, p.control ?? 0)))
  const bw = (W - pad * 2) / series.length
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2)
  const firstPost = series.findIndex((p) => p.post)
  const controlPts = series
    .map((p, i) => (p.control == null ? null : `${pad + i * bw + bw / 2},${y(p.control)}`))
    .filter(Boolean)
    .join(" ")
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img">
        {series.map((p, i) => (
          <rect
            key={p.date}
            x={pad + i * bw + bw * 0.15}
            y={y(p.sales)}
            width={bw * 0.7}
            height={Math.max(0, H - pad - y(p.sales))}
            className={p.post ? "fill-primary/80" : "fill-muted-foreground/35"}
          >
            <title>{`${p.date} ${baht(p.sales)}`}</title>
          </rect>
        ))}
        {firstPost > 0 ? (
          <line
            x1={pad + firstPost * bw}
            x2={pad + firstPost * bw}
            y1={0}
            y2={H}
            className="stroke-amber-500"
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
        ) : null}
        {controlPts ? (
          <polyline points={controlPts} fill="none" className="stroke-sky-600" strokeWidth={1.5} strokeDasharray="4 3" />
        ) : null}
      </svg>
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-muted-foreground/35" />
          {t("mktInfLiftChartPre")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-primary/80" />
          {t("mktInfLiftChartPost")}
        </span>
        {controlPts ? (
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 border-t-2 border-dashed border-sky-600" />
            {t("mktInfLiftChartControl")}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function MarketingInfluencerSalesLiftTab(props: {
  t: TFn
  profiles: MarketingInfluencerProfile[]
  campaigns: MarketingCampaign[]
  stores: string[]
  formatStoreLabel: (s: string) => string
  campaignLabel: (id: string | null | undefined) => string
}) {
  const { t, profiles, campaigns, stores, formatStoreLabel, campaignLabel } = props
  const today = React.useMemo(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }), [])
  const [from, setFrom] = React.useState(() => addDaysYmd(today, -90))
  const [to, setTo] = React.useState(today)
  const [windowDays, setWindowDays] = React.useState<number>(7)
  const [store, setStore] = React.useState("")
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [profileFilter, setProfileFilter] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [rows, setRows] = React.useState<InfluencerSalesLiftRow[] | null>(null)
  const [meta, setMeta] = React.useState<{ timedOut?: boolean; skipped?: number; error?: string; hasControl?: boolean }>({})
  const [openId, setOpenId] = React.useState<string | null>(null)

  const profileById = React.useMemo(() => {
    const m = new Map<string, MarketingInfluencerProfile>()
    for (const p of profiles) m.set(p.id, p)
    return m
  }, [profiles])

  const profileOptions = React.useMemo(
    () => [...profiles].sort((a, b) => a.displayName.localeCompare(b.displayName, "th")),
    [profiles]
  )

  const run = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getMarketingInfluencerSalesLift({
        from,
        to,
        windowDays,
        store: store || undefined,
        profileId: profileFilter || undefined,
        campaignId: campaignFilter && campaignFilter !== "__unlinked" ? campaignFilter : undefined,
        unlinked: campaignFilter === "__unlinked",
      })
      if (!res.success) {
        setRows([])
        setMeta({ error: res.message })
        return
      }
      setRows(res.rows || [])
      setMeta({ timedOut: res.timedOut, skipped: res.skippedNoStoreOrDate, hasControl: res.hasControl })
    } finally {
      setLoading(false)
    }
  }, [from, to, windowDays, store, campaignFilter, profileFilter])

  React.useEffect(() => {
    void run()
  }, [])

  const displayName = React.useCallback(
    (r: InfluencerSalesLiftRow) => {
      const p = r.profileId ? profileById.get(r.profileId) : undefined
      return p?.displayName || r.contactName || r.name || "—"
    },
    [profileById]
  )

  const hasControl = Boolean(meta.hasControl)
  const kpi = React.useMemo(() => summarizeSalesLiftRows(rows || []), [rows])

  const byProfile = React.useMemo(
    () =>
      aggregate(rows || [], (r) => ({
        key: r.profileId || `name:${(r.name || r.contactName).toLowerCase()}`,
        label: displayName(r),
      })),
    [rows, displayName]
  )
  const byStore = React.useMemo(
    () => aggregate(rows || [], (r) => ({ key: r.store, label: formatStoreLabel(r.store) })),
    [rows, formatStoreLabel]
  )

  const colCount = hasControl ? 13 : 12

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        {t("mktInfLiftHint")}
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/70 bg-muted/10 p-2 sm:p-3">
        <div>
          <Label className="text-[10px] text-muted-foreground">{t("mktInfLiftFrom")}</Label>
          <Input type="date" className="h-8 w-[9rem] text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">{t("mktInfLiftTo")}</Label>
          <Input type="date" className="h-8 w-[9rem] text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">{t("mktInfLiftWindow")}</Label>
          <select
            className="flex h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
          >
            {SALES_LIFT_WINDOW_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {fill(t("mktInfLiftWindowDays"), { n })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">{t("marketingInfluencersFieldStore")}</Label>
          <select
            className="flex h-8 max-w-[11rem] rounded-md border border-input bg-background px-2 text-xs"
            value={store}
            onChange={(e) => setStore(e.target.value)}
          >
            <option value="">{t("mktInfFilterAllStores")}</option>
            {stores.map((s) => (
              <option key={s} value={s}>
                {formatStoreLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">{t("mktInfLiftFilterProfile")}</Label>
          <select
            className="flex h-8 max-w-[12rem] rounded-md border border-input bg-background px-2 text-xs"
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
          >
            <option value="">{t("all")}</option>
            {profileOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
                {p.tiktokHandle ? ` (@${p.tiktokHandle})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">{t("mktInfCampaignOptional")}</Label>
          <select
            className="flex h-8 max-w-[14rem] rounded-md border border-input bg-background px-2 text-xs"
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
          >
            <option value="">{t("all")}</option>
            <option value="__unlinked">{t("mktInfCampaignNone")}</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {campaignLabel(c.id)}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" size="sm" className="h-8" disabled={loading} onClick={() => void run()}>
          {loading ? t("loading") : t("btn_query")}
        </Button>
      </div>

      {meta.error ? <p className="text-xs text-destructive">{meta.error}</p> : null}
      {meta.timedOut ? <p className="text-xs text-amber-700 dark:text-amber-300">{t("mktInfLiftTimedOut")}</p> : null}
      {meta.skipped ? <p className="text-[11px] text-muted-foreground">{fill(t("mktInfLiftSkipped"), { n: meta.skipped })}</p> : null}

      {loading && rows == null ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : !rows || rows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{t("mktInfLiftEmpty")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard
              label={t("mktInfLiftKpiSettled")}
              value={`${kpi.settled} / ${kpi.total}`}
              sub={t("mktInfLiftKpiSettledSub")}
            />
            <KpiCard label={t("mktInfLiftKpiCost")} value={baht(kpi.cost)} />
            <KpiCard
              label={hasControl ? t("mktInfLiftKpiNetIncremental") : t("mktInfLiftKpiIncremental")}
              value={baht(hasControl && kpi.netIncremental != null ? kpi.netIncremental : kpi.incremental)}
              sub={hasControl ? `${t("mktInfLiftKpiIncremental")} ${baht(kpi.incremental)}` : undefined}
            />
            <KpiCard
              label={hasControl ? t("mktInfLiftKpiNetRoi") : "ROI"}
              value={roiText(hasControl && kpi.netRoi != null ? kpi.netRoi : kpi.roi)}
              sub={hasControl ? `ROI ${roiText(kpi.roi)}` : undefined}
            />
            <KpiCard
              label={hasControl ? t("mktInfLiftKpiAvgNetLift") : t("mktInfLiftKpiAvgLift")}
              value={pctText(hasControl && kpi.avgNetLiftPct != null ? kpi.avgNetLiftPct : kpi.avgLiftPct)}
              valueCls={pctClass(hasControl && kpi.avgNetLiftPct != null ? kpi.avgNetLiftPct : kpi.avgLiftPct)}
              sub={hasControl ? `${t("mktInfLiftColLift")} ${pctText(kpi.avgLiftPct)}` : undefined}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {hasControl ? t("mktInfLiftControlHint") : t("mktInfLiftNoControlHint")}
          </p>

          <div className="overflow-x-auto rounded-xl border border-border/80">
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <th className="w-6 px-1 py-2.5" />
                  <th className="min-w-[140px] px-3 py-2.5">{t("mktInfLiftColPost")}</th>
                  <th className="px-3 py-2.5">{t("marketingInfluencersFieldStore")}</th>
                  <th className="whitespace-nowrap px-3 py-2.5">{t("mktInfLiftColPublish")}</th>
                  <th className="px-3 py-2.5 text-right">{t("mktInfLiftColPreAvg")}</th>
                  <th className="px-3 py-2.5 text-right">{t("mktInfLiftColPostAvg")}</th>
                  <th className="px-3 py-2.5 text-right">{t("mktInfLiftColLift")}</th>
                  {hasControl ? <th className="px-3 py-2.5 text-right">{t("mktInfLiftColNetLift")}</th> : null}
                  <th className="px-3 py-2.5 text-right">{t("mktInfLiftColOrders")}</th>
                  <th className="px-3 py-2.5 text-right">{t("mktInfLiftColIncremental")}</th>
                  <th className="px-3 py-2.5 text-right">{t("mktInfLiftColCost")}</th>
                  <th className="px-3 py-2.5 text-right">ROI</th>
                  <th className="px-3 py-2.5">{t("mktInfLiftColFlags")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const l = r.lift
                  const open = openId === r.id
                  const flags: { text: string; cls: string }[] = []
                  if (r.unavailable) flags.push({ text: t("mktInfLiftFlagUnavailable"), cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" })
                  if (r.publishDateEstimated) flags.push({ text: t("mktInfLiftFlagEstimated"), cls: "bg-violet-100 text-violet-900 dark:bg-violet-900/35 dark:text-violet-200" })
                  if (l?.notStarted) flags.push({ text: t("mktInfLiftFlagNotStarted"), cls: "bg-muted text-muted-foreground" })
                  else if (l?.pending)
                    flags.push({
                      text: fill(t("mktInfLiftFlagPending"), { d: l.postDaysCounted, n: l.windowDays }),
                      cls: "bg-sky-100 text-sky-900 dark:bg-sky-900/35 dark:text-sky-200",
                    })
                  if (l?.overlap) flags.push({ text: t("mktInfLiftFlagOverlap"), cls: "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100" })
                  if (l?.noSales && !l.notStarted) flags.push({ text: t("mktInfLiftFlagNoSales"), cls: "bg-rose-100 text-rose-900 dark:bg-rose-900/35 dark:text-rose-200" })
                  const handle = r.name.replace(/^@/, "")
                  const roi = hasControl && l?.netRoi != null ? l.netRoi : l?.roi
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        className={cn("cursor-pointer border-b border-border/40 hover:bg-muted/30", open && "bg-muted/20")}
                        onClick={() => setOpenId(open ? null : r.id)}
                      >
                        <td className="px-1 py-2 align-top text-muted-foreground">
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium leading-snug">{displayName(r)}</div>
                          {handle && displayName(r) !== handle ? <div className="text-[11px] text-muted-foreground">@{handle}</div> : null}
                          <div className="text-[10px] text-muted-foreground">
                            {r.campaignId ? campaignLabel(r.campaignId) || r.campaignId : t("mktInfCampaignNone")}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-xs">{formatStoreLabel(r.store)}</td>
                        <td className="whitespace-nowrap px-3 py-2 align-top text-xs">{r.publishDate}</td>
                        <td className="px-3 py-2 text-right align-top text-xs tabular-nums">{l ? baht(l.preAvg) : "—"}</td>
                        <td className="px-3 py-2 text-right align-top text-xs tabular-nums">
                          {l && l.postDaysCounted > 0 ? baht(l.postAvg) : "—"}
                        </td>
                        <td className={cn("px-3 py-2 text-right align-top text-xs font-semibold tabular-nums", pctClass(l?.liftPct))}>
                          {pctText(l?.liftPct)}
                        </td>
                        {hasControl ? (
                          <td className={cn("px-3 py-2 text-right align-top text-xs font-semibold tabular-nums", pctClass(l?.netLiftPct))}>
                            {pctText(l?.netLiftPct)}
                            {l?.controlLiftPct != null ? (
                              <div className="text-[10px] font-normal text-muted-foreground">
                                {t("mktInfLiftControlShort")} {pctText(l.controlLiftPct)}
                              </div>
                            ) : null}
                          </td>
                        ) : null}
                        <td className={cn("px-3 py-2 text-right align-top text-xs tabular-nums", pctClass(l?.ordersLiftPct))}>
                          {pctText(l?.ordersLiftPct)}
                        </td>
                        <td className="px-3 py-2 text-right align-top text-xs tabular-nums">
                          {l && l.postDaysCounted > 0
                            ? baht(hasControl && l.netIncrementalSales != null ? l.netIncrementalSales : l.incrementalSales)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right align-top text-xs tabular-nums">{l ? baht(l.cost) : "—"}</td>
                        <td className="px-3 py-2 text-right align-top text-xs tabular-nums">{roiText(roi)}</td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-wrap gap-1">
                            {flags.map((f, i) => (
                              <span key={i} className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium", f.cls)}>
                                {f.text}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b border-border/40 bg-muted/10">
                          <td colSpan={colCount} className="px-4 py-3">
                            <div className="mb-1 text-[11px] font-medium">
                              {fill(t("mktInfLiftChartTitle"), { pre: l?.preFrom ?? "", post: l?.postFrom ?? r.publishDate })}
                            </div>
                            <LiftMiniChart t={t} series={r.series || []} />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("mktInfLiftNote")}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <AggTable t={t} title={t("mktInfLiftByProfile")} rows={byProfile} hasControl={hasControl} />
            <AggTable t={t} title={t("mktInfLiftByStore")} rows={byStore} hasControl={hasControl} />
          </div>
        </>
      )}
    </div>
  )
}

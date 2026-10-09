"use client"

import * as React from "react"
import { TrendingUp } from "lucide-react"
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
import { SALES_LIFT_WINDOW_OPTIONS, addDaysYmd } from "@/lib/marketing-influencer-sales-lift"

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

/** 합계에 넣을 수 있는(완료·비겹침·매출 있음) 행 */
function isSettled(r: InfluencerSalesLiftRow): boolean {
  const l = r.lift
  return Boolean(l && !l.pending && !l.overlap && !l.noSales && !l.notStarted && !r.unavailable)
}

type Agg = { key: string; label: string; n: number; preSum: number; postSum: number; inc: number; cost: number }

function aggregate(rows: InfluencerSalesLiftRow[], keyOf: (r: InfluencerSalesLiftRow) => { key: string; label: string }): Agg[] {
  const m = new Map<string, Agg>()
  for (const r of rows) {
    if (!isSettled(r)) continue
    const { key, label } = keyOf(r)
    const a = m.get(key) || { key, label, n: 0, preSum: 0, postSum: 0, inc: 0, cost: 0 }
    a.n++
    a.preSum += r.lift!.preAvg
    a.postSum += r.lift!.postAvg
    a.inc += r.lift!.incrementalSales
    a.cost += r.lift!.cost
    m.set(key, a)
  }
  return [...m.values()].sort((a, b) => b.inc - a.inc)
}

function AggTable({ t, title, rows }: { t: TFn; title: string; rows: Agg[] }) {
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
            <th className="px-3 py-1.5 text-right">{t("mktInfLiftColCost")}</th>
            <th className="px-3 py-1.5 text-right">ROI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const lift = a.preSum > 0 ? ((a.postSum - a.preSum) / a.preSum) * 100 : null
            const roi = a.cost > 0 ? a.inc / a.cost : null
            return (
              <tr key={a.key} className="border-b border-border/30 last:border-0">
                <td className="px-3 py-1.5 font-medium">{a.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{a.n}</td>
                <td className={cn("px-3 py-1.5 text-right tabular-nums", pctClass(lift))}>{pctText(lift)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{baht(a.inc)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{baht(a.cost)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{roi == null ? "—" : `${roi.toFixed(2)}x`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
  const [loading, setLoading] = React.useState(false)
  const [rows, setRows] = React.useState<InfluencerSalesLiftRow[] | null>(null)
  const [meta, setMeta] = React.useState<{ timedOut?: boolean; skipped?: number; error?: string }>({})

  const profileById = React.useMemo(() => {
    const m = new Map<string, MarketingInfluencerProfile>()
    for (const p of profiles) m.set(p.id, p)
    return m
  }, [profiles])

  const run = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getMarketingInfluencerSalesLift({
        from,
        to,
        windowDays,
        store: store || undefined,
        campaignId: campaignFilter && campaignFilter !== "__unlinked" ? campaignFilter : undefined,
        unlinked: campaignFilter === "__unlinked",
      })
      if (!res.success) {
        setRows([])
        setMeta({ error: res.message })
        return
      }
      setRows(res.rows || [])
      setMeta({ timedOut: res.timedOut, skipped: res.skippedNoStoreOrDate })
    } finally {
      setLoading(false)
    }
  }, [from, to, windowDays, store, campaignFilter])

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
          <div className="overflow-x-auto rounded-xl border border-border/80">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <th className="min-w-[140px] px-3 py-2.5">{t("mktInfLiftColPost")}</th>
                  <th className="px-3 py-2.5">{t("marketingInfluencersFieldStore")}</th>
                  <th className="whitespace-nowrap px-3 py-2.5">{t("mktInfLiftColPublish")}</th>
                  <th className="px-3 py-2.5 text-right">{t("mktInfLiftColPreAvg")}</th>
                  <th className="px-3 py-2.5 text-right">{t("mktInfLiftColPostAvg")}</th>
                  <th className="px-3 py-2.5 text-right">{t("mktInfLiftColLift")}</th>
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
                  const flags: { text: string; cls: string }[] = []
                  if (r.unavailable) flags.push({ text: t("mktInfLiftFlagUnavailable"), cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" })
                  if (l?.notStarted) flags.push({ text: t("mktInfLiftFlagNotStarted"), cls: "bg-muted text-muted-foreground" })
                  else if (l?.pending)
                    flags.push({
                      text: fill(t("mktInfLiftFlagPending"), { d: l.postDaysCounted, n: l.windowDays }),
                      cls: "bg-sky-100 text-sky-900 dark:bg-sky-900/35 dark:text-sky-200",
                    })
                  if (l?.overlap) flags.push({ text: t("mktInfLiftFlagOverlap"), cls: "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100" })
                  if (l?.noSales && !l.notStarted) flags.push({ text: t("mktInfLiftFlagNoSales"), cls: "bg-rose-100 text-rose-900 dark:bg-rose-900/35 dark:text-rose-200" })
                  return (
                    <tr key={r.id} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium leading-snug">{displayName(r)}</div>
                        {r.name && displayName(r) !== r.name ? <div className="text-[11px] text-muted-foreground">@{r.name}</div> : null}
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
                      <td className={cn("px-3 py-2 text-right align-top text-xs tabular-nums", pctClass(l?.ordersLiftPct))}>
                        {pctText(l?.ordersLiftPct)}
                      </td>
                      <td className="px-3 py-2 text-right align-top text-xs tabular-nums">
                        {l && l.postDaysCounted > 0 ? baht(l.incrementalSales) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right align-top text-xs tabular-nums">{l ? baht(l.cost) : "—"}</td>
                      <td className="px-3 py-2 text-right align-top text-xs tabular-nums">
                        {l?.roi == null ? "—" : `${l.roi.toFixed(2)}x`}
                      </td>
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
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("mktInfLiftNote")}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <AggTable t={t} title={t("mktInfLiftByProfile")} rows={byProfile} />
            <AggTable t={t} title={t("mktInfLiftByStore")} rows={byStore} />
          </div>
        </>
      )}
    </div>
  )
}

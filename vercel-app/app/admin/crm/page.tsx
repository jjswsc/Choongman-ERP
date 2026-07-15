"use client"

import * as React from "react"
import Link from "next/link"
import {
  LayoutDashboard,
  RefreshCw,
  Search,
  Gift,
  UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { CrmPageHero, CrmKpiCard } from "@/components/crm/crm-shared-ui"
import { apiFetch } from "@/lib/api/fetch"
import {
  CRM_SEGMENT_KEYS,
  CRM_SEGMENT_DESC_KEYS,
  buildCrmSegmentHref,
  type CrmSegmentKey,
} from "@/lib/i18n-crm"
import { CRM_SEGMENT_LABEL_KEYS } from "@/lib/i18n-crm-segments"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getBangkokDateTimeString } from "@/lib/bangkok-time"

type Summary = {
  totalMembers: number
  recentActiveMembers: number
  dormantMembers: number
  totalLifetimeAmount: number
  avgOrderAmount: number
}

type SegmentMember = {
  id: number
  name: string
  phone: string
  memberNo?: string
  tierCode?: string
  pointBalance?: number
  lastVisitedAt?: string
  joinStoreCode?: string
}

type StoreStat = {
  storeCode: string
  activeMembers: number
  newMembers: number
  dormantMembers: number
}

const ACTION_SEGMENTS: CrmSegmentKey[] = ["dormant90", "atRisk", "new30"]

async function loadSummary(recentDays: number, dormantDays: number): Promise<Summary> {
  const q = new URLSearchParams({
    recentDays: String(recentDays),
    dormantDays: String(dormantDays),
  })
  const res = await apiFetch(`/api/crm/summary?${q}`, { cache: "no-store" })
  if (!res.ok) {
    return { totalMembers: 0, recentActiveMembers: 0, dormantMembers: 0, totalLifetimeAmount: 0, avgOrderAmount: 0 }
  }
  const data = (await res.json()) as { success: boolean; summary?: Summary }
  return (
    data.summary || {
      totalMembers: 0,
      recentActiveMembers: 0,
      dormantMembers: 0,
      totalLifetimeAmount: 0,
      avgOrderAmount: 0,
    }
  )
}

function formatVisit(v?: string): string {
  const s = String(v || "").trim()
  if (!s) return "—"
  return s.slice(0, 16).replace("T", " ")
}

export default function CrmDashboardPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [draftRecentDays, setDraftRecentDays] = React.useState("30")
  const [draftDormantDays, setDraftDormantDays] = React.useState("90")
  const [recentDays, setRecentDays] = React.useState(30)
  const [dormantDays, setDormantDays] = React.useState(90)
  const [storeFilter, setStoreFilter] = React.useState("")
  const [summary, setSummary] = React.useState<Summary>({
    totalMembers: 0,
    recentActiveMembers: 0,
    dormantMembers: 0,
    totalLifetimeAmount: 0,
    avgOrderAmount: 0,
  })
  const [segmentCounts, setSegmentCounts] = React.useState<Partial<Record<CrmSegmentKey, number>>>({})
  const [actionQueues, setActionQueues] = React.useState<Partial<Record<CrmSegmentKey, SegmentMember[]>>>({})
  const [storeStats, setStoreStats] = React.useState<StoreStat[]>([])
  const [updatedAt, setUpdatedAt] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  const segmentHref = React.useCallback(
    (segment: CrmSegmentKey, storeCode?: string) =>
      buildCrmSegmentHref({
        segment,
        storeCode: storeCode || storeFilter || undefined,
        recentDays,
        dormantDays,
      }),
    [recentDays, dormantDays, storeFilter]
  )

  const refresh = React.useCallback(
    async (nextRecent = recentDays, nextDormant = dormantDays, nextStore = storeFilter) => {
      setLoading(true)
      try {
        const countQ = new URLSearchParams({
          recentDays: String(nextRecent),
          dormantDays: String(nextDormant),
        })
        if (nextStore) countQ.set("storeCode", nextStore)

        const storeQ = new URLSearchParams({
          recentDays: String(nextRecent),
          dormantDays: String(nextDormant),
        })

        const [sum, segRes, storeRes, ...queueRes] = await Promise.all([
          loadSummary(nextRecent, nextDormant),
          apiFetch(`/api/crm/segment-counts?${countQ}`, { cache: "no-store" }),
          apiFetch(`/api/crm/store-stats?${storeQ}`, { cache: "no-store" }),
          ...ACTION_SEGMENTS.map((seg) => {
            const q = new URLSearchParams({
              segment: seg,
              limit: "10",
              recentDays: String(nextRecent),
              dormantDays: String(nextDormant),
            })
            if (nextStore) q.set("storeCode", nextStore)
            return apiFetch(`/api/crm/segments?${q}`, { cache: "no-store" })
          }),
        ])
        setSummary(sum)
        const segData = (await segRes.json()) as { counts?: Partial<Record<CrmSegmentKey, number>> }
        setSegmentCounts(segData.counts || {})
        const storeData = (await storeRes.json()) as { rows?: StoreStat[] }
        setStoreStats(storeData.rows || [])

        const queues: Partial<Record<CrmSegmentKey, SegmentMember[]>> = {}
        for (let i = 0; i < ACTION_SEGMENTS.length; i++) {
          const res = queueRes[i]
          if (!res?.ok) {
            queues[ACTION_SEGMENTS[i]] = []
            continue
          }
          const data = (await res.json()) as { rows?: SegmentMember[] }
          queues[ACTION_SEGMENTS[i]] = data.rows || []
        }
        setActionQueues(queues)
        setUpdatedAt(getBangkokDateTimeString())
      } finally {
        setLoading(false)
      }
    },
    [recentDays, dormantDays, storeFilter]
  )

  React.useEffect(() => {
    void refresh(30, 90, "")
    // 최초 1회만 — 검색 버튼으로만 재조회
  }, [])

  const runSearch = React.useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      const nextRecent = Math.max(7, Math.min(365, Number(draftRecentDays) || 30))
      const nextDormant = Math.max(14, Math.min(720, Number(draftDormantDays) || 90))
      setDraftRecentDays(String(nextRecent))
      setDraftDormantDays(String(nextDormant))
      setRecentDays(nextRecent)
      setDormantDays(nextDormant)
      void refresh(nextRecent, nextDormant, storeFilter)
    },
    [draftRecentDays, draftDormantDays, storeFilter, refresh]
  )

  const dormantRate =
    summary.totalMembers > 0 ? `${((summary.dormantMembers / summary.totalMembers) * 100).toFixed(1)}%` : "—"

  const storeOptions = React.useMemo(() => {
    return storeStats
      .map((s) => s.storeCode)
      .filter((c) => c && c !== "__unset__")
  }, [storeStats])

  const filteredStoreStats = React.useMemo(() => {
    if (!storeFilter) return storeStats
    return storeStats.filter((s) => s.storeCode === storeFilter)
  }, [storeStats, storeFilter])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <CrmSubnav />
        <CrmPageHero
          icon={LayoutDashboard}
          title={t("crmDashTitle")}
          description={t("crmDashSub")}
          gradient="from-slate-50 to-indigo-50"
          border="border-slate-200/70"
          iconClass="bg-indigo-500/10 text-indigo-600"
          actions={
            <Button variant="outline" size="sm" onClick={() => runSearch()} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {t("adminOpsCenterReload")}
            </Button>
          }
        />

        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={runSearch}>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("crmDashRecentDays")}</Label>
            <Input
              type="number"
              min={7}
              max={365}
              value={draftRecentDays}
              onChange={(e) => setDraftRecentDays(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("crmDashDormantDays")}</Label>
            <Input
              type="number"
              min={14}
              max={720}
              value={draftDormantDays}
              onChange={(e) => setDraftDormantDays(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("crmDashStoreFilter")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
            >
              <option value="">{t("crmDashStoreAll")}</option>
              {storeOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
              {storeStats.some((s) => s.storeCode === "__unset__") ? (
                <option value="__unset__">—</option>
              ) : null}
            </select>
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" disabled={loading}>
              <Search className="mr-1.5 h-4 w-4" />
              {loading ? t("loading") : t("btn_query")}
            </Button>
          </div>
        </form>

        {updatedAt ? (
          <p className="text-xs text-muted-foreground">
            {t("crmDashLastUpdated")}: {updatedAt}
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <CrmKpiCard label={t("crmDashKpiTotal")} value={summary.totalMembers.toLocaleString()} href="/admin/members" />
          <CrmKpiCard
            label={`${t("crmDashKpiRecent")} (${recentDays}${t("days")})`}
            value={summary.recentActiveMembers.toLocaleString()}
            tone="success"
            href={segmentHref("recent30")}
          />
          <CrmKpiCard
            label={`${t("crmDashKpiDormant")} (${dormantDays}${t("days")})`}
            value={summary.dormantMembers.toLocaleString()}
            tone="warning"
            hint={`${t("crmDashDormantRate")}: ${dormantRate}`}
            href={segmentHref("dormant90")}
          />
          <CrmKpiCard label={t("crmDashKpiLifetime")} value={summary.totalLifetimeAmount.toLocaleString()} />
          <CrmKpiCard label={t("crmDashKpiAvgTicket")} value={summary.avgOrderAmount.toLocaleString()} tone="primary" />
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{t("crmDashTodayActions")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("crmDashTodayActionsHint")}</p>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-3">
            {ACTION_SEGMENTS.map((seg) => {
              const rows = actionQueues[seg] || []
              return (
                <div key={seg} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{t(CRM_SEGMENT_LABEL_KEYS[seg])}</p>
                    <Link href={segmentHref(seg)} className="text-xs text-primary hover:underline">
                      {t("crmDashViewAllSegment")}
                    </Link>
                  </div>
                  <ul className="space-y-2">
                    {rows.map((r) => (
                      <li key={r.id} className="flex items-start justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.name || r.phone || `#${r.id}`}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.phone}
                            {r.joinStoreCode ? ` · ${r.joinStoreCode}` : ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{formatVisit(r.lastVisitedAt)}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button asChild variant="outline" size="sm" className="h-7 px-2">
                            <Link href={`/admin/members?memberId=${r.id}`}>
                              <UserRound className="h-3.5 w-3.5" />
                              <span className="sr-only">{t("crmDashOpenMember")}</span>
                            </Link>
                          </Button>
                          <Button asChild variant="outline" size="sm" className="h-7 px-2">
                            <Link href={`/admin/crm/coupons?tab=issue&memberId=${r.id}`}>
                              <Gift className="h-3.5 w-3.5" />
                              <span className="sr-only">{t("crmDashIssueCoupon")}</span>
                            </Link>
                          </Button>
                        </div>
                      </li>
                    ))}
                    {!rows.length ? (
                      <li className="py-4 text-center text-xs text-muted-foreground">{t("crmDashNoActionRows")}</li>
                    ) : null}
                  </ul>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{t("crmDashStoreCompare")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("crmDashStoreCompareHint")}</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">{t("crmDashStoreCode")}</th>
                    <th className="p-2 text-right">{t("crmDashStoreActive")}</th>
                    <th className="p-2 text-right">{t("crmDashStoreNew")}</th>
                    <th className="p-2 text-right">{t("crmDashStoreDormant")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStoreStats.map((row) => {
                    const code = row.storeCode === "__unset__" ? "—" : row.storeCode
                    const linkStore = row.storeCode
                    return (
                      <tr key={row.storeCode} className="border-t hover:bg-muted/20">
                        <td className="p-2">
                          <Link
                            href={segmentHref("dormant90", linkStore)}
                            className="font-medium text-primary hover:underline"
                          >
                            {code}
                          </Link>
                        </td>
                        <td className="p-2 text-right tabular-nums">{row.activeMembers.toLocaleString()}</td>
                        <td className="p-2 text-right tabular-nums">
                          <Link href={segmentHref("new30", linkStore)} className="hover:underline">
                            {row.newMembers.toLocaleString()}
                          </Link>
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          <Link href={segmentHref("dormant90", linkStore)} className="hover:underline">
                            {row.dormantMembers.toLocaleString()}
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                  {!filteredStoreStats.length && !loading ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        {t("noData")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("crmDashSegmentPreview")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {CRM_SEGMENT_KEYS.map((key) => (
                <Link
                  key={key}
                  href={segmentHref(key)}
                  className="rounded-lg border p-3 transition hover:border-primary/40 hover:bg-muted/30"
                >
                  <p className="text-sm font-semibold">{t(CRM_SEGMENT_LABEL_KEYS[key])}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t(CRM_SEGMENT_DESC_KEYS[key])}</p>
                  <p className="mt-2 text-xl font-bold tabular-nums text-primary">
                    {(segmentCounts[key] ?? 0).toLocaleString()}
                  </p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

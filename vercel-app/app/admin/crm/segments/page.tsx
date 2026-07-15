"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Target, Download, Megaphone, Gift, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import {
  CrmPageHero,
  CrmSegmentBadge,
  CrmMemberLink,
  CrmActionBar,
  CrmOutlineButton,
} from "@/components/crm/crm-shared-ui"
import { apiFetch } from "@/lib/api/fetch"
import { downloadCsv } from "@/lib/crm-export"
import { CRM_SEGMENT_DESC_KEYS, CRM_SEGMENT_KEYS, type CrmSegmentKey } from "@/lib/i18n-crm"
import { CRM_SEGMENT_LABEL_KEYS } from "@/lib/i18n-crm-segments"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import { useErpRefetchOnActivate } from "@/lib/erp-page-visibility"

type SegmentRow = {
  id: number
  name: string
  phone: string
  memberNo?: string
  tierCode: string
  pointBalance: number
  lifetimeAmount: number
  lastVisitedAt?: string
  joinStoreCode?: string
  createdAt?: string
  tierPoints?: number
}

function isSegmentKey(v: string | null): v is CrmSegmentKey {
  return Boolean(v && (CRM_SEGMENT_KEYS as readonly string[]).includes(v))
}

function fmtDate(v?: string): string {
  const s = String(v || "").trim()
  if (!s) return "—"
  return s.slice(0, 16).replace("T", " ")
}

export default function CrmSegmentsPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const initialSeg = searchParams.get("segment")
  const initialStore = searchParams.get("store") || searchParams.get("storeCode") || ""
  const initialDays = Number(searchParams.get("days") || searchParams.get("recentDays") || 30)
  const initialDormant = Number(searchParams.get("dormantDays") || 90)

  const [segment, setSegment] = React.useState<CrmSegmentKey>(
    isSegmentKey(initialSeg) ? initialSeg : "recent30"
  )
  const [storeCode, setStoreCode] = React.useState(initialStore)
  const [recentDays, setRecentDays] = React.useState(
    Number.isFinite(initialDays) ? Math.max(7, Math.min(365, initialDays)) : 30
  )
  const [dormantDays, setDormantDays] = React.useState(
    Number.isFinite(initialDormant) ? Math.max(14, Math.min(720, initialDormant)) : 90
  )
  const [draftRecentDays, setDraftRecentDays] = React.useState(String(recentDays))
  const [draftDormantDays, setDraftDormantDays] = React.useState(String(dormantDays))
  const [storeOptions, setStoreOptions] = React.useState<string[]>([])
  const [rows, setRows] = React.useState<SegmentRow[]>([])
  const [counts, setCounts] = React.useState<Partial<Record<CrmSegmentKey, number>>>({})
  const [loading, setLoading] = React.useState(false)
  const [filterDraft, setFilterDraft] = React.useState("")
  const [filterQ, setFilterQ] = React.useState("")

  const queryBase = React.useCallback(() => {
    const q = new URLSearchParams({
      recentDays: String(recentDays),
      dormantDays: String(dormantDays),
    })
    if (storeCode) q.set("storeCode", storeCode)
    return q
  }, [recentDays, dormantDays, storeCode])

  const loadCounts = React.useCallback(async () => {
    const q = queryBase()
    const res = await apiFetch(`/api/crm/segment-counts?${q}`, { cache: "no-store" })
    const data = (await res.json()) as { counts?: Partial<Record<CrmSegmentKey, number>> }
    setCounts(data.counts || {})
  }, [queryBase])

  const loadStoreOptions = React.useCallback(async () => {
    const q = new URLSearchParams({
      recentDays: String(recentDays),
      dormantDays: String(dormantDays),
    })
    const res = await apiFetch(`/api/crm/store-stats?${q}`, { cache: "no-store" })
    if (!res.ok) return
    const data = (await res.json()) as { rows?: Array<{ storeCode?: string }> }
    const codes = (data.rows || [])
      .map((r) => String(r.storeCode || "").trim())
      .filter((c) => c && c !== "__unset__")
    setStoreOptions(codes)
  }, [recentDays, dormantDays])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const q = queryBase()
      q.set("segment", segment)
      q.set("limit", "1000")
      const res = await apiFetch(`/api/crm/segments?${q}`, { cache: "no-store" })
      if (!res.ok) {
        setRows([])
        return
      }
      const data = (await res.json()) as { success: boolean; rows?: SegmentRow[] }
      setRows(data.rows || [])
    } finally {
      setLoading(false)
    }
  }, [segment, queryBase])

  React.useEffect(() => {
    loadCounts().catch(() => {})
    loadStoreOptions().catch(() => {})
  }, [loadCounts, loadStoreOptions])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  useErpRefetchOnActivate(() => {
    void loadCounts()
    void load()
  })

  React.useEffect(() => {
    const s = searchParams.get("segment")
    if (isSegmentKey(s)) setSegment(s)
    const store = searchParams.get("store") || searchParams.get("storeCode")
    if (store != null) setStoreCode(store)
    const days = Number(searchParams.get("days") || searchParams.get("recentDays") || NaN)
    if (Number.isFinite(days)) {
      const n = Math.max(7, Math.min(365, days))
      setRecentDays(n)
      setDraftRecentDays(String(n))
    }
    const dorm = Number(searchParams.get("dormantDays") || NaN)
    if (Number.isFinite(dorm)) {
      const n = Math.max(14, Math.min(720, dorm))
      setDormantDays(n)
      setDraftDormantDays(String(n))
    }
  }, [searchParams])

  React.useEffect(() => {
    setFilterDraft("")
    setFilterQ("")
  }, [segment, storeCode])

  const filteredRows = React.useMemo(() => {
    const q = filterQ.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [r.name, r.phone, r.memberNo, r.tierCode, r.joinStoreCode, String(r.id)]
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, filterQ])

  const exportCsv = () => {
    downloadCsv(
      `crm-segment-${segment}.csv`,
      [
        t("crmSegColMemberNo"),
        t("crmSeg_colName"),
        t("crmSeg_colPhone"),
        t("crmSeg_colTier"),
        t("crmSeg_colPoints"),
        t("crmSeg_colLifetime"),
        t("crmSegColLastVisit"),
        t("crmSegColJoinStore"),
        t("crmSegColCreated"),
      ],
      filteredRows.map((r) => [
        r.memberNo || "",
        r.name,
        r.phone,
        r.tierCode,
        String(r.pointBalance),
        String(r.lifetimeAmount),
        fmtDate(r.lastVisitedAt),
        r.joinStoreCode || "",
        fmtDate(r.createdAt),
      ])
    )
  }

  const runFilterSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    setFilterQ(filterDraft.trim())
  }

  const applyDayStore = (e?: React.FormEvent) => {
    e?.preventDefault()
    const nextRecent = Math.max(7, Math.min(365, Number(draftRecentDays) || 30))
    const nextDormant = Math.max(14, Math.min(720, Number(draftDormantDays) || 90))
    setDraftRecentDays(String(nextRecent))
    setDraftDormantDays(String(nextDormant))
    setRecentDays(nextRecent)
    setDormantDays(nextDormant)
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <CrmSubnav />
        <CrmPageHero
          icon={Target}
          title={t("adminCrmSegments")}
          description={t("crmSeg_pageSub")}
          gradient="from-violet-50 to-indigo-50"
          border="border-violet-200/60"
          iconClass="bg-violet-500/10 text-violet-600"
        />

        <Card>
          <CardHeader>
            <CardTitle>{t("adminCrmSegments")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t(CRM_SEGMENT_DESC_KEYS[segment])}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {CRM_SEGMENT_KEYS.map((key) => (
                <Button key={key} variant={segment === key ? "default" : "outline"} onClick={() => setSegment(key)}>
                  {t(CRM_SEGMENT_LABEL_KEYS[key])}
                  <CrmSegmentBadge count={counts[key]} />
                </Button>
              ))}
            </div>

            <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={applyDayStore}>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("crmSegStoreFilter")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value)}
                >
                  <option value="">{t("crmDashStoreAll")}</option>
                  {storeOptions.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                  <option value="__unset__">—</option>
                </select>
              </div>
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
              <div className="flex items-end gap-2 sm:col-span-2">
                <Button type="submit" size="sm">
                  <Search className="mr-1 h-4 w-4" />
                  {t("btn_query")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => load()} disabled={loading}>
                  {loading ? t("crmSeg_querying") : t("adminOpsCenterReload")}
                </Button>
              </div>
            </form>

            <form className="flex flex-wrap items-center gap-2" onSubmit={runFilterSearch}>
              <Input
                value={filterDraft}
                onChange={(e) => setFilterDraft(e.target.value)}
                placeholder={t("crmVisitsSearchMemberPh") || "이름 · 전화"}
                className="max-w-xs"
              />
              <Button type="submit" size="sm" variant="secondary">
                <Search className="mr-1 h-4 w-4" />
                {t("btn_query")}
              </Button>
            </form>
            <p className="text-sm text-muted-foreground">
              {tr(t, "crmSeg_targetCount", { count: filteredRows.length.toLocaleString() })}
            </p>
            <CrmActionBar>
              <CrmOutlineButton onClick={exportCsv} disabled={!filteredRows.length}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t("crmSegExportCsv")}
              </CrmOutlineButton>
              <CrmOutlineButton asChild>
                <Link href={`/admin/crm/coupons?tab=campaigns&audience=${segment}`}>
                  <Megaphone className="mr-1.5 h-3.5 w-3.5" />
                  {t("crmSegCreateCampaign")}
                </Link>
              </CrmOutlineButton>
              <CrmOutlineButton asChild>
                <Link href="/admin/crm/coupons?tab=issue">
                  <Gift className="mr-1.5 h-3.5 w-3.5" />
                  {t("crmSegIssueCoupon")}
                </Link>
              </CrmOutlineButton>
            </CrmActionBar>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("crmSeg_resultsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">{t("crmSeg_colName")}</th>
                    <th className="p-2 text-left">{t("crmSeg_colPhone")}</th>
                    <th className="p-2 text-left">{t("crmSegColJoinStore")}</th>
                    <th className="p-2 text-left">{t("crmSeg_colTier")}</th>
                    <th className="p-2 text-right">{t("crmSeg_colPoints")}</th>
                    <th className="p-2 text-right">{t("crmSeg_colLifetime")}</th>
                    <th className="p-2 text-left">{t("crmSegColLastVisit")}</th>
                    <th className="p-2 text-left">{t("crmSegColCreated")}</th>
                    <th className="p-2 text-left">{t("crmSegOpenMember")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.phone}</td>
                      <td className="p-2">{r.joinStoreCode || "—"}</td>
                      <td className="p-2">{r.tierCode}</td>
                      <td className="p-2 text-right tabular-nums">{Number(r.pointBalance || 0).toLocaleString()}</td>
                      <td className="p-2 text-right tabular-nums">{Number(r.lifetimeAmount || 0).toLocaleString()}</td>
                      <td className="p-2 whitespace-nowrap text-xs">{fmtDate(r.lastVisitedAt)}</td>
                      <td className="p-2 whitespace-nowrap text-xs">{fmtDate(r.createdAt)}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          <CrmMemberLink memberId={r.id} name={r.name} memberNo={r.memberNo || r.phone} />
                          <Link
                            href={`/admin/crm/coupons?tab=issue&memberId=${r.id}`}
                            className="text-xs text-primary hover:underline"
                          >
                            {t("crmSegIssueCoupon")}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredRows.length && !loading ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-muted-foreground">
                        {t("noData")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

"use client"

import * as React from "react"
import Link from "next/link"
import {
  LayoutDashboard,
  RefreshCw,
  Users,
  Megaphone,
  Tag,
  LayoutPanelTop,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { CrmPageHero, CrmKpiCard, CrmActionBar, CrmOutlineButton } from "@/components/crm/crm-shared-ui"
import { apiFetch } from "@/lib/api/fetch"
import { CRM_SEGMENT_KEYS, CRM_SEGMENT_DESC_KEYS, type CrmSegmentKey } from "@/lib/i18n-crm"
import { CRM_SEGMENT_LABEL_KEYS } from "@/lib/i18n-crm-segments"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import { getBangkokDateTimeString } from "@/lib/bangkok-time"

type Summary = {
  totalMembers: number
  recentActiveMembers: number
  dormantMembers: number
  totalLifetimeAmount: number
  avgOrderAmount: number
}

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

const SEGMENT_HREF: Record<CrmSegmentKey, string> = {
  recent30: "/admin/crm/segments?segment=recent30",
  dormant90: "/admin/crm/segments?segment=dormant90",
  new30: "/admin/crm/segments?segment=new30",
  vip: "/admin/crm/segments?segment=vip",
  atRisk: "/admin/crm/segments?segment=atRisk",
}

export default function CrmDashboardPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [recentDays, setRecentDays] = React.useState(30)
  const [dormantDays, setDormantDays] = React.useState(90)
  const [summary, setSummary] = React.useState<Summary>({
    totalMembers: 0,
    recentActiveMembers: 0,
    dormantMembers: 0,
    totalLifetimeAmount: 0,
    avgOrderAmount: 0,
  })
  const [segmentCounts, setSegmentCounts] = React.useState<Partial<Record<CrmSegmentKey, number>>>({})
  const [updatedAt, setUpdatedAt] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const [sum, segRes] = await Promise.all([
        loadSummary(recentDays, dormantDays),
        apiFetch("/api/crm/segment-counts", { cache: "no-store" }),
      ])
      setSummary(sum)
      const segData = (await segRes.json()) as { counts?: Partial<Record<CrmSegmentKey, number>> }
      setSegmentCounts(segData.counts || {})
      setUpdatedAt(getBangkokDateTimeString())
    } finally {
      setLoading(false)
    }
  }, [recentDays, dormantDays])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const dormantRate =
    summary.totalMembers > 0 ? `${((summary.dormantMembers / summary.totalMembers) * 100).toFixed(1)}%` : "—"

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
            <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {t("adminOpsCenterReload")}
            </Button>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("crmDashRecentDays")}</Label>
            <Input type="number" min={7} max={365} value={recentDays} onChange={(e) => setRecentDays(Number(e.target.value || 30))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("crmDashDormantDays")}</Label>
            <Input type="number" min={30} max={720} value={dormantDays} onChange={(e) => setDormantDays(Number(e.target.value || 90))} />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button onClick={() => refresh()} disabled={loading}>
              {loading ? t("loading") : t("btn_query")}
            </Button>
          </div>
        </div>

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
            href="/admin/crm/segments?segment=recent30"
          />
          <CrmKpiCard
            label={`${t("crmDashKpiDormant")} (${dormantDays}${t("days")})`}
            value={summary.dormantMembers.toLocaleString()}
            tone="warning"
            hint={`${t("crmDashDormantRate")}: ${dormantRate}`}
            href="/admin/crm/segments?segment=dormant90"
          />
          <CrmKpiCard label={t("crmDashKpiLifetime")} value={summary.totalLifetimeAmount.toLocaleString()} />
          <CrmKpiCard label={t("crmDashKpiAvgTicket")} value={summary.avgOrderAmount.toLocaleString()} tone="primary" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("crmDashSegmentPreview")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CRM_SEGMENT_KEYS.map((key) => (
                <Link
                  key={key}
                  href={SEGMENT_HREF[key]}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("crmDashQuickActions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CrmActionBar>
              <CrmOutlineButton asChild>
                <Link href="/admin/crm/segments">
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                  {t("crmSeg_extractBtn")}
                </Link>
              </CrmOutlineButton>
              <CrmOutlineButton asChild>
                <Link href="/admin/members/visits?tab=rfm">{t("adminCrmRfm")}</Link>
              </CrmOutlineButton>
              <CrmOutlineButton asChild>
                <Link href="/admin/crm/coupons">
                  <Tag className="mr-1.5 h-3.5 w-3.5" />
                  {t("memberCoupons")}
                </Link>
              </CrmOutlineButton>
              <CrmOutlineButton asChild>
                <Link href="/admin/crm/campaigns">
                  <Megaphone className="mr-1.5 h-3.5 w-3.5" />
                  {t("adminCrmCampaigns")}
                </Link>
              </CrmOutlineButton>
              <CrmOutlineButton asChild>
                <Link href="/admin/crm/member-app">
                  <LayoutPanelTop className="mr-1.5 h-3.5 w-3.5" />
                  {t("mpAdmin_pageTitle")}
                </Link>
              </CrmOutlineButton>
              <CrmOutlineButton asChild>
                <Link href="/admin/marketing/integrations">LINE</Link>
              </CrmOutlineButton>
            </CrmActionBar>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

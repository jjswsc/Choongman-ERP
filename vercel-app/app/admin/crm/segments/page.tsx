"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Target, Download, Megaphone, Gift } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  tierCode: string
  pointBalance: number
  lifetimeAmount: number
}

export default function CrmSegmentsPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const initial = (searchParams.get("segment") || "recent30") as CrmSegmentKey
  const [segment, setSegment] = React.useState<CrmSegmentKey>(
    CRM_SEGMENT_KEYS.includes(initial) ? initial : "recent30"
  )
  const [rows, setRows] = React.useState<SegmentRow[]>([])
  const [counts, setCounts] = React.useState<Partial<Record<CrmSegmentKey, number>>>({})
  const [loading, setLoading] = React.useState(false)

  const loadCounts = React.useCallback(async () => {
    const res = await apiFetch("/api/crm/segment-counts", { cache: "no-store" })
    const data = (await res.json()) as { counts?: Partial<Record<CrmSegmentKey, number>> }
    setCounts(data.counts || {})
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/crm/segments?segment=${segment}&limit=1000`, { cache: "no-store" })
      if (!res.ok) {
        setRows([])
        return
      }
      const data = (await res.json()) as { success: boolean; rows?: SegmentRow[] }
      setRows(data.rows || [])
    } finally {
      setLoading(false)
    }
  }, [segment])

  React.useEffect(() => {
    loadCounts().catch(() => {})
  }, [loadCounts])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  useErpRefetchOnActivate(() => {
    void loadCounts()
    void load()
  })

  React.useEffect(() => {
    const s = searchParams.get("segment") as CrmSegmentKey | null
    if (s && CRM_SEGMENT_KEYS.includes(s)) setSegment(s)
  }, [searchParams])

  const exportCsv = () => {
    downloadCsv(
      `crm-segment-${segment}.csv`,
      [
        t("crmSeg_colName"),
        t("crmSeg_colPhone"),
        t("crmSeg_colTier"),
        t("crmSeg_colPoints"),
        t("crmSeg_colLifetime"),
      ],
      rows.map((r) => [
        r.name,
        r.phone,
        r.tierCode,
        String(r.pointBalance),
        String(r.lifetimeAmount),
      ])
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <CrmSubnav />
        <CrmPageHero
          icon={Target}
          title={t("adminCrmSegments")}
          description={t(CRM_SEGMENT_DESC_KEYS[segment])}
          gradient="from-violet-50 to-indigo-50"
          border="border-violet-200/60"
          iconClass="bg-violet-500/10 text-violet-600"
        />

        <Card>
          <CardHeader>
            <CardTitle>{t("adminCrmSegments")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {CRM_SEGMENT_KEYS.map((key) => (
                <Button key={key} variant={segment === key ? "default" : "outline"} onClick={() => setSegment(key)}>
                  {t(CRM_SEGMENT_LABEL_KEYS[key])}
                  <CrmSegmentBadge count={counts[key]} />
                </Button>
              ))}
              <Button variant="outline" onClick={() => load()} disabled={loading}>
                {loading ? t("crmSeg_querying") : t("adminOpsCenterReload")}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {tr(t, "crmSeg_targetCount", { count: rows.length.toLocaleString() })}
            </p>
            <CrmActionBar>
              <CrmOutlineButton onClick={exportCsv} disabled={!rows.length}>
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
                    <th className="p-2 text-left">{t("crmSeg_colTier")}</th>
                    <th className="p-2 text-right">{t("crmSeg_colPoints")}</th>
                    <th className="p-2 text-right">{t("crmSeg_colLifetime")}</th>
                    <th className="p-2 text-left">{t("crmSegOpenMember")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.phone}</td>
                      <td className="p-2">{r.tierCode}</td>
                      <td className="p-2 text-right tabular-nums">{Number(r.pointBalance || 0).toLocaleString()}</td>
                      <td className="p-2 text-right tabular-nums">{Number(r.lifetimeAmount || 0).toLocaleString()}</td>
                      <td className="p-2">
                        <CrmMemberLink memberId={r.id} name={r.name} memberNo={r.phone} />
                      </td>
                    </tr>
                  ))}
                  {!rows.length && !loading ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
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

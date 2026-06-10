"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { apiFetch } from "@/lib/api/fetch"
import { CRM_SEGMENT_LABEL_KEYS } from "@/lib/i18n-crm-segments"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"

type SegmentKey = "recent30" | "dormant90" | "new30" | "vip" | "atRisk"

type SegmentRow = {
  id: number
  name: string
  phone: string
  tierCode: string
  pointBalance: number
  lifetimeAmount: number
}

const SEGMENT_KEYS: SegmentKey[] = ["recent30", "dormant90", "new30", "vip", "atRisk"]

export default function CrmSegmentsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [segment, setSegment] = React.useState<SegmentKey>("recent30")
  const [rows, setRows] = React.useState<SegmentRow[]>([])
  const [loading, setLoading] = React.useState(false)

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
    load().catch(() => {})
  }, [load])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <CrmSubnav />
        <Card>
          <CardHeader>
            <CardTitle>{t("adminCrmSegments")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {SEGMENT_KEYS.map((key) => (
                <Button
                  key={key}
                  variant={segment === key ? "default" : "outline"}
                  onClick={() => setSegment(key)}
                >
                  {t(CRM_SEGMENT_LABEL_KEYS[key])}
                </Button>
              ))}
              <Button variant="outline" onClick={() => load()} disabled={loading}>
                {loading ? t("crmSeg_querying") : t("adminOpsCenterReload")}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {tr(t, "crmSeg_targetCount", { count: rows.length.toLocaleString() })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("crmSeg_resultsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-left">{t("crmSeg_colName")}</th>
                    <th className="p-2 text-left">{t("crmSeg_colPhone")}</th>
                    <th className="p-2 text-left">{t("crmSeg_colTier")}</th>
                    <th className="p-2 text-left">{t("crmSeg_colPoints")}</th>
                    <th className="p-2 text-left">{t("crmSeg_colLifetime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.phone}</td>
                      <td className="p-2">{r.tierCode}</td>
                      <td className="p-2">{Number(r.pointBalance || 0).toLocaleString()}</td>
                      <td className="p-2">{Number(r.lifetimeAmount || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

"use client"

import * as React from "react"
import Link from "next/link"
import { Facebook, Loader2, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMetaConnectionStatus,
  syncMetaAds,
  type MetaConnectionStatus,
  type MetaSyncPayload,
} from "@/lib/api-client/marketing-meta"

function diagnoseLabel(code: string, t: (k: string) => string): string {
  if (code === "not_connected") return t("marketingMetaDiagNotConnected")
  if (code === "table_missing") return t("marketingMetaDiagTableMissing")
  if (code.startsWith("missing_scope:")) return t("marketingMetaDiagMissingScope") + " " + code.slice("missing_scope:".length)
  if (code === "page_insights_need_page_token") return t("marketingMetaDiagNeedPageToken")
  if (code === "no_ad_account_id") return t("marketingMetaDiagNoAdAccount")
  if (code === "page_insights_all_zero" || code === "ads_insights_all_zero") return t("marketingMetaDiagZero")
  if (code.startsWith("ads_insights:") || code.startsWith("page_insights:")) return code
  return code
}

export function MarketingMetaInsightsPanel({ compact }: { compact?: boolean }) {
  const { lang } = useLang()
  const t = useT(lang)
  const [status, setStatus] = React.useState<MetaConnectionStatus | null>(null)
  const [payload, setPayload] = React.useState<MetaSyncPayload | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [syncing, setSyncing] = React.useState(false)

  const applyStatus = React.useCallback((s: MetaConnectionStatus) => {
    setStatus(s)
    const last = s.lastSync
    if (last && Array.isArray(last.ads)) {
      setPayload(last as MetaSyncPayload)
    }
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const s = await getMetaConnectionStatus()
      applyStatus(s)
    } catch {
      setStatus({ connected: false, source: "none", diagnostics: ["load_failed"] })
    } finally {
      setLoading(false)
    }
  }, [applyStatus])

  React.useEffect(() => {
    void load()
  }, [load])

  const sync = async () => {
    setSyncing(true)
    try {
      const r = await syncMetaAds()
      if (r.payload) setPayload(r.payload)
      await load()
    } finally {
      setSyncing(false)
    }
  }

  const totals = payload?.adsTotals
  const ads = payload?.ads || []
  const diagnostics = payload?.diagnostics?.length ? payload.diagnostics : status?.diagnostics || []

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Facebook className="h-4 w-4 text-[#1877F2]" />
          <div>
            <h3 className="text-sm font-semibold">{t("marketingMetaAdsTitle")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("marketingMetaAdsSubtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status?.connected ? "default" : "secondary"}>
            {status?.connected ? t("marketingMetaConnected") : t("marketingMetaDisconnected")}
          </Badge>
          <Button variant="outline" size="sm" className="h-8" onClick={() => void sync()} disabled={syncing || loading}>
            {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
            {t("marketingMetaSync")}
          </Button>
        </div>
      </div>

      {status?.pageName || status?.pageId ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {status.pageName || "—"} · {status.pageId}
          {status.lastSyncedAt ? ` · ${String(status.lastSyncedAt).slice(0, 16).replace("T", " ")}` : ""}
        </p>
      ) : null}

      {!status?.connected ? (
        <p className="text-sm text-muted-foreground">
          {t("marketingMetaConnectHint")}{" "}
          <Link className="text-primary underline" href="/admin/marketing/integrations">
            {t("adminMarketingIntegrations")}
          </Link>
        </p>
      ) : (
        <>
          <div className="mb-3 grid gap-2 sm:grid-cols-4">
            {[
              { label: t("marketingMetaStatAds"), value: totals?.ads ?? 0 },
              { label: t("marketingMetaStatImpr"), value: (totals?.impressions ?? 0).toLocaleString() },
              { label: t("marketingMetaStatReach"), value: (totals?.reach ?? 0).toLocaleString() },
              { label: t("marketingMetaStatSpend"), value: `฿${(totals?.spend ?? 0).toLocaleString()}` },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border bg-muted/20 px-3 py-2">
                <div className="text-[10px] text-muted-foreground">{c.label}</div>
                <div className="text-lg font-semibold tabular-nums">{c.value}</div>
              </div>
            ))}
          </div>
          {!compact && ads.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2 font-medium">{t("marketingMetaColAd")}</th>
                    <th className="py-1 pr-2 font-medium">{t("marketingMetaColCampaign")}</th>
                    <th className="py-1 pr-2 font-medium">{t("marketingMetaStatImpr")}</th>
                    <th className="py-1 pr-2 font-medium">{t("marketingMetaStatReach")}</th>
                    <th className="py-1 pr-2 font-medium">CTR</th>
                    <th className="py-1 font-medium">{t("marketingMetaStatSpend")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.slice(0, 40).map((a) => (
                    <tr key={a.adId || a.adName} className="border-t">
                      <td className="py-1.5 pr-2">{a.adName || a.adId}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{a.campaignName}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{a.impressions.toLocaleString()}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{a.reach.toLocaleString()}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{a.ctr.toFixed(2)}%</td>
                      <td className="py-1.5 tabular-nums">฿{a.spend.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      {diagnostics.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-md border border-amber-400/40 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
          {diagnostics.map((d) => (
            <li key={d}>{diagnoseLabel(d, t)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

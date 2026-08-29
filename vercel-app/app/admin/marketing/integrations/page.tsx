"use client"

import * as React from "react"
import { Settings2, MessageCircle, Facebook, Music2, ExternalLink, Loader2 } from "lucide-react"
import { useT, tr as i18nTr } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getLineOaGroupV2List, getLineOaGroups, getLineOaSegments } from "@/lib/api-client"
import { disconnectMeta, getMetaConnectionStatus, syncMetaAds } from "@/lib/api-client/marketing-meta"
import { appAlert } from "@/lib/app-message"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"
import { IntegrationEnvDocList } from "@/lib/marketing-integration-env-doc"
import { useSearchParams } from "next/navigation"
import type { MetaConnectionStatus } from "@/lib/api-client/marketing-meta"

export default function MarketingIntegrationsPage() {
  const t = useT(useLang().lang)
  const searchParams = useSearchParams()
  const [segmentLoading, setSegmentLoading] = React.useState(false)
  const [segmentPreview, setSegmentPreview] = React.useState<string | null>(null)
  const [groupLoading, setGroupLoading] = React.useState(false)
  const [groupPreview, setGroupPreview] = React.useState<string | null>(null)
  const [groupV2Loading, setGroupV2Loading] = React.useState(false)
  const [groupV2Preview, setGroupV2Preview] = React.useState<string | null>(null)
  const [metaStatus, setMetaStatus] = React.useState<MetaConnectionStatus | null>(null)
  const [metaBusy, setMetaBusy] = React.useState(false)

  const loadMeta = React.useCallback(async () => {
    try {
      setMetaStatus(await getMetaConnectionStatus())
    } catch {
      setMetaStatus({ connected: false, source: "none" })
    }
  }, [])

  React.useEffect(() => {
    void loadMeta()
  }, [loadMeta])

  React.useEffect(() => {
    const code = searchParams.get("meta")
    if (!code) return
    if (code === "ok") void appAlert(t("marketingMetaOauthOk"))
    else if (code === "nopage") void appAlert(t("marketingMetaOauthNoPage"))
    else if (code === "config") void appAlert(t("marketingMetaOauthConfig"))
    else if (code !== "ok") void appAlert(t("marketingMetaOauthFail"))
  }, [searchParams, t])

  const testSegmentList = async () => {
    setSegmentLoading(true)
    setSegmentPreview(null)
    try {
      const r = await getLineOaSegments({ page: 1, size: 50, sort: "id:asc" })
      if (!r.success) {
        await appAlert(r.message || t("adminMarketingLineOaSegmentApiFail"))
        setSegmentPreview(JSON.stringify(r, null, 2))
        return
      }
      setSegmentPreview(JSON.stringify(r, null, 2))
      await appAlert(
        typeof r.total === "number"
          ? i18nTr(t, "adminMarketingLineOaSegmentOkTotal", { total: r.total })
          : t("adminMarketingLineOaSegmentOkList")
      )
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setSegmentLoading(false)
    }
  }

  const testGroupList = async () => {
    setGroupLoading(true)
    setGroupPreview(null)
    try {
      const r = await getLineOaGroups({ page: 1, size: 20, sort: "id:asc" })
      if (!r.success) {
        await appAlert(r.message || t("adminMarketingLineOaGroupApiFail"))
        setGroupPreview(JSON.stringify(r, null, 2))
        return
      }
      setGroupPreview(JSON.stringify(r, null, 2))
      await appAlert(
        typeof r.total === "number"
          ? i18nTr(t, "adminMarketingLineOaGroupOkTotal", { total: r.total })
          : t("adminMarketingLineOaGroupOkList")
      )
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setGroupLoading(false)
    }
  }

  const testGroupV2List = async () => {
    setGroupV2Loading(true)
    setGroupV2Preview(null)
    try {
      const r = await getLineOaGroupV2List({ page: 1, size: 20, sort: "id:asc" })
      if (!r.success) {
        await appAlert(r.message || t("adminMarketingLineOaGroupV2ApiFail"))
        setGroupV2Preview(JSON.stringify(r, null, 2))
        return
      }
      setGroupV2Preview(JSON.stringify(r, null, 2))
      await appAlert(
        typeof r.total === "number"
          ? i18nTr(t, "adminMarketingLineOaGroupV2OkTotal", { total: r.total })
          : t("adminMarketingLineOaGroupV2OkList")
      )
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setGroupV2Loading(false)
    }
  }

  const lineTestOk = Boolean(segmentPreview && segmentPreview.includes('"success": true'))
  const lineTestFail = Boolean(segmentPreview && segmentPreview.includes('"success": false'))

  return (
    <MarketingPageShell maxWidthClass="max-w-3xl">
        <MarketingPageHero
          icon={Settings2}
          title={t("adminMarketingIntegrations")}
          description={t("marketingHeroDescIntegrations")}
        />

        <div className="space-y-4">
          {/* LINE OA */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#00B900]/10">
                <MessageCircle className="h-5 w-5 text-[#00B900]" />
              </div>
              <div>
                <h3 className="font-semibold">LINE Official Account (OA)</h3>
                <p className="text-xs text-muted-foreground">{t("marketingIntegrationLineSubtitle")}</p>
              </div>
              </div>
              <Badge
                className={cn(
                  "shrink-0",
                  lineTestOk && "bg-emerald-600 text-white",
                  lineTestFail && "bg-destructive text-destructive-foreground",
                  !lineTestOk && !lineTestFail && "bg-muted text-muted-foreground"
                )}
              >
                {lineTestOk
                  ? t("marketingIntegrationStatusConfigured")
                  : lineTestFail
                    ? t("adminMarketingLineOaSegmentApiFail")
                    : t("marketingIntegrationStatusUnknown")}
              </Badge>
            </div>
            <details className="mb-3 rounded-lg border bg-muted/20 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                {t("marketingIntegrationStatusDocs")} ({t("marketingIntegrationEnvLabel")})
              </summary>
              <IntegrationEnvDocList doc={t("marketingIntegrationLineEnvDoc")} />
            </details>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={segmentLoading} onClick={testSegmentList}>
                {segmentLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : null}
                {t("marketingIntegrationTestSegmentBtn")}
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={groupLoading} onClick={testGroupList}>
                {groupLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : null}
                {t("marketingIntegrationTestGroupBtn")}
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={groupV2Loading} onClick={testGroupV2List}>
                {groupV2Loading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : null}
                {t("marketingIntegrationTestGroupV2Btn")}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  {t("marketingIntegrationLineConsoleBtn")}
                </a>
              </Button>
            </div>
            {segmentPreview ? (
              <pre className="mt-3 max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
                {segmentPreview}
              </pre>
            ) : null}
            {groupPreview ? (
              <pre className="mt-3 max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
                {groupPreview}
              </pre>
            ) : null}
            {groupV2Preview ? (
              <pre className="mt-3 max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
                {groupV2Preview}
              </pre>
            ) : null}
          </div>

          {/* Meta (IG/FB) */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1877F2]/10">
                <Facebook className="h-5 w-5 text-[#1877F2]" />
              </div>
              <div>
                <h3 className="font-semibold">{t("marketingMetaAdsTitle")}</h3>
                <p className="text-xs text-muted-foreground">{t("marketingIntegrationMetaSubtitle")}</p>
                {metaStatus?.pageName ? (
                  <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    {metaStatus.pageName} · {metaStatus.pageId}
                  </p>
                ) : null}
              </div>
              </div>
              <Badge
                className={cn(
                  "shrink-0",
                  metaStatus?.connected ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {metaStatus?.connected ? t("marketingMetaConnected") : t("marketingMetaDisconnected")}
              </Badge>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 mb-3">
              <li>{t("marketingIntegrationMetaEnvLine1")}</li>
              <li>{t("marketingIntegrationMetaEnvLine2")}</li>
              <li>{t("marketingIntegrationMetaEnvLine3")}</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <a href="/api/meta/oauth/start">{t("marketingMetaConnect")}</a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={metaBusy}
                onClick={() => {
                  setMetaBusy(true)
                  void syncMetaAds()
                    .then(loadMeta)
                    .finally(() => setMetaBusy(false))
                }}
              >
                {metaBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {t("marketingMetaSync")}
              </Button>
              {metaStatus?.connected && metaStatus.source === "oauth" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={metaBusy}
                  onClick={() => {
                    setMetaBusy(true)
                    void disconnectMeta()
                      .then(loadMeta)
                      .finally(() => setMetaBusy(false))
                  }}
                >
                  {t("marketingMetaDisconnect")}
                </Button>
              ) : null}
              <Button variant="outline" size="sm" asChild>
                <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  {t("marketingIntegrationMetaDevBtn")}
                </a>
              </Button>
            </div>
          </div>

          {/* TikTok */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/10">
                <Music2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">TikTok Ads</h3>
                <p className="text-xs text-muted-foreground">{t("marketingIntegrationTikTokSubtitle")}</p>
              </div>
              </div>
              <Badge variant="secondary">{t("marketingIntegrationStatusUnknown")}</Badge>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 mb-3">
              <li>{t("marketingIntegrationTikTokEnvLine1")}</li>
              <li>{t("marketingIntegrationTikTokEnvLine2")}</li>
            </ul>
            <Button variant="outline" size="sm" asChild>
              <a href="https://business-api.tiktok.com/portal/docs" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                {t("marketingIntegrationTikTokDevBtn")}
              </a>
            </Button>
          </div>
        </div>
    </MarketingPageShell>
  )
}

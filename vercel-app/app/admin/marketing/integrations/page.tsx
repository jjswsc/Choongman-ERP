"use client"

import * as React from "react"
import { Settings2, MessageCircle, Facebook, Music2, ExternalLink, Loader2 } from "lucide-react"
import { useT, tr as i18nTr } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getLineOaGroupV2List, getLineOaGroups, getLineOaSegments } from "@/lib/api-client"
import { appAlert } from "@/lib/app-message"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"
import { IntegrationEnvDocList } from "@/lib/marketing-integration-env-doc"

export default function MarketingIntegrationsPage() {
  const t = useT(useLang().lang)
  const [segmentLoading, setSegmentLoading] = React.useState(false)
  const [segmentPreview, setSegmentPreview] = React.useState<string | null>(null)
  const [groupLoading, setGroupLoading] = React.useState(false)
  const [groupPreview, setGroupPreview] = React.useState<string | null>(null)
  const [groupV2Loading, setGroupV2Loading] = React.useState(false)
  const [groupV2Preview, setGroupV2Preview] = React.useState<string | null>(null)

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
                <h3 className="font-semibold">Meta Ads (Instagram / Facebook)</h3>
                <p className="text-xs text-muted-foreground">{t("marketingIntegrationMetaSubtitle")}</p>
              </div>
              </div>
              <Badge variant="secondary">{t("marketingIntegrationStatusUnknown")}</Badge>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 mb-3">
              <li>{t("marketingIntegrationMetaEnvLine1")}</li>
              <li>{t("marketingIntegrationMetaEnvLine2")}</li>
            </ul>
            <Button variant="outline" size="sm" asChild>
              <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                {t("marketingIntegrationMetaDevBtn")}
              </a>
            </Button>
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

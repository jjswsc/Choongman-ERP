"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import Link from "next/link"
import { ExternalLink, Handshake, Megaphone, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"
import { MarketingHubCampaignContextStrip } from "@/components/marketing/marketing-hub-campaign-context-strip"
import {
  getMarketingCampaigns,
  getMarketingCampaign,
  saveMarketingCampaignCollabDetail,
  saveMarketingCampaignDesignDates,
  toggleMarketingCampaignCollabManagement,
  useStoreList,
  type MarketingCampaign,
  type MarketingCampaignDetail,
} from "@/lib/api-client"
import {
  collabDetailToJson,
  emptyMarketingCollabDetail,
  normalizeMarketingCollabDetail,
  type MarketingCollabDetail,
} from "@/lib/marketing-collab-detail"
import { CollabManagementDetailForm } from "@/components/marketing/collab-management-detail-form"
import { CollabManagementOverviewTab } from "@/components/marketing/collab-management-overview-tab"
import { MarketingLinkedCampaignStrip } from "@/components/marketing/marketing-linked-campaign-strip"
import { MarketingHubRecordScheduleCard } from "@/components/marketing/marketing-hub-record-schedule-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useSearchParams } from "next/navigation"

export default function MarketingCollabMenusPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()
  const urlCampaignId = searchParams.get("campaignId")?.trim() ?? ""
  const { stores, loading: storesLoading } = useStoreList()
  const [mainTab, setMainTab] = React.useState<"edit" | "overview">("edit")
  const [list, setList] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string>("")
  const [loadedDetail, setLoadedDetail] = React.useState<MarketingCampaignDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [detailSaving, setDetailSaving] = React.useState(false)
  const [collabFlagSaving, setCollabFlagSaving] = React.useState(false)
  const [draftCollab, setDraftCollab] = React.useState<MarketingCollabDetail>(emptyMarketingCollabDetail())
  const [hubDesignStart, setHubDesignStart] = React.useState("")
  const [hubDesignEnd, setHubDesignEnd] = React.useState("")
  const todayBangkokYmd = React.useMemo(
    () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }),
    []
  )

  const load = React.useCallback(() => {
    setLoading(true)
    return getMarketingCampaigns()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    if (urlCampaignId) setSelectedCampaignId(urlCampaignId)
  }, [urlCampaignId])

  React.useEffect(() => {
    if (!selectedCampaignId) {
      setLoadedDetail(null)
      setDraftCollab(emptyMarketingCollabDetail())
      setDetailLoading(false)
      return
    }
    let cancelled = false
    setLoadedDetail(null)
    setDetailLoading(true)
    getMarketingCampaign(selectedCampaignId)
      .then((d) => {
        if (cancelled || !d) return
        setLoadedDetail(d)
        setDraftCollab(normalizeMarketingCollabDetail(d.collabDetail ?? {}))
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedDetail(null)
          setDraftCollab(emptyMarketingCollabDetail())
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedCampaignId])

  React.useEffect(() => {
    if (!loadedDetail) return
    setHubDesignStart((loadedDetail.designStartDate ?? "").trim())
    setHubDesignEnd((loadedDetail.designEndDate ?? "").trim())
  }, [loadedDetail?.id, loadedDetail?.designStartDate, loadedDetail?.designEndDate])

  const saveCollabDetail = React.useCallback(async () => {
    if (!selectedCampaignId) return
    if (loadedDetail && loadedDetail.collabManagement !== true) {
      await appAlert(t("marketingCollabDetailSaveNeedInclude"))
      return
    }
    setDetailSaving(true)
    try {
      if (loadedDetail?.id && selectedCampaignId === String(loadedDetail.id)) {
        const norm = (s: string) => s.trim()
        const dDirty =
          norm(hubDesignStart) !== norm(loadedDetail.designStartDate ?? "") ||
          norm(hubDesignEnd) !== norm(loadedDetail.designEndDate ?? "")
        if (dDirty) {
          const dr = await saveMarketingCampaignDesignDates({
            campaignId: selectedCampaignId,
            designStartDate: norm(hubDesignStart) || null,
            designEndDate: norm(hubDesignEnd) || null,
          })
          if (!dr.success) {
            await appAlert(dr.message || t("marketingCollabDetailSaveError"))
            return
          }
          const refreshed = await getMarketingCampaign(selectedCampaignId)
          if (refreshed) setLoadedDetail(refreshed)
        }
      }

      const res = await saveMarketingCampaignCollabDetail({
        campaignId: selectedCampaignId,
        collabDetail: collabDetailToJson(draftCollab),
      })
      if (res.success) {
        await appAlert(t("marketingCollabDetailSaved"))
        const d = await getMarketingCampaign(selectedCampaignId)
        if (d) {
          setLoadedDetail(d)
          setDraftCollab(normalizeMarketingCollabDetail(d.collabDetail ?? {}))
        }
        load()
      } else {
        await appAlert(res.message || t("marketingCollabDetailSaveError"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setDetailSaving(false)
    }
  }, [draftCollab, hubDesignEnd, hubDesignStart, load, loadedDetail, selectedCampaignId, t])

  const collabOnly = React.useMemo(
    () => list.filter((c) => c.collabManagement === true),
    [list]
  )

  const applyCollabManagementFlag = React.useCallback(
    async (enabled: boolean) => {
      if (!selectedCampaignId) return
      setCollabFlagSaving(true)
      try {
        const res = await toggleMarketingCampaignCollabManagement({
          campaignId: selectedCampaignId,
          enabled,
        })
        if (!res.success) {
          await appAlert(res.message || t("marketingCollabDetailSaveError"))
          return
        }
        await load()
        const d = await getMarketingCampaign(selectedCampaignId)
        if (d) {
          setLoadedDetail(d)
          setDraftCollab(normalizeMarketingCollabDetail(d.collabDetail ?? {}))
        }
      } catch (e) {
        await appAlert(String(e))
      } finally {
        setCollabFlagSaving(false)
      }
    },
    [load, selectedCampaignId, t]
  )
  const selectedDesignOutOfRange = React.useMemo(() => {
    const s = (hubDesignStart.trim() || (loadedDetail?.designStartDate ?? "")).trim()
    const e = (hubDesignEnd.trim() || (loadedDetail?.designEndDate ?? "")).trim()
    if (!s || !e) return false
    return todayBangkokYmd < s || todayBangkokYmd > e
  }, [hubDesignStart, hubDesignEnd, loadedDetail, todayBangkokYmd])

  return (
    <MarketingPageShell>
      <MarketingPageHero icon={Handshake} title={t("adminMarketingCollabMenus")} />
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v === "overview" ? "overview" : "edit")} className="w-full">
        <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="edit" className="text-xs sm:text-sm">
            {t("marketingCollabTabEdit")}
          </TabsTrigger>
          <TabsTrigger value="overview" className="text-xs sm:text-sm">
            {t("marketingCollabTabOverview")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="mt-0 space-y-6 focus-visible:outline-none">
          <MarketingHubCampaignContextStrip
            value={selectedCampaignId}
            onChange={setSelectedCampaignId}
            campaigns={list}
            hideHubLinkFilter
            allowEmpty
            emptyOptionLabel={t("marketingCollabMenusCampaignPickerAll")}
            onRefresh={load}
            maxListHeightClass="max-h-52"
            disabled={loading}
            aside={
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" asChild>
                <Link href="/admin/marketing/campaigns">
                  <Megaphone className="h-3.5 w-3.5" />
                  {t("adminMarketingCampaigns")}
                </Link>
              </Button>
            }
          />

          {!loading && list.length > 0 && (
            <Card className="overflow-hidden border-primary/15 shadow-md ring-1 ring-primary/5">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  {t("marketingCollabDetailEditorTitle")}
                </h2>
                <p className="text-xs text-muted-foreground">{t("marketingCollabDetailEditorDesc")}</p>
                {!selectedCampaignId ? (
                  <p className="text-sm text-muted-foreground">{t("marketingCollabDetailPickCampaignHint")}</p>
                ) : loadedDetail ? (
                  <>
                    <MarketingLinkedCampaignStrip
                      label={t("marketingAdsOptionsLinkedCampaign")}
                      title={`${loadedDetail.campaignNo ? `[${loadedDetail.campaignNo}] ` : ""}${loadedDetail.topic}`}
                    />
                    {loadedDetail.collabManagement !== true ? (
                      <div className="rounded-lg border border-amber-500/35 bg-amber-50/90 px-3 py-3 dark:bg-amber-950/25">
                        <p className="text-sm font-medium text-amber-950 dark:text-amber-50">
                          {t("marketingCollabIncludeInListTitle")}
                        </p>
                        <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-100/90">
                          {t("marketingCollabIncludeInListHint")}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <Button
                            type="button"
                            size="sm"
                            disabled={collabFlagSaving}
                            onClick={() => void applyCollabManagementFlag(true)}
                          >
                            {t("marketingCollabIncludeInListApply")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
                          <Checkbox
                            id="collab-mgmt-included"
                            checked
                            disabled={collabFlagSaving}
                            onCheckedChange={(v) => {
                              if (v !== true) void applyCollabManagementFlag(false)
                            }}
                            className="mt-0.5"
                          />
                          <label htmlFor="collab-mgmt-included" className="cursor-pointer text-xs leading-snug">
                            <span className="font-medium">{t("marketingCampaignCollabManagementInclude")}</span>
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">
                              {t("marketingCampaignCollabManagementIncludeHint")}
                            </span>
                          </label>
                        </div>
                        <MarketingHubRecordScheduleCard
                          disabled={detailSaving || detailLoading}
                          designOutOfRange={selectedDesignOutOfRange}
                          campaignId={selectedCampaignId}
                          hubDesignStartDate={hubDesignStart}
                          hubDesignEndDate={hubDesignEnd}
                          onHubDesignStartDateChange={setHubDesignStart}
                          onHubDesignEndDateChange={setHubDesignEnd}
                          executionTitle={null}
                          className="mb-4"
                        />
                        {selectedDesignOutOfRange ? (
                          <p className="mb-3 text-[11px] text-amber-700 dark:text-amber-300">
                            {t("marketingDesignTodayOutsidePeriod")}
                          </p>
                        ) : null}
                        <CollabManagementDetailForm
                          t={t}
                          allStoresLabel={t("marketingCollabMenusAllStoresPlan")}
                          basics={{
                            topic: loadedDetail.topic,
                            campaignNo: loadedDetail.campaignNo,
                            startDate: loadedDetail.startDate,
                            endDate: loadedDetail.endDate,
                            branches: loadedDetail.branches ?? [],
                            discountType: loadedDetail.discountType,
                            discountValue: loadedDetail.discountValue,
                            discountTargetAudience: loadedDetail.discountTargetAudience,
                            discountPricePromotion: loadedDetail.discountPricePromotion,
                          }}
                          draft={draftCollab}
                          onChange={setDraftCollab}
                          onSave={saveCollabDetail}
                          saving={detailSaving}
                          loading={detailLoading}
                        />
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                          <Button variant="secondary" size="sm" className="gap-1" asChild>
                            <Link href={`/admin/marketing/campaigns?openCampaign=${encodeURIComponent(selectedCampaignId)}`}>
                              <ExternalLink className="h-3.5 w-3.5" />
                              {t("marketingCollabMenusEditCampaign")}
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1" asChild>
                            <Link href={`/admin/marketing/promos?campaignId=${encodeURIComponent(selectedCampaignId)}`}>
                              <Tag className="h-3.5 w-3.5" />
                              {t("marketingCollabMenusOpenPromos")}
                            </Link>
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                ) : detailLoading ? (
                  <p className="text-sm text-muted-foreground">{t("loading")}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("marketingCollabDetailLoadError")}</p>
                )}
              </CardContent>
            </Card>
          )}

          {loading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}

          {!loading && list.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {t("marketingCollabMenusEmpty")}
              </CardContent>
            </Card>
          )}

          {!loading && list.length > 0 && collabOnly.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">{t("marketingCollabMenusEmptyNoCollabFlag")}</p>
          )}
        </TabsContent>

        <TabsContent value="overview" className="mt-0 focus-visible:outline-none">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <CollabManagementOverviewTab
                campaigns={collabOnly}
                stores={stores}
                storesLoading={storesLoading}
                loading={loading}
                t={t}
                allStoresLabel={t("marketingCollabMenusAllStoresPlan")}
                onGoToEdit={(id) => {
                  setSelectedCampaignId(id)
                  setMainTab("edit")
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </MarketingPageShell>
  )
}

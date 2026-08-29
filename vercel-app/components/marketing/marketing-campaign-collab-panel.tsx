"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { CollabManagementDetailForm } from "@/components/marketing/collab-management-detail-form"
import { CollabManagementOverviewTab } from "@/components/marketing/collab-management-overview-tab"
import { CollabManagementUsageTab } from "@/components/marketing/collab-management-usage-tab"
import { appAlert } from "@/lib/app-message"
import {
  getMarketingCampaign,
  getMarketingCampaigns,
  saveMarketingCampaignCollabDetail,
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
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { getBangkokTodayRangeYmd } from "@/lib/collab-overview-period"

export function MarketingCampaignCollabPanel({ campaignId }: { campaignId: string }) {
  const { lang } = useLang()
  const t = useT(lang)
  const cid = campaignId.trim()
  const { stores, loading: storesLoading } = useStoreList()
  const [tab, setTab] = React.useState<"edit" | "overview" | "usage">("edit")
  const [list, setList] = React.useState<MarketingCampaign[]>([])
  const [loadedDetail, setLoadedDetail] = React.useState<MarketingCampaignDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(true)
  const [detailSaving, setDetailSaving] = React.useState(false)
  const [collabFlagSaving, setCollabFlagSaving] = React.useState(false)
  const [draftCollab, setDraftCollab] = React.useState<MarketingCollabDetail>(emptyMarketingCollabDetail())
  const [overviewPeriodFrom, setOverviewPeriodFrom] = React.useState(() => getBangkokTodayRangeYmd().from)
  const [overviewPeriodTo, setOverviewPeriodTo] = React.useState(() => getBangkokTodayRangeYmd().to)

  const loadList = React.useCallback(() => {
    return getMarketingCampaigns()
      .then(setList)
      .catch(() => setList([]))
  }, [])

  React.useEffect(() => {
    void loadList()
  }, [loadList])

  React.useEffect(() => {
    if (!cid) return
    let cancelled = false
    setDetailLoading(true)
    getMarketingCampaign(cid)
      .then((d) => {
        if (cancelled || !d) return
        setLoadedDetail(d)
        setDraftCollab(normalizeMarketingCollabDetail(d.collabDetail ?? {}))
      })
      .catch(() => {
        if (!cancelled) setLoadedDetail(null)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cid])

  const saveCollabDetail = React.useCallback(async () => {
    if (!cid) return
    if (loadedDetail && loadedDetail.collabManagement !== true) {
      await appAlert(t("marketingCollabDetailSaveNeedInclude"))
      return
    }
    setDetailSaving(true)
    try {
      const res = await saveMarketingCampaignCollabDetail({
        campaignId: cid,
        collabDetail: collabDetailToJson(draftCollab),
      })
      if (res.success) {
        await appAlert(t("marketingCollabDetailSaved"))
        const d = await getMarketingCampaign(cid)
        if (d) {
          setLoadedDetail(d)
          setDraftCollab(normalizeMarketingCollabDetail(d.collabDetail ?? {}))
        }
        void loadList()
      } else {
        await appAlert(res.message || t("marketingCollabDetailSaveError"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setDetailSaving(false)
    }
  }, [cid, draftCollab, loadList, loadedDetail, t])

  const applyCollabManagementFlag = React.useCallback(
    async (enabled: boolean) => {
      if (!cid) return
      setCollabFlagSaving(true)
      try {
        const res = await toggleMarketingCampaignCollabManagement({ campaignId: cid, enabled })
        if (!res.success) {
          await appAlert(res.message || t("marketingCollabDetailSaveError"))
          return
        }
        await loadList()
        const d = await getMarketingCampaign(cid)
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
    [cid, loadList, t]
  )

  const collabOnly = React.useMemo(() => list.filter((c) => c.collabManagement === true), [list])

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "edit" | "overview" | "usage")} className={adminTabsRootCn}>
      <TabsList className={adminTabsListRowCn}>
        <TabsTrigger value="edit" className={adminTabsTriggerCn}>
          {t("marketingCollabTabEdit")}
        </TabsTrigger>
        <TabsTrigger value="overview" className={adminTabsTriggerCn}>
          {t("marketingCollabTabOverview")}
        </TabsTrigger>
        <TabsTrigger value="usage" className={adminTabsTriggerCn}>
          {t("marketingCollabTabUsage")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="edit" className={adminTabsContentCn}>
        {detailLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : !loadedDetail ? (
          <p className="text-sm text-muted-foreground">{t("marketingWsNotFound")}</p>
        ) : loadedDetail.collabManagement !== true ? (
          <div className="rounded-lg border border-amber-500/35 bg-amber-50/90 px-3 py-3 dark:bg-amber-950/25">
            <p className="text-sm font-medium">{t("marketingCollabIncludeInListTitle")}</p>
            <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-100/90">{t("marketingCollabIncludeInListHint")}</p>
            <Button className="mt-3" size="sm" disabled={collabFlagSaving} onClick={() => void applyCollabManagementFlag(true)}>
              {t("marketingCollabIncludeInListApply")}
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-start gap-2 rounded-md border bg-muted/20 px-2.5 py-2">
              <Checkbox
                id="ws-collab-included"
                checked
                disabled={collabFlagSaving}
                onCheckedChange={(v) => {
                  if (v !== true) void applyCollabManagementFlag(false)
                }}
                className="mt-0.5"
              />
              <label htmlFor="ws-collab-included" className="cursor-pointer text-xs leading-snug">
                <span className="font-medium">{t("marketingCampaignCollabManagementInclude")}</span>
              </label>
            </div>
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
          </>
        )}
      </TabsContent>
      <TabsContent value="overview" className={adminTabsContentCn}>
        <CollabManagementOverviewTab
          campaigns={collabOnly.filter((c) => c.id === cid)}
          stores={stores}
          storesLoading={storesLoading}
          loading={false}
          t={t}
          allStoresLabel={t("marketingCollabMenusAllStoresPlan")}
          periodFrom={overviewPeriodFrom}
          periodTo={overviewPeriodTo}
          onPeriodFromChange={setOverviewPeriodFrom}
          onPeriodToChange={setOverviewPeriodTo}
          onGoToEdit={() => setTab("edit")}
        />
      </TabsContent>
      <TabsContent value="usage" className={adminTabsContentCn}>
        <CollabManagementUsageTab campaigns={list.filter((c) => c.id === cid)} t={t} />
      </TabsContent>
    </Tabs>
  )
}

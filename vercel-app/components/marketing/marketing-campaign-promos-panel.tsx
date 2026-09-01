"use client"

import * as React from "react"
import Link from "next/link"
import { ExternalLink, Tag } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PosSetMenuTabWorkspace } from "@/components/erp/pos-set-menu-tab-workspace"
import { PosSetMenuInquiryTab } from "@/components/erp/pos-set-menu-inquiry-tab"
import { MarketingEmptyState } from "@/components/marketing/marketing-empty-state"
import {
  getMarketingCampaigns,
  getPosMenuCategories,
  getPosMenuCategoriesConfig,
  getPosMenus,
  getPosPromos,
  getPosPromoSchemaStatus,
  type MarketingCampaign,
  type PosMenu,
  type PosMenuCategoriesConfig,
  type PosPromo,
} from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translatePosMenuLineForReceipt } from "@/lib/pos-print-translate"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { writeSelectedMarketingCampaignId } from "@/lib/marketing-selected-campaign"

export function MarketingCampaignPromosPanel({ campaignId }: { campaignId: string }) {
  const { lang } = useLang()
  const t = useT(lang)
  const optionPartLabel = (name: string) => translatePosMenuLineForReceipt(name, t)
  const cid = campaignId.trim()
  const [tab, setTab] = React.useState<"compose" | "inquiry">("compose")
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [allMainCategories, setAllMainCategories] = React.useState<string[]>([])
  const [categoriesConfig, setCategoriesConfig] = React.useState<PosMenuCategoriesConfig | null>(null)
  const [campaignPromos, setCampaignPromos] = React.useState<PosPromo[]>([])
  const [campaignPromosLoading, setCampaignPromosLoading] = React.useState(false)
  const [pageLoading, setPageLoading] = React.useState(true)
  const [schemaStatus, setSchemaStatus] = React.useState<{ ok: boolean } | null>(null)
  const [schemaBannerDismissed, setSchemaBannerDismissed] = React.useState(false)
  const [focusPromoId, setFocusPromoId] = React.useState<string | null>(null)

  const mainCategories = React.useMemo(() => {
    const preset = new Set(
      (categoriesConfig?.mainCategories || []).filter((c): c is string => typeof c === "string")
    )
    const fromMenus = new Set(menus.map((m) => m.categoryMain).filter((c): c is string => typeof c === "string" && c !== ""))
    const fromDb = new Set(allMainCategories)
    return Array.from(new Set([...preset, ...fromDb, ...fromMenus])).filter((c): c is string => typeof c === "string").sort()
  }, [menus, allMainCategories, categoriesConfig])

  const loadMenusAndMeta = React.useCallback(async () => {
    const [list, catRes, config, campRes] = await Promise.all([
      getPosMenus({ fresh: true }),
      getPosMenuCategories().catch(() => ({ categories: [] as string[], mainCategories: [] as string[] })),
      getPosMenuCategoriesConfig().catch(() => null),
      getMarketingCampaigns().catch(() => []),
    ])
    setMenus(Array.isArray(list) ? list : [])
    setAllMainCategories(Array.isArray(catRes?.mainCategories) ? catRes.mainCategories : [])
    setCategoriesConfig(config ?? null)
    setCampaigns(Array.isArray(campRes) ? campRes : [])
  }, [])

  const refreshCampaignPromos = React.useCallback(() => {
    if (!cid) {
      setCampaignPromos([])
      return
    }
    setCampaignPromosLoading(true)
    void getPosPromos({ campaignId: cid })
      .then((list) => setCampaignPromos(Array.isArray(list) ? list : []))
      .catch(() => setCampaignPromos([]))
      .finally(() => setCampaignPromosLoading(false))
  }, [cid])

  React.useEffect(() => {
    void getPosPromoSchemaStatus()
      .then((s) => setSchemaStatus(s))
      .catch(() => setSchemaStatus(null))
  }, [])

  React.useEffect(() => {
    let mounted = true
    void (async () => {
      setPageLoading(true)
      await loadMenusAndMeta()
      if (mounted) setPageLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [loadMenusAndMeta])

  React.useEffect(() => {
    refreshCampaignPromos()
  }, [refreshCampaignPromos])

  React.useEffect(() => {
    if (cid) writeSelectedMarketingCampaignId(cid)
  }, [cid])

  const schemaOk = schemaStatus == null ? null : schemaStatus.ok
  const exists = campaigns.some((c) => c.id === cid)
  const sidebarHref = cid
    ? `/admin/marketing/promos?campaignId=${encodeURIComponent(cid)}`
    : "/admin/marketing/promos"

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "compose" | "inquiry")} className={adminTabsRootCn}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <TabsList className={adminTabsListRowCn}>
          <TabsTrigger value="compose" className={adminTabsTriggerCn}>
            {t("marketingPromoTabsEditCompose")}
          </TabsTrigger>
          <TabsTrigger value="inquiry" className={adminTabsTriggerCn}>
            {t("marketingPromoTabsList")}
          </TabsTrigger>
        </TabsList>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" asChild>
          <Link href={sidebarHref}>
            <ExternalLink className="h-3.5 w-3.5" />
            {t("adminMarketingPromos")}
          </Link>
        </Button>
      </div>
      <TabsContent value="compose" className={adminTabsContentCn}>
        {!cid || !exists ? (
          <MarketingEmptyState icon={Tag} title={t("marketingPromoListEmptyNeedCampaign")} description={t("marketingWsNotFound")} />
        ) : pageLoading && menus.length === 0 ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : (
          <PosSetMenuTabWorkspace
            key={cid}
            menus={menus}
            mainCategories={mainCategories}
            categoriesConfig={categoriesConfig}
            optionPartLabel={optionPartLabel}
            promos={campaignPromos}
            promosLoading={campaignPromosLoading}
            schemaOk={schemaOk}
            schemaBannerDismissed={schemaBannerDismissed}
            onDismissSchemaBanner={() => setSchemaBannerDismissed(true)}
            onAfterSave={() => {
              refreshCampaignPromos()
              void loadMenusAndMeta()
            }}
            focusPromoId={focusPromoId}
            onFocusPromoConsumed={() => setFocusPromoId(null)}
            fixedMarketingCampaignId={cid}
          />
        )}
      </TabsContent>
      <TabsContent value="inquiry" className={adminTabsContentCn}>
        <PosSetMenuInquiryTab
          promos={campaignPromos}
          promosLoading={campaignPromosLoading}
          onRefresh={() => {
            refreshCampaignPromos()
            void loadMenusAndMeta()
          }}
          filterCampaignId={cid || undefined}
          hideOpenMarketingLink
          hideLinkCampaign
          inquiryMode="campaign"
          onOpenInSetTab={(id) => {
            setFocusPromoId(id)
            setTab("compose")
          }}
        />
      </TabsContent>
    </Tabs>
  )
}

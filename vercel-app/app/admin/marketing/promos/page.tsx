'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import {
  getPosMenus,
  getPosMenuCategories,
  getPosMenuCategoriesConfig,
  getPosPromos,
  getPosPromoSchemaStatus,
  getMarketingCampaigns,
  type PosMenu,
  type PosPromo,
  type MarketingCampaign,
  type PosMenuCategoriesConfig,
} from '@/lib/api-client'
import { PosSetMenuTabWorkspace } from '@/components/erp/pos-set-menu-tab-workspace'
import { PosSetMenuInquiryTab } from '@/components/erp/pos-set-menu-inquiry-tab'
import { MarketingHubCampaignContextStrip } from '@/components/marketing/marketing-hub-campaign-context-strip'
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from '@/lib/admin-tab-styles'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { POS_MAIN_CATEGORIES } from '@/lib/pos-menu-categories'
import { Tag } from 'lucide-react'
import { MarketingPageHero } from '@/components/marketing/marketing-page-hero'
import { MarketingPageShell } from '@/components/marketing/marketing-page-shell'
export default function MarketingPromosPage() {
  const searchParams = useSearchParams()
  const campaignIdFromQuery = searchParams.get('campaignId')?.trim() || ''
  const { lang } = useLang()
  const t = useT(lang)
  const marketingPromoSetsBannerText = t('marketingPromoSetsBanner')
  const marketingPromoCampaignSelectHelpText = t('marketingPromoCampaignSelectHelp')
  const optionPartLabel = (name: string) => {
    if (!name?.trim()) return name ?? ''
    let s = String(name)
    if (s.includes('순살')) s = s.replace(/순살/g, t('posOptionPartBoneless'))
    if (s.includes('윙')) s = s.replace(/윙/g, t('posOptionPartWing'))
    if (s.includes('봉')) s = s.replace(/봉/g, t('posOptionPartDrumstick'))
    return s
  }

  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [workspaceCampaignId, setWorkspaceCampaignId] = React.useState('')
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [_allCategories, setAllCategories] = React.useState<string[]>([])
  const [allMainCategories, setAllMainCategories] = React.useState<string[]>([])
  const [categoriesConfig, setCategoriesConfig] = React.useState<PosMenuCategoriesConfig | null>(null)
  const [campaignPromos, setCampaignPromos] = React.useState<PosPromo[]>([])
  const [campaignPromosLoading, setCampaignPromosLoading] = React.useState(false)
  const [pageLoading, setPageLoading] = React.useState(true)
  const [schemaStatus, setSchemaStatus] = React.useState<{
    posPromosExtended: boolean
    posMenusPromoId: boolean
    ok: boolean
  } | null>(null)
  const [schemaBannerDismissed, setSchemaBannerDismissed] = React.useState(false)
  const [mainTab, setMainTab] = React.useState<'compose' | 'inquiry'>('compose')
  const [focusPromoId, setFocusPromoId] = React.useState<string | null>(null)
  const mainCategories = React.useMemo(() => {
    const preset = categoriesConfig?.mainCategories?.length
      ? new Set(categoriesConfig.mainCategories.filter((c): c is string => typeof c === 'string'))
      : new Set(POS_MAIN_CATEGORIES)
    const fromMenus = new Set(menus.map((m) => m.categoryMain).filter((c): c is string => typeof c === 'string' && c !== ''))
    const fromDb = new Set(allMainCategories)
    return Array.from(new Set([...preset, ...fromDb, ...fromMenus]))
      .filter((c): c is string => typeof c === 'string')
      .sort()
  }, [menus, allMainCategories, categoriesConfig])

  React.useEffect(() => {
    if (pageLoading || !workspaceCampaignId.trim()) return
    if (!campaigns.some((c) => c.id === workspaceCampaignId)) {
      setWorkspaceCampaignId('')
    }
  }, [campaigns, workspaceCampaignId, pageLoading])

  const loadMenusAndMeta = React.useCallback(async () => {
    try {
      const [list, catRes, config, campRes] = await Promise.all([
        getPosMenus(),
        getPosMenuCategories().catch(() => ({ categories: [] as string[], mainCategories: [] as string[] })),
        getPosMenuCategoriesConfig().catch(() => null),
        getMarketingCampaigns().catch(() => []),
      ])
      // 번들 세트 구성 탭은 promo_id 미러 메뉴로「저장된 세트」목록을 만든다. 미러 행을 제외하면 목록이 비어 보인다.
      // 좌측 메뉴 피커는 PosSetMenuTabWorkspace 내부 eligibleMenus에서 미러·비활성을 걸러 쓴다.
      setMenus(Array.isArray(list) ? list : [])
      const { categories, mainCategories: mains } = catRes ?? { categories: [], mainCategories: [] }
      setAllCategories(Array.isArray(categories) ? categories : [])
      setAllMainCategories(Array.isArray(mains) ? mains : [])
      setCategoriesConfig(config ?? null)
      setCampaigns(Array.isArray(campRes) ? campRes : [])
    } catch {
      setMenus([])
      setAllCategories([])
      setAllMainCategories([])
      setCategoriesConfig(null)
      setCampaigns([])
    }
  }, [])

  const refreshCampaignPromos = React.useCallback(() => {
    const cid = workspaceCampaignId.trim()
    if (!cid) {
      setCampaignPromos([])
      setCampaignPromosLoading(false)
      return
    }
    setCampaignPromosLoading(true)
    void getPosPromos({ campaignId: cid })
      .then((list) => setCampaignPromos(Array.isArray(list) ? list : []))
      .catch(() => setCampaignPromos([]))
      .finally(() => setCampaignPromosLoading(false))
  }, [workspaceCampaignId])

  const handleAfterSave = React.useCallback(() => {
    refreshCampaignPromos()
    void loadMenusAndMeta()
  }, [refreshCampaignPromos, loadMenusAndMeta])

  const handleFocusConsumed = React.useCallback(() => setFocusPromoId(null), [])

  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined' && localStorage.getItem('admin_promo_schema_banner_dismiss') === '1') {
        setSchemaBannerDismissed(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    void getPosPromoSchemaStatus().then(setSchemaStatus).catch(() => setSchemaStatus(null))
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
    if (campaignIdFromQuery) setWorkspaceCampaignId(campaignIdFromQuery)
  }, [campaignIdFromQuery])

  React.useEffect(() => {
    setFocusPromoId(null)
    refreshCampaignPromos()
  }, [workspaceCampaignId, refreshCampaignPromos])

  const schemaOk = schemaStatus == null ? null : schemaStatus.ok
  const cidTrim = workspaceCampaignId.trim()

  const selectedCampaign = React.useMemo(
    () => campaigns.find((c) => c.id === workspaceCampaignId),
    [campaigns, workspaceCampaignId]
  )
  const todayBangkokYmd = React.useMemo(
    () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
    []
  )
  const selectedDesignOutOfRange = React.useMemo(() => {
    if (!selectedCampaign) return false
    const s = (selectedCampaign.designStartDate ?? '').trim()
    const e = (selectedCampaign.designEndDate ?? '').trim()
    if (!s || !e) return false
    return todayBangkokYmd < s || todayBangkokYmd > e
  }, [selectedCampaign, todayBangkokYmd])

  return (
    <MarketingPageShell maxWidthClass="max-w-[min(100%,1600px)]">
        <MarketingPageHero icon={Tag} title={t('adminMarketingPromos')} />
        {marketingPromoSetsBannerText ? (
          <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
            {marketingPromoSetsBannerText}
          </div>
        ) : null}

        {campaignIdFromQuery && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs leading-relaxed">
            {t('marketingPromoCampaignQueryBanner')}
          </div>
        )}

        {pageLoading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t('loading')}</div>
        )}

        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'compose' | 'inquiry')} className={adminTabsRootCn}>
          <div className={cn(adminTabsBarCn, 'px-2 py-2.5 sm:px-4')}>
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="compose" className={adminTabsTriggerCn}>
                  {t('marketingPromoTabsEditCompose')}
                </TabsTrigger>
                <TabsTrigger value="inquiry" className={adminTabsTriggerCn}>
                  {t('marketingPromoTabsList')}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <MarketingHubCampaignContextStrip
            value={workspaceCampaignId}
            onChange={setWorkspaceCampaignId}
            campaigns={campaigns}
            allowEmpty
            emptyOptionLabel={t('marketingPromoCampaignSelectRequiredOption')}
            onRefresh={loadMenusAndMeta}
            maxListHeightClass="max-h-56"
            disabled={pageLoading}
            summary={
              selectedCampaign ? (
                <div className="space-y-0.5 text-xs">
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-foreground">
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-primary">
                      [{selectedCampaign.campaignNo?.trim() || '—'}]
                    </span>
                    <span className="font-medium leading-snug">{selectedCampaign.topic}</span>
                  </p>
                  {(selectedCampaign.designStartDate || selectedCampaign.designEndDate) && (
                    <p
                      className={cn(
                        'text-[11px]',
                        selectedDesignOutOfRange ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
                      )}
                    >
                      {t('marketingDesignLabelShort')}: {selectedCampaign.designStartDate || '—'} ~{' '}
                      {selectedCampaign.designEndDate || '—'}
                      {selectedDesignOutOfRange ? ` · ${t('marketingDesignTodayOutsidePeriod')}` : ''}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">{t('marketingPromoToolbarCampaignHint')}</p>
              )
            }
          />
          {marketingPromoCampaignSelectHelpText ? (
            <p className="mb-4 text-[10px] leading-relaxed text-muted-foreground">{marketingPromoCampaignSelectHelpText}</p>
          ) : null}

          <TabsContent value="compose" className={adminTabsContentCn}>
            {!cidTrim ? (
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                {t('marketingPromoListEmptyNeedCampaign')}
              </div>
            ) : (campaignPromosLoading || pageLoading) && menus.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t('loading')}</div>
            ) : (
              <PosSetMenuTabWorkspace
                key={cidTrim}
                menus={menus}
                mainCategories={mainCategories}
                categoriesConfig={categoriesConfig}
                optionPartLabel={optionPartLabel}
                promos={campaignPromos}
                promosLoading={campaignPromosLoading}
                schemaOk={schemaOk}
                schemaBannerDismissed={schemaBannerDismissed}
                onDismissSchemaBanner={() => {
                  try {
                    localStorage.setItem('admin_promo_schema_banner_dismiss', '1')
                  } catch {
                    /* ignore */
                  }
                  setSchemaBannerDismissed(true)
                }}
                onAfterSave={handleAfterSave}
                focusPromoId={focusPromoId}
                onFocusPromoConsumed={handleFocusConsumed}
                fixedMarketingCampaignId={cidTrim}
              />
            )}
          </TabsContent>

          <TabsContent value="inquiry" className={adminTabsContentCn}>
            <PosSetMenuInquiryTab
              promos={campaignPromos}
              promosLoading={campaignPromosLoading}
              onRefresh={handleAfterSave}
              filterCampaignId={cidTrim || undefined}
              hideOpenMarketingLink
              hideLinkCampaign
              inquiryMode="campaign"
              onOpenInSetTab={(id) => {
                setFocusPromoId(id)
                setMainTab('compose')
              }}
            />
          </TabsContent>
        </Tabs>
    </MarketingPageShell>
  )
}

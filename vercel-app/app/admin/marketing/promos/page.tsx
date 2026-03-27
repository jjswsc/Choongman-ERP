'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { Tag } from 'lucide-react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListGridClass,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerGridCn,
} from '@/lib/admin-tab-styles'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { POS_MAIN_CATEGORIES } from '@/lib/pos-menu-categories'

export default function MarketingPromosPage() {
  const searchParams = useSearchParams()
  const campaignIdFromQuery = searchParams.get('campaignId')?.trim() || ''
  const { lang } = useLang()
  const t = useT(lang)
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
  const [allCategories, setAllCategories] = React.useState<string[]>([])
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

  const loadMenusAndMeta = React.useCallback(async () => {
    try {
      const [list, catRes, config, campRes] = await Promise.all([
        getPosMenus(),
        getPosMenuCategories().catch(() => ({ categories: [] as string[], mainCategories: [] as string[] })),
        getPosMenuCategoriesConfig().catch(() => null),
        getMarketingCampaigns().catch(() => []),
      ])
      setMenus(
        (list || []).filter((m) => m.isActive && !(m.promoId != null && String(m.promoId).trim() !== ''))
      )
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

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-[min(100%,1600px)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t('posPromoMgmt')}</h1>
            <p className="text-xs text-muted-foreground">{t('posPromoMgmtSub')}</p>
            {selectedCampaign ? (
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-foreground">
                <span className="font-mono text-xs font-semibold tabular-nums text-primary">
                  [{selectedCampaign.campaignNo?.trim() || '—'}]
                </span>
                <span className="font-medium leading-snug">{selectedCampaign.topic}</span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{t('marketingPromoToolbarCampaignHint')}</p>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
          {t('marketingPromoSetsBanner')}
        </div>

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
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
              <div className={adminTabsScrollCn}>
                <TabsList className={adminTabsListGridClass('w-full max-w-md', 'grid-cols-2')}>
                  <TabsTrigger value="compose" className={adminTabsTriggerGridCn}>
                    {t('marketingPromoTabsEditCompose')}
                  </TabsTrigger>
                  <TabsTrigger value="inquiry" className={adminTabsTriggerGridCn}>
                    {t('marketingPromoTabsList')}
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:max-w-md">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('posPromoMarketingCampaign')} · {t('marketingPromoListPickCampaign')}
                </span>
                <Select
                  value={workspaceCampaignId || '_none'}
                  onValueChange={(v) => setWorkspaceCampaignId(v === '_none' ? '' : v)}
                >
                  <SelectTrigger className="h-9 w-full text-left text-sm">
                    <SelectValue placeholder={t('posPromoCampaignSelectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t('marketingPromoCampaignSelectRequiredOption')}</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.campaignNo ? `[${c.campaignNo}] ` : ''}
                        {c.topic}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] leading-relaxed text-muted-foreground">{t('marketingPromoCampaignSelectHelp')}</p>
              </div>
            </div>
          </div>

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
      </div>
    </div>
  )
}

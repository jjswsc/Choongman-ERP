'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from 'react'
import { Tag, FilePlus, Save, RotateCcw, Pencil, Trash2, Plus, Calculator, AlertTriangle, X, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { translateApiMessage } from '@/lib/translate-api-message'
import {
  getPosPromos,
  getPosPromoItems,
  getPosMenus,
  getPosMenuOptions,
  getMarketingCampaigns,
  getPosMenuCategoriesConfig,
  getPosDeliveryApps,
  getMenuCost,
  savePosPromo,
  savePosPromoItem,
  deletePosPromo,
  deletePosPromoItem,
  getPosPromoSchemaStatus,
  getNextPosPromoCode,
  type PosPromo,
  type PosPromoItem,
  type PosMenu,
  type PosMenuOption,
  useStoreList,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { PROMOTION_MAIN_CATEGORY, PROMOTION_DEFAULT_SUBCATEGORIES } from '@/lib/pos-promo-constants'
import { useAuth } from '@/lib/auth-context'
import { isOfficeRole } from '@/lib/permissions'

const emptyForm = {
  code: '',
  name: '',
  category: PROMOTION_DEFAULT_SUBCATEGORIES[0] as string,
  price: '',
  priceDelivery: '',
  vatIncluded: true,
  isActive: true,
  marketingCampaignId: '' as string,
  channelHall: true,
  channelTakeout: true,
  channelDelivery: true,
  deliveryAppCodes: [] as string[],
  validFrom: '' as string,
  validTo: '' as string,
}

export default function MarketingPromosPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const { stores } = useStoreList()
  const canSearchAll = isOfficeRole(auth?.role || '')
  const [storeCode, setStoreCode] = React.useState('')
  const [promoSubCategories, setPromoSubCategories] = React.useState<string[]>([...PROMOTION_DEFAULT_SUBCATEGORIES])
  const [deliveryApps, setDeliveryApps] = React.useState<{ code: string; name: string }[]>([])
  const [promos, setPromos] = React.useState<PosPromo[]>([])
  const [campaigns, setCampaigns] = React.useState<{ id: string; topic: string; startDate?: string | null; endDate?: string | null }[]>([])
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [allOptions, setAllOptions] = React.useState<PosMenuOption[]>([])
  const [promoItems, setPromoItems] = React.useState<PosPromoItem[]>([])
  const [costsHall, setCostsHall] = React.useState<Record<string, number>>({})
  const [costsDelivery, setCostsDelivery] = React.useState<Record<string, number>>({})
  const [loading, setLoading] = React.useState(true)
  const [formData, setFormData] = React.useState(emptyForm)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [newItemMenuId, setNewItemMenuId] = React.useState('')
  const [newItemOptionId, setNewItemOptionId] = React.useState<string | null>(null)
  const [newItemQty, setNewItemQty] = React.useState('1')
  const [schemaStatus, setSchemaStatus] = React.useState<{
    posPromosExtended: boolean
    posMenusPromoId: boolean
    ok: boolean
  } | null>(null)
  const [schemaBannerDismissed, setSchemaBannerDismissed] = React.useState(false)
  const [newRegisterPulse, setNewRegisterPulse] = React.useState(false)
  const formCardRef = React.useRef<HTMLDivElement>(null)
  const composeAnchorRef = React.useRef<HTMLDivElement>(null)

  const optionsByMenuId = React.useMemo(() => {
    const m: Record<string, PosMenuOption[]> = {}
    for (const o of allOptions) {
      const mid = o.menuId
      if (!m[mid]) m[mid] = []
      m[mid].push(o)
    }
    return m
  }, [allOptions])

  const fillSuggestedPromoCode = React.useCallback(async () => {
    try {
      const r = await getNextPosPromoCode()
      const next = r?.code?.trim()
      if (next) setFormData((p) => ({ ...p, code: next }))
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    if (canSearchAll && stores.length && !storeCode) setStoreCode(stores[0])
    else if (!canSearchAll && auth?.store) setStoreCode(auth.store)
  }, [canSearchAll, stores, auth?.store, storeCode])

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
    getPosPromoSchemaStatus()
      .then(setSchemaStatus)
      .catch(() => setSchemaStatus(null))
  }, [])

  React.useEffect(() => {
    Promise.all([
      getPosPromos(),
      getPosMenus(),
      getPosMenuOptions(),
      getMarketingCampaigns(),
      getPosMenuCategoriesConfig(),
    ])
      .then(([promoList, menuList, opts, campList, catCfg]) => {
        setPromos(promoList || [])
        setMenus(
          (menuList || []).filter((m) => m.isActive && !(m.promoId != null && String(m.promoId).trim() !== ''))
        )
        setAllOptions(opts || [])
        setCampaigns(
          (campList || []).map((c) => ({
            id: c.id,
            topic: c.topic,
            startDate: (c as { startDate?: string | null }).startDate,
            endDate: (c as { endDate?: string | null }).endDate,
          }))
        )
        const subs = catCfg?.categoriesByMain?.[PROMOTION_MAIN_CATEGORY]
        if (subs?.length) setPromoSubCategories(subs)
      })
      .catch(() => {
        setPromos([])
        setMenus([])
        setAllOptions([])
      })
      .finally(() => setLoading(false))
  }, [])

  /** 첫 로드·신규 모드: 코드 비어 있으면 자동 채번 */
  React.useEffect(() => {
    if (loading || editingId) return
    let cancelled = false
    void (async () => {
      try {
        const r = await getNextPosPromoCode()
        const next = r?.code?.trim()
        if (cancelled || !next) return
        setFormData((p) => (p.code.trim() ? p : { ...p, code: next }))
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loading, editingId])

  React.useEffect(() => {
    const sc = canSearchAll && storeCode ? storeCode : auth?.store
    if (!sc) {
      setDeliveryApps([])
      return
    }
    getPosDeliveryApps({ storeCode: sc, includeDisabled: false })
      .then((list) =>
        setDeliveryApps((list || []).map((a) => ({ code: String(a.code || '').trim(), name: String(a.name || a.code || '') })).filter((a) => a.code))
      )
      .catch(() => setDeliveryApps([]))
  }, [canSearchAll, storeCode, auth?.store])

  React.useEffect(() => {
    if (!editingId) {
      setPromoItems([])
      setCostsHall({})
      setCostsDelivery({})
      return
    }
    getPosPromoItems({ promoId: editingId })
      .then(setPromoItems)
      .catch(() => setPromoItems([]))
  }, [editingId])

  React.useEffect(() => {
    for (const it of promoItems) {
      const key = `${it.menuId}:${it.optionId || 'null'}`
      if (costsHall[key] != null && costsDelivery[key] != null) continue
      getMenuCost({ menuId: it.menuId, optionId: it.optionId || undefined })
        .then((r) => {
          const hall = (r as { costHall?: number }).costHall ?? (r as { cost?: number }).cost ?? 0
          const del = (r as { costDelivery?: number }).costDelivery ?? hall
          setCostsHall((c) => ({ ...c, [key]: hall }))
          setCostsDelivery((c) => ({ ...c, [key]: del }))
        })
        .catch(() => {
          setCostsHall((c) => ({ ...c, [key]: 0 }))
          setCostsDelivery((c) => ({ ...c, [key]: 0 }))
        })
    }
  }, [promoItems])

  const regularPriceSum = React.useMemo(() => {
    let sum = 0
    for (const it of promoItems) {
      const menu = menus.find((m) => m.id === it.menuId)
      const opts = optionsByMenuId[it.menuId] || []
      const opt = it.optionId ? opts.find((o) => o.id === it.optionId) : null
      const unitPrice = (menu?.price ?? 0) + (opt?.priceModifier ?? 0)
      sum += unitPrice * (it.quantity ?? 1)
    }
    return sum
  }, [promoItems, menus, optionsByMenuId])

  const costTotalHall = React.useMemo(() => {
    let sum = 0
    for (const it of promoItems) {
      const key = `${it.menuId}:${it.optionId || 'null'}`
      sum += (costsHall[key] ?? 0) * (it.quantity ?? 1)
    }
    return sum
  }, [promoItems, costsHall])

  const costTotalDelivery = React.useMemo(() => {
    let sum = 0
    for (const it of promoItems) {
      const key = `${it.menuId}:${it.optionId || 'null'}`
      sum += (costsDelivery[key] ?? 0) * (it.quantity ?? 1)
    }
    return sum
  }, [promoItems, costsDelivery])

  const salePrice = Number(formData.price) || 0
  const salePriceDel = formData.priceDelivery !== '' ? Number(formData.priceDelivery) : salePrice
  const discountAmt = Math.max(0, regularPriceSum - salePrice)
  const discountPercent = regularPriceSum > 0 ? (discountAmt / regularPriceSum) * 100 : 0
  const marginBaht = salePrice - costTotalHall
  const marginPercent = salePrice > 0 ? (marginBaht / salePrice) * 100 : 0
  const marginBahtDel = salePriceDel - costTotalDelivery
  const marginPercentDel = salePriceDel > 0 ? (marginBahtDel / salePriceDel) * 100 : 0
  const hasAllCosts =
    promoItems.length === 0 ||
    promoItems.every((it) => {
      const key = `${it.menuId}:${it.optionId || 'null'}`
      return costsHall[key] != null && costsDelivery[key] != null
    })

  const handleNewRegister = () => {
    setFormData({ ...emptyForm })
    setEditingId(null)
    setPromoItems([])
    setNewItemMenuId('')
    setNewItemOptionId(null)
    setNewItemQty('1')
    setNewRegisterPulse(true)
    window.setTimeout(() => setNewRegisterPulse(false), 2200)
    window.setTimeout(() => formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    void fillSuggestedPromoCode()
  }

  const handleReset = () => {
    if (editingId) {
      const p = promos.find((x) => x.id === editingId)
      if (p) {
        setFormData({
          code: p.code,
          name: p.name,
          category: p.category || PROMOTION_DEFAULT_SUBCATEGORIES[0],
          price: String(p.price),
          priceDelivery: p.priceDelivery != null ? String(p.priceDelivery) : '',
          vatIncluded: p.vatIncluded,
          isActive: p.isActive,
          marketingCampaignId: p.marketingCampaignId || '',
          channelHall: p.channelHall !== false,
          channelTakeout: p.channelTakeout !== false,
          channelDelivery: p.channelDelivery !== false,
          deliveryAppCodes: p.deliveryAppCodes?.length ? [...p.deliveryAppCodes] : [],
          validFrom: p.validFrom?.trim() || '',
          validTo: p.validTo?.trim() || '',
        })
      }
    } else {
      setFormData({ ...emptyForm })
      void fillSuggestedPromoCode()
    }
  }

  const handleSave = async () => {
    let code = formData.code.trim()
    const name = formData.name.trim()
    if (!code && !editingId) {
      try {
        const r = await getNextPosPromoCode()
        const next = r?.code?.trim()
        if (next) {
          code = next
          setFormData((p) => ({ ...p, code: next }))
        }
      } catch {
        /* ignore */
      }
    }
    if (!code || !name) {
      await appAlert(t('posMenuAlertCodeName'))
      return
    }
    if (!editingId && promos.some((p) => p.code === code)) {
      await appAlert(t('itemsAlertCodeExists'))
      return
    }
    const vf = formData.validFrom.trim()
    const vt = formData.validTo.trim()
    if (vf && vt && vf > vt) {
      await appAlert(t('posPromoValidRangeInvalid') || '적용 종료일은 시작일 이후여야 합니다.')
      return
    }
    const dpct = regularPriceSum > 0 ? Math.round(discountPercent * 100) / 100 : null
    const res = await savePosPromo({
      id: editingId || undefined,
      code,
      name,
      category: formData.category.trim() || PROMOTION_DEFAULT_SUBCATEGORIES[0],
      categoryMain: PROMOTION_MAIN_CATEGORY,
      price: Number(formData.price) || 0,
      priceDelivery: formData.priceDelivery !== '' ? Number(formData.priceDelivery) : null,
      vatIncluded: formData.vatIncluded,
      isActive: formData.isActive,
      marketingCampaignId: formData.marketingCampaignId || null,
      channelHall: formData.channelHall,
      channelTakeout: formData.channelTakeout,
      channelDelivery: formData.channelDelivery,
      deliveryAppCodes: formData.channelDelivery && formData.deliveryAppCodes.length > 0 ? formData.deliveryAppCodes : null,
      discountPercent: dpct,
      validFrom: vf || null,
      validTo: vt || null,
    })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t('msg_save_fail_detail'))
      return
    }
    if (editingId) {
      await getPosPromos().then(setPromos)
      await appAlert(t('itemsAlertUpdated'))
    } else if (res.id) {
      setEditingId(res.id)
      await getPosPromos().then(setPromos)
      await appAlert(t('itemsAlertSaved'))
      window.setTimeout(() => composeAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150)
    }
  }

  const handleEdit = (promo: PosPromo) => {
    setFormData({
      code: promo.code,
      name: promo.name,
      category: promo.category || PROMOTION_DEFAULT_SUBCATEGORIES[0],
      price: String(promo.price),
      priceDelivery: promo.priceDelivery != null ? String(promo.priceDelivery) : '',
      vatIncluded: promo.vatIncluded,
      isActive: promo.isActive,
      marketingCampaignId: promo.marketingCampaignId ?? '',
      channelHall: promo.channelHall !== false,
      channelTakeout: promo.channelTakeout !== false,
      channelDelivery: promo.channelDelivery !== false,
      deliveryAppCodes: promo.deliveryAppCodes?.length ? [...promo.deliveryAppCodes] : [],
      validFrom: promo.validFrom?.trim() || '',
      validTo: promo.validTo?.trim() || '',
    })
    setEditingId(promo.id)
    setNewItemMenuId('')
    setNewItemOptionId(null)
    setNewItemQty('1')
  }

  const handleAddItem = async () => {
    if (!editingId || !newItemMenuId.trim()) return
    const opts = optionsByMenuId[newItemMenuId]
    const hasOptions = opts && opts.length > 0
    if (hasOptions && !newItemOptionId) {
      await appAlert(t('posPromoSelectOption') || '옵션을 선택해 주세요.')
      return
    }
    const res = await savePosPromoItem({
      promoId: Number(editingId),
      menuId: Number(newItemMenuId),
      optionId: newItemOptionId ? Number(newItemOptionId) : null,
      quantity: Number(newItemQty) || 1,
      sortOrder: promoItems.length,
    })
    if (res.success) {
      getPosPromoItems({ promoId: editingId }).then(setPromoItems)
      setNewItemMenuId('')
      setNewItemOptionId(null)
      setNewItemQty('1')
    } else {
      await appAlert(res.message)
    }
  }

  const handleDeleteItem = async (item: PosPromoItem) => {
    if (!await appConfirm(t('posMenuConfirmDelete'))) return
    const res = await deletePosPromoItem({ id: item.id })
    if (res.success) {
      getPosPromoItems({ promoId: editingId! }).then(setPromoItems)
    } else {
      await appAlert(res.message)
    }
  }

  const handleDelete = async (promo: PosPromo) => {
    if (!await appConfirm(`"${promo.name}" ${t('posPromoConfirmDeactivate') || '비활성 처리할까요? (주문 기록은 유지됩니다)'}`)) return
    const res = await deletePosPromo({ id: promo.id })
    if (res.success) {
      setPromos((prev) => prev.map((p) => (p.id === promo.id ? { ...p, isActive: false } : p)))
      if (editingId === promo.id) {
        setFormData((f) => ({ ...f, isActive: false }))
      }
      await getPosMenus().then((list) =>
        setMenus((list || []).filter((m) => m.isActive && !(m.promoId != null && String(m.promoId).trim() !== '')))
      )
    } else {
      await appAlert(res.message)
    }
  }

  const selectedCampaign = campaigns.find((c) => c.id === formData.marketingCampaignId)
  const campaignRangeMismatch =
    !!selectedCampaign &&
    ((selectedCampaign.startDate && formData.validFrom && selectedCampaign.startDate.slice(0, 10) !== formData.validFrom) ||
      (selectedCampaign.endDate && formData.validTo && selectedCampaign.endDate.slice(0, 10) !== formData.validTo))

  const toggleDeliveryApp = (code: string) => {
    setFormData((p) => {
      const set = new Set(p.deliveryAppCodes)
      if (set.has(code)) set.delete(code)
      else set.add(code)
      return { ...p, deliveryAppCodes: [...set] }
    })
  }

  const getItemDisplayName = (item: PosPromoItem): string => {
    const menu = menus.find((m) => m.id === item.menuId)
    if (!menu) return `메뉴 #${item.menuId}`
    if (!item.optionId) return menu.name
    const opt = allOptions.find((o) => o.id === item.optionId)
    return opt ? `${menu.name} (${opt.name})` : menu.name
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t('posPromoMgmt') || '프로모션 세트'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('posPromoMgmtSub') || '기존 메뉴를 조합해 세트 메뉴를 만들고, 원가·판매가·할인을 상세 관리합니다.'}
            </p>
          </div>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t('loading')}
          </div>
        )}

        {schemaStatus && !schemaStatus.ok && !schemaBannerDismissed && (
          <div className="mb-4 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold">{t('posPromoSchemaBannerTitle') || 'DB 확장 필요'}</p>
              <p className="text-xs leading-relaxed opacity-90">
                {t('posPromoSchemaBannerBody') ||
                  'Supabase에서 vercel-app/sql/pos_promo_extensions.sql 을 실행해야 채널·기간·미러 메뉴 연동이 정상 동작합니다.'}
                {!schemaStatus.posPromosExtended && (
                  <span className="block mt-1">· pos_promos 확장 컬럼(channel_hall 등) 없음</span>
                )}
                {!schemaStatus.posMenusPromoId && (
                  <span className="block mt-1">· pos_menus.promo_id 컬럼 없음</span>
                )}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md p-1 hover:bg-amber-200/60 dark:hover:bg-amber-900/50"
              aria-label={t('cancel')}
              onClick={() => {
                try {
                  localStorage.setItem('admin_promo_schema_banner_dismiss', '1')
                } catch {
                  /* ignore */
                }
                setSchemaBannerDismissed(true)
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={cn(
              'rounded-full border px-2.5 py-0.5 font-semibold',
              !editingId ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/50 text-muted-foreground'
            )}
          >
            ① {t('posPromoStepBasic') || '기본 정보'}
          </span>
          <span className="text-muted-foreground">→</span>
          <span
            className={cn(
              'rounded-full border px-2.5 py-0.5 font-semibold',
              editingId ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/50 text-muted-foreground'
            )}
          >
            ② {t('posPromoStepCompose') || '구성·원가'}
          </span>
          {!editingId && (
            <span className="text-muted-foreground">
              · {t('posPromoStepHint') || '저장 후 구성 메뉴를 추가할 수 있습니다.'}
            </span>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:self-start space-y-6">
            <div
              ref={formCardRef}
              className={cn(
                'rounded-xl border bg-card shadow-sm transition-shadow duration-300',
                newRegisterPulse && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              )}
            >
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div>
                  <h3 className="text-sm font-bold text-card-foreground">
                    {t('posPromoFormTitle') || '프로모션 등록'}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {editingId ? t('itemsFormEditDesc') : t('itemsFormNewDesc')}
                  </p>
                  {!editingId && newRegisterPulse && (
                    <p className="mt-1 text-[11px] font-medium text-primary">
                      {t('posPromoNewModeOn') || '신규 등록 모드입니다. 코드는 자동 채번됩니다. 이름 입력 후 저장하세요.'}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-[11px]" onClick={handleNewRegister}>
                  <FilePlus className="h-3.5 w-3.5" />
                  {t('itemsBtnNewRegister')}
                </Button>
              </div>
              <div className="flex flex-col gap-4 p-6">
                <div>
                  <label className="text-xs font-semibold">{t('posMenuCode')}</label>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {t('posPromoCodeAutoHint') || '신규는 P0001 형식으로 자동 부여됩니다. 필요 시 수정하거나 다시 채번하세요.'}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <Input
                      placeholder="P0001"
                      className="h-10 flex-1 font-mono"
                      value={formData.code}
                      onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                      disabled={!!editingId}
                    />
                    {!editingId && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0 gap-1 px-3 text-xs"
                        onClick={() => void fillSuggestedPromoCode()}
                        title={t('posPromoCodeSuggestBtn') || '다음 번호로 채번'}
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        {t('posPromoCodeSuggestBtn') || '자동'}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold">{t('posPromoName') || '메뉴명'}</label>
                  <Input
                    placeholder="발렌타인데이 세트"
                    className="mt-1 h-10"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">{t('posMenuCategoryMain') || '대분류'}</label>
                  <div className="mt-1 h-10 flex items-center rounded-md border bg-muted/40 px-3 text-sm">
                    {PROMOTION_MAIN_CATEGORY}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold">{t('posMenuCategory') || '소분류'}</label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) => setFormData((p) => ({ ...p, category: v }))}
                  >
                    <SelectTrigger className="mt-1 h-10">
                      <SelectValue placeholder={t('itemsCategoryRequired')} />
                    </SelectTrigger>
                    <SelectContent>
                      {promoSubCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold">{t('posPromoValidFrom') || '적용 시작'}</label>
                    <Input
                      type="date"
                      className="mt-1 h-10"
                      value={formData.validFrom}
                      onChange={(e) => setFormData((p) => ({ ...p, validFrom: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t('posPromoValidTo') || '적용 종료'}</label>
                    <Input
                      type="date"
                      className="mt-1 h-10"
                      value={formData.validTo}
                      onChange={(e) => setFormData((p) => ({ ...p, validTo: e.target.value }))}
                    />
                  </div>
                </div>
                {campaignRangeMismatch && (
                  <p className="text-[11px] text-amber-700">
                    {t('posPromoCampaignDateHint') || '선택한 캠페인 기간과 적용 기간이 다릅니다. 프로모션 적용 기간을 기준으로 POS에 반영됩니다.'}
                  </p>
                )}
                <div>
                  <p className="text-xs font-semibold mb-2">{t('posPromoChannels') || '판매 채널'}</p>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={formData.channelHall}
                        onCheckedChange={(v) => setFormData((p) => ({ ...p, channelHall: v === true }))}
                      />
                      {t('posOrderTypeDineIn') || '홀'}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={formData.channelTakeout}
                        onCheckedChange={(v) => setFormData((p) => ({ ...p, channelTakeout: v === true }))}
                      />
                      {t('posOrderTypeTakeout') || '포장'}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={formData.channelDelivery}
                        onCheckedChange={(v) => setFormData((p) => ({ ...p, channelDelivery: v === true }))}
                      />
                      {t('posOrderTypeDelivery') || '배달'}
                    </label>
                  </div>
                </div>
                {formData.channelDelivery && deliveryApps.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-1">{t('posPromoDeliveryApps') || '배달 앱 (비우면 전체)'}</p>
                    {canSearchAll && stores.length > 0 && (
                      <Select value={storeCode || '_'} onValueChange={(v) => setStoreCode(v === '_' ? '' : v)}>
                        <SelectTrigger className="mb-2 h-8 text-xs">
                          <SelectValue placeholder="매장" />
                        </SelectTrigger>
                        <SelectContent>
                          {stores.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {deliveryApps.map((a) => (
                        <label key={a.code} className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={formData.deliveryAppCodes.includes(a.code)}
                            onCheckedChange={() => toggleDeliveryApp(a.code)}
                          />
                          {a.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold">{t('posMenuPriceHall') || '판매가 (฿)'}</label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="mt-1 h-10 text-right"
                    value={formData.price}
                    onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">{t('posMenuPriceDelivery') || '배달가 (฿)'}</label>
                  <Input
                    type="number"
                    placeholder="비워두면 홀과 동일"
                    className="mt-1 h-10 text-right"
                    value={formData.priceDelivery}
                    onChange={(e) => setFormData((p) => ({ ...p, priceDelivery: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={formData.vatIncluded}
                      onChange={(e) => setFormData((p) => ({ ...p, vatIncluded: e.target.checked }))}
                    />
                    {t('posMenuVatIncluded')}
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))}
                    />
                    {t('posMenuActive')}
                  </label>
                </div>
                <div>
                  <label className="text-xs font-semibold">마케팅 캠페인</label>
                  <Select
                    value={formData.marketingCampaignId || '_'}
                    onValueChange={(v) => setFormData((p) => ({ ...p, marketingCampaignId: v === '_' ? '' : v }))}
                  >
                    <SelectTrigger className="mt-1 h-10">
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">없음</SelectItem>
                      {campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.topic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!editingId ? (
                  <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
                    <p className="mb-1 font-semibold text-foreground">{t('posPromoItems') || '구성 메뉴'}</p>
                    <p className="leading-relaxed">
                      {t('posPromoComposeAfterSave') ||
                        '코드·이름 등 기본 정보를 입력한 뒤 하단 [저장]을 누르면 여기에서 세트 구성 메뉴를 추가할 수 있습니다.'}
                    </p>
                  </div>
                ) : (
                  <div ref={composeAnchorRef} className="scroll-mt-28 rounded border border-dashed p-3">
                    <h4 className="mb-2 text-xs font-semibold">{t('posPromoItems') || '구성 메뉴'}</h4>
                    {menus.length === 0 && (
                      <p className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                        {t('posPromoNoMenusForCompose') ||
                          '연결 가능한 일반 메뉴가 없습니다. 메뉴 관리에서 활성 메뉴를 등록하세요. (프로모 미러 메뉴는 구성에 넣을 수 없습니다.)'}
                      </p>
                    )}
                    <ul className="mb-2 space-y-1">
                      {promoItems.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs"
                        >
                          <span>
                            {getItemDisplayName(item)} × {item.quantity}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 px-1 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteItem(item)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Select
                          value={newItemMenuId || '_'}
                          onValueChange={(v) => {
                            setNewItemMenuId(v === '_' ? '' : v)
                            setNewItemOptionId(null)
                          }}
                        >
                          <SelectTrigger className="h-8 min-w-[140px] flex-1 text-xs">
                            <SelectValue placeholder={t('posPromoSelectMenu')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_">-</SelectItem>
                            {menus.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(optionsByMenuId[newItemMenuId]?.length ?? 0) > 0 && (
                          <Select
                            value={newItemOptionId || '_'}
                            onValueChange={(v) => setNewItemOptionId(v === '_' ? null : v)}
                          >
                            <SelectTrigger className="h-8 min-w-[100px] flex-1 text-xs">
                              <SelectValue placeholder={t('posPromoSelectOption')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_">-</SelectItem>
                              {(optionsByMenuId[newItemMenuId] || []).map((opt) => (
                                <SelectItem key={opt.id} value={opt.id}>
                                  {opt.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Input
                          type="number"
                          min={0.5}
                          step={0.5}
                          placeholder="1"
                          className="h-8 w-14 text-right text-xs"
                          value={newItemQty}
                          onChange={(e) => setNewItemQty(e.target.value)}
                        />
                        <Button size="sm" className="h-8 px-2 shrink-0" onClick={handleAddItem}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <Button className="flex-1" onClick={handleSave}>
                    <Save className="mr-2 h-4 w-4" />
                    {t('itemsBtnSave')}
                  </Button>
                  <Button variant="outline" onClick={handleReset}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t('itemsBtnReset')}
                  </Button>
                </div>
              </div>
            </div>

            {editingId && promoItems.length > 0 && (
              <div
                className={cn(
                  'rounded-xl border p-4 space-y-2',
                  !hasAllCosts && 'opacity-75 border-amber-200 bg-amber-50/50'
                )}
              >
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Calculator className="h-4 w-4" />
                  {t('posPromoCostSummary') || '원가·할인·마진'}
                </h4>
                <div className="grid gap-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('posPromoRegularSum') || '정가 합계'}</span>
                    <span className="font-mono tabular-nums">฿{regularPriceSum.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('posPromoCostSumHall') || '원가 합계(홀)'}</span>
                    <span className="font-mono tabular-nums">
                      {hasAllCosts ? `฿${costTotalHall.toFixed(0)}` : t('loading') || '...'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('posPromoCostSumDelivery') || '원가 합계(배달·포장)'}</span>
                    <span className="font-mono tabular-nums">
                      {hasAllCosts ? `฿${costTotalDelivery.toFixed(0)}` : t('loading') || '...'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('posMenuPriceHall') || '판매가(홀)'}</span>
                    <span className="font-mono font-semibold tabular-nums">฿{salePrice.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-amber-700">
                    <span>{t('posPromoDiscount') || '할인'}</span>
                    <span className="font-mono tabular-nums">
                      -฿{discountAmt.toLocaleString()} ({discountPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t font-medium">
                    <span>{t('posPromoMargin') || '마진(홀)'}</span>
                    <span
                      className={cn(
                        'font-mono tabular-nums',
                        marginBaht >= 0 ? 'text-green-600' : 'text-destructive'
                      )}
                    >
                      ฿{marginBaht.toFixed(0)} ({marginPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t('posPromoMarginDelivery') || '마진(배달가 기준)'}</span>
                    <span className={cn('font-mono tabular-nums', marginBahtDel >= 0 ? 'text-green-600' : 'text-destructive')}>
                      ฿{marginBahtDel.toFixed(0)} ({marginPercentDel.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0 rounded-xl border bg-card overflow-hidden">
            <div className="border-b px-4 py-3 sm:px-6 sm:py-4">
              <h3 className="text-sm font-bold">{t('itemsList') || '목록'}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t('posPromoListHint') || '행을 눌러 편집합니다.'}
              </p>
            </div>
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t('posMenuCode')}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[160px]">{t('posPromoName')}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[100px]">
                      {t('posPromoValidPeriod') || '적용기간'}
                    </th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-32">
                      {t('posMenuPriceHall')} / {t('posMenuPriceDelivery')}
                    </th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t('posMenuActive')}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t('itemsColAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((p, idx) => (
                    <tr
                      key={p.id}
                      className={cn(
                        'border-b last:border-b-0 hover:bg-muted/20 cursor-pointer',
                        idx % 2 === 1 && 'bg-muted/5',
                        editingId === p.id && 'bg-primary/5'
                      )}
                      onClick={() => handleEdit(p)}
                    >
                      <td className="px-5 py-3 text-center">
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          {p.code}
                        </span>
                      </td>
                      <td className="px-5 py-3">{p.name}</td>
                      <td className="px-5 py-3 text-center text-[10px] text-muted-foreground whitespace-nowrap">
                        {p.validFrom || p.validTo
                          ? `${p.validFrom?.replace(/-/g, '.') || '…'} ~ ${p.validTo?.replace(/-/g, '.') || '…'}`
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums text-xs">
                        {p.price > 0 ? `${p.price.toLocaleString()} ฿` : '-'}
                        {p.priceDelivery != null ? ` / ${p.priceDelivery.toLocaleString()} ฿` : ''}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {p.isActive ? (
                          <span className="text-[10px] text-green-600 font-medium">Y</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handleEdit(p)}
                          >
                            <Pencil className="mr-1 h-2.5 w-2.5" />
                            {t('itemsBtnEdit')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px] text-destructive"
                            onClick={() => handleDelete(p)}
                          >
                            <Trash2 className="mr-1 h-2.5 w-2.5" />
                            {t('itemsBtnDelete')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from 'react'
import { Tag, FilePlus, Save, RotateCcw, Pencil, Trash2, Plus, Calculator, AlertTriangle, X, Search, Loader2 } from 'lucide-react'
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
  type MarketingCampaign,
  useStoreList,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { PROMOTION_MAIN_CATEGORY, PROMOTION_DEFAULT_SUBCATEGORIES } from '@/lib/pos-promo-constants'
import { useAuth } from '@/lib/auth-context'
import { isOfficeRole } from '@/lib/permissions'
import { useSearchParams } from 'next/navigation'
import { PromoBuilderPanel } from '@/components/marketing/promo-builder-panel'
import { PromoLineComposerPanel } from '@/components/marketing/promo-line-composer-panel'
import { PromoEconomicsPanel } from '@/components/marketing/promo-economics-panel'
import { PromoSearchListPanel } from '@/components/marketing/promo-search-list-panel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { calcCostTotal, calcPromoEconomics, calcRegularPriceSum, promoCostKey } from '@/lib/promo-economics'

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
  marketingActualCost: '' as string,
}

export default function MarketingPromosPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const campaignIdFromQuery = searchParams.get('campaignId')?.trim() || ''
  const { auth } = useAuth()
  const { stores } = useStoreList()
  const canSearchAll = isOfficeRole(auth?.role || '')
  const [storeCode, setStoreCode] = React.useState('')
  const [promoSubCategories, setPromoSubCategories] = React.useState<string[]>([...PROMOTION_DEFAULT_SUBCATEGORIES])
  const [deliveryApps, setDeliveryApps] = React.useState<{ code: string; name: string }[]>([])
  const [promos, setPromos] = React.useState<PosPromo[]>([])
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  /** 목록 조회용 캠페인(필수) — 캠페인 허브 번호 기준으로 프로모션을 묶습니다 */
  const [listCampaignId, setListCampaignId] = React.useState('')
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
  const [menuCategoryMainFilter, setMenuCategoryMainFilter] = React.useState('')
  const [menuCategoryFilter, setMenuCategoryFilter] = React.useState('')
  const [menuSearchKeyword, setMenuSearchKeyword] = React.useState('')
  const [schemaStatus, setSchemaStatus] = React.useState<{
    posPromosExtended: boolean
    posMenusPromoId: boolean
    ok: boolean
  } | null>(null)
  const [schemaBannerDismissed, setSchemaBannerDismissed] = React.useState(false)
  const [newRegisterPulse, setNewRegisterPulse] = React.useState(false)
  const emptyListFilter = React.useMemo(
    () => ({
      search: '',
      overlapFrom: '',
      overlapTo: '',
      hall: false,
      takeout: false,
      delivery: false,
      activeOnly: false,
    }),
    []
  )
  const [listFilter, setListFilter] = React.useState(emptyListFilter)
  const [listRefreshing, setListRefreshing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [mainTab, setMainTab] = React.useState<'edit' | 'list'>('edit')
  const [discountTargetPct, setDiscountTargetPct] = React.useState('')
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

  const menuCategoryMainOptions = React.useMemo(() => {
    const set = new Set<string>()
    for (const m of menus) {
      const v = String(m.categoryMain || '').trim()
      if (v) set.add(v)
    }
    return Array.from(set).sort()
  }, [menus])

  const menuCategoryOptions = React.useMemo(() => {
    const set = new Set<string>()
    for (const m of menus) {
      const main = String(m.categoryMain || '').trim()
      if (menuCategoryMainFilter && main !== menuCategoryMainFilter) continue
      const cat = String(m.category || '').trim()
      if (cat) set.add(cat)
    }
    return Array.from(set).sort()
  }, [menus, menuCategoryMainFilter])

  const filteredMenusForCompose = React.useMemo(() => {
    const q = menuSearchKeyword.trim().toLowerCase()
    return menus.filter((m) => {
      const main = String(m.categoryMain || '').trim()
      const cat = String(m.category || '').trim()
      if (menuCategoryMainFilter && main !== menuCategoryMainFilter) return false
      if (menuCategoryFilter && cat !== menuCategoryFilter) return false
      if (q) {
        const hay = `${m.name} ${m.id} ${main} ${cat}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [menus, menuCategoryMainFilter, menuCategoryFilter, menuSearchKeyword])

  const filteredPromos = React.useMemo(() => {
    const f = listFilter
    const q = f.search.trim().toLowerCase()
    const hasChannelFilter = f.hall || f.takeout || f.delivery
    const hasOverlap = Boolean(f.overlapFrom.trim() || f.overlapTo.trim())

    return promos.filter((p) => {
      if (f.activeOnly && !p.isActive) return false
      if (q) {
        const hay = `${p.code} ${p.name} ${p.marketingCampaignNo ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (hasOverlap) {
        const f0 = f.overlapFrom.trim() || '1900-01-01'
        const f1 = f.overlapTo.trim() || '9999-12-31'
        if (f0 > f1) return false
        const p0 = (p.validFrom && String(p.validFrom).slice(0, 10)) || '1900-01-01'
        const p1 = (p.validTo && String(p.validTo).slice(0, 10)) || '9999-12-31'
        if (p0 > f1 || p1 < f0) return false
      }
      if (hasChannelFilter) {
        if (f.hall && p.channelHall === false) return false
        if (f.takeout && p.channelTakeout === false) return false
        if (f.delivery && p.channelDelivery === false) return false
      }
      return true
    })
  }, [promos, listFilter])

  const runPromoListSearch = React.useCallback(async () => {
    const cid = listCampaignId.trim()
    if (!cid) {
      await appAlert('캠페인을 선택한 뒤 목록을 불러옵니다. 상단에서 캠페인을 고르세요.')
      return
    }
    setListRefreshing(true)
    try {
      const list = await getPosPromos({ campaignId: cid })
      setPromos(Array.isArray(list) ? list : [])
    } catch {
      await appAlert(t('msg_load_fail'))
    } finally {
      setListRefreshing(false)
    }
  }, [listCampaignId, t])

  const clearListFilters = React.useCallback(() => {
    setListFilter(emptyListFilter)
  }, [emptyListFilter])

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
    let mounted = true
    void (async () => {
      try {
        const [menuRes, optRes, campRes, catRes] = await Promise.allSettled([
          getPosMenus(),
          getPosMenuOptions(),
          getMarketingCampaigns(),
          getPosMenuCategoriesConfig(),
        ])
        if (!mounted) return

        if (menuRes.status === 'fulfilled') {
          setMenus(
            (menuRes.value || []).filter((m) => m.isActive && !(m.promoId != null && String(m.promoId).trim() !== ''))
          )
        } else {
          setMenus([])
        }

        if (optRes.status === 'fulfilled') setAllOptions(optRes.value || [])
        else setAllOptions([])

        if (campRes.status === 'fulfilled') {
          setCampaigns(Array.isArray(campRes.value) ? campRes.value : [])
        } else {
          setCampaigns([])
        }

        if (catRes.status === 'fulfilled') {
          const subs = catRes.value?.categoriesByMain?.[PROMOTION_MAIN_CATEGORY]
          if (subs?.length) setPromoSubCategories(subs)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  React.useEffect(() => {
    if (campaignIdFromQuery) setListCampaignId(campaignIdFromQuery)
  }, [campaignIdFromQuery])

  React.useEffect(() => {
    const cid = listCampaignId.trim()
    if (!cid) {
      setPromos([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const list = await getPosPromos({ campaignId: cid })
        if (!cancelled) setPromos(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setPromos([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [listCampaignId])

  /** 신규: 캠페인 선택 시 다음 POS 코드(캠페인번호-Sxx) 미리보기 */
  React.useEffect(() => {
    if (loading || editingId) return
    const cid = formData.marketingCampaignId.trim()
    if (!cid) {
      setFormData((p) => (p.code ? { ...p, code: '' } : p))
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const r = await getNextPosPromoCode({ campaignId: cid })
        const next = r?.code?.trim()
        if (!cancelled && next) setFormData((p) => ({ ...p, code: next }))
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [formData.marketingCampaignId, loading, editingId])

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
    if (!campaignIdFromQuery) return
    setFormData((prev) =>
      prev.marketingCampaignId ? prev : { ...prev, marketingCampaignId: campaignIdFromQuery }
    )
  }, [campaignIdFromQuery])

  const missingCostTargets = React.useMemo(
    () =>
      promoItems.filter((it) => {
        const key = promoCostKey(it.menuId, it.optionId)
        return costsHall[key] == null || costsDelivery[key] == null
      }),
    [promoItems, costsHall, costsDelivery]
  )

  React.useEffect(() => {
    if (missingCostTargets.length === 0) return
    let cancelled = false

    for (const it of missingCostTargets) {
      const key = promoCostKey(it.menuId, it.optionId)
      getMenuCost({ menuId: it.menuId, optionId: it.optionId || undefined })
        .then((r) => {
          if (cancelled) return
          const hall = (r as { costHall?: number }).costHall ?? (r as { cost?: number }).cost ?? 0
          const del = (r as { costDelivery?: number }).costDelivery ?? hall
          setCostsHall((c) => ({ ...c, [key]: hall }))
          setCostsDelivery((c) => ({ ...c, [key]: del }))
        })
        .catch(() => {
          if (cancelled) return
          setCostsHall((c) => ({ ...c, [key]: 0 }))
          setCostsDelivery((c) => ({ ...c, [key]: 0 }))
        })
    }

    return () => {
      cancelled = true
    }
  }, [missingCostTargets])

  const regularPriceSum = React.useMemo(() => {
    return calcRegularPriceSum({
      items: promoItems,
      menus,
      optionsByMenuId,
    })
  }, [promoItems, menus, optionsByMenuId])

  const costTotalHall = React.useMemo(() => {
    return calcCostTotal(promoItems, costsHall)
  }, [promoItems, costsHall])

  const costTotalDelivery = React.useMemo(() => {
    return calcCostTotal(promoItems, costsDelivery)
  }, [promoItems, costsDelivery])

  const economics = React.useMemo(
    () =>
      calcPromoEconomics({
        regularPriceSum,
        costTotalHall,
        costTotalDelivery,
        salePriceHall: Number(formData.price) || 0,
        salePriceDelivery: formData.priceDelivery !== '' ? Number(formData.priceDelivery) : undefined,
      }),
    [regularPriceSum, costTotalHall, costTotalDelivery, formData.price, formData.priceDelivery]
  )
  const salePrice = economics.salePrice
  const salePriceDel = economics.salePriceDel
  const discountAmt = economics.discountAmt
  const discountPercent = economics.discountPercent
  const marginBaht = economics.marginBaht
  const marginPercent = economics.marginPercent
  const marginBahtDel = economics.marginBahtDel
  const marginPercentDel = economics.marginPercentDel
  const costRateHall = economics.costRateHall
  const costRateDelivery = economics.costRateDelivery
  const hasAllCosts =
    promoItems.length === 0 ||
    promoItems.every((it) => {
      const key = promoCostKey(it.menuId, it.optionId)
      return costsHall[key] != null && costsDelivery[key] != null
    })

  const promoLineDetails = React.useMemo(() => {
    return promoItems.map((item) => {
      const menu = menus.find((m) => m.id === item.menuId)
      const opt = item.optionId ? allOptions.find((o) => o.id === item.optionId) : null
      const unitReg = (menu?.price ?? 0) + (opt?.priceModifier ?? 0)
      const qty = item.quantity ?? 1
      const key = promoCostKey(item.menuId, item.optionId)
      const cH = costsHall[key]
      const cD = costsDelivery[key]
      return {
        item,
        unitReg,
        qty,
        lineReg: unitReg * qty,
        lineHall: (cH ?? 0) * qty,
        lineDel: (cD ?? 0) * qty,
        hasCost: cH != null && cD != null,
      }
    })
  }, [promoItems, menus, allOptions, costsHall, costsDelivery])

  const handleApplyDiscountPctToHall = async () => {
    const p = Number(String(discountTargetPct).replace(',', '.'))
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      await appAlert('할인율은 0~100 사이 숫자로 입력하세요.')
      return
    }
    if (regularPriceSum <= 0) {
      await appAlert('구성 메뉴를 먼저 추가한 뒤 정가 합계가 있어야 합니다.')
      return
    }
    const next = Math.max(0, Math.round(regularPriceSum * (1 - p / 100)))
    setFormData((fd) => ({ ...fd, price: String(next) }))
  }

  const handleNewRegister = () => {
    setFormData({ ...emptyForm, marketingCampaignId: campaignIdFromQuery || '' })
    setEditingId(null)
    setPromoItems([])
    setNewItemMenuId('')
    setNewItemOptionId(null)
    setNewItemQty('1')
    setNewRegisterPulse(true)
    window.setTimeout(() => setNewRegisterPulse(false), 2200)
    window.setTimeout(() => formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
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
          marketingActualCost:
            p.marketingActualCost != null && p.marketingActualCost > 0 ? String(p.marketingActualCost) : '',
        })
      }
    } else {
      setFormData({ ...emptyForm, marketingCampaignId: campaignIdFromQuery || listCampaignId || '' })
    }
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
    const codeTrim = formData.code.trim()
    const name = formData.name.trim()
    if (!name) {
      await appAlert(t('posMenuAlertCodeName'))
      return
    }
    if (!formData.marketingCampaignId.trim()) {
      await appAlert('캠페인을 선택하세요. 캠페인 허브에서 연결 후 저장해야 합니다.')
      return
    }
    if (editingId && !codeTrim) {
      await appAlert(t('posMenuAlertCodeName'))
      return
    }
    const vf = formData.validFrom.trim()
    const vt = formData.validTo.trim()
    if (vf && vt && vf > vt) {
      await appAlert(t('posPromoValidRangeInvalid'))
      return
    }
    const dpct = regularPriceSum > 0 ? Math.round(discountPercent * 100) / 100 : null
    const res = await savePosPromo({
      id: editingId || undefined,
      code: editingId ? codeTrim : undefined,
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
      marketingActualCost: formData.marketingActualCost.trim() !== '' ? Number(formData.marketingActualCost) : 0,
      userRole: auth?.role,
      userName: auth?.user,
    })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t('msg_save_fail_detail'))
      return
    }
    const expenseExtra = res.expenseSyncMessage ? `\n\n${res.expenseSyncMessage}` : ''
    clearListFilters()
    const listCid = listCampaignId.trim() || formData.marketingCampaignId.trim()
    if (!listCampaignId.trim() && formData.marketingCampaignId.trim()) {
      setListCampaignId(formData.marketingCampaignId.trim())
    }
    const refreshed = listCid ? await getPosPromos({ campaignId: listCid }) : []
    setPromos(refreshed || [])
    if (editingId) {
      await appAlert(t('itemsAlertUpdated'))
    } else {
      let nextId = res.id ? String(res.id) : ''
      const resolvedCode = (refreshed || []).find((p) => p.id === res.id)?.code || codeTrim
      if (!nextId) {
        const found = resolvedCode ? (refreshed || []).find((p) => p.code === resolvedCode) : undefined
        if (found) nextId = String(found.id)
      }
      if (nextId) {
        setEditingId(nextId)
        await appAlert(t('itemsAlertSaved') + expenseExtra)
        window.setTimeout(() => composeAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200)
      } else {
        await appAlert(t('itemsAlertSaved') + expenseExtra)
      }
    }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (promo: PosPromo) => {
    setMainTab('edit')
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
      marketingActualCost:
        promo.marketingActualCost != null && promo.marketingActualCost > 0
          ? String(promo.marketingActualCost)
          : '',
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
      await appAlert(t('posPromoSelectOption'))
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
      await appAlert(translateApiMessage(res.message, t) || res.message)
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
    if (!await appConfirm(`"${promo.name}" ${t('posPromoConfirmDeactivate')}`)) return
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
      await appAlert(translateApiMessage(res.message, t) || res.message)
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
    if (!menu) return `${t('posPromoMenuUnknownPrefix')}${item.menuId}`
    if (!item.optionId) return menu.name
    const opt = allOptions.find((o) => o.id === item.optionId)
    return opt ? `${menu.name} (${opt.name})` : menu.name
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-[min(100%,1600px)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t('posPromoMgmt')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('posPromoMgmtSub')}
            </p>
          </div>
        </div>
        <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          마케팅은 <strong className="text-foreground">캠페인 허브</strong>에서 발급한 <strong className="text-foreground">캠페인 고유번호</strong>를 기준으로 연결합니다. 프로모션 POS 코드는{' '}
          <code className="rounded bg-muted px-1">{`{캠페인번호}-S01`}</code> 형식으로 자동 부여됩니다.
        </div>
        {campaignIdFromQuery && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            캠페인 허브에서 전달된 캠페인으로 목록·신규가 연결됩니다.
          </div>
        )}

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t('loading')}
          </div>
        )}

        {schemaStatus && !schemaStatus.ok && !schemaBannerDismissed && (
          <div className="mb-4 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold">{t('posPromoSchemaBannerTitle')}</p>
              <p className="text-xs leading-relaxed opacity-90">
                {t('posPromoSchemaBannerBody')}
                {!schemaStatus.posPromosExtended && (
                  <span className="block mt-1">{t('posPromoSchemaMissingPosPromosExtended')}</span>
                )}
                {!schemaStatus.posMenusPromoId && (
                  <span className="block mt-1">{t('posPromoSchemaMissingPosMenusPromoId')}</span>
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
          <button
            type="button"
            className={cn(
              'rounded-full border px-2.5 py-0.5 font-semibold transition-colors',
              !editingId ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/50 text-muted-foreground',
              'hover:opacity-90 cursor-pointer'
            )}
            onClick={() => formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
          >
            ① {t('posPromoStepBasic')}
          </button>
          <span className="text-muted-foreground">→</span>
          <button
            type="button"
            className={cn(
              'rounded-full border px-2.5 py-0.5 font-semibold transition-colors',
              editingId ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/50 text-muted-foreground',
              'hover:opacity-90 cursor-pointer'
            )}
            onClick={() => {
              if (editingId) {
                composeAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              } else {
                void appAlert(t('posPromoStepHint'))
              }
            }}
          >
            ② {t('posPromoStepCompose')}
          </button>
          {!editingId && (
            <span className="text-muted-foreground">
              · {t('posPromoStepHint')}
            </span>
          )}
        </div>

        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'edit' | 'list')} className="w-full">
          <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-auto">
            <TabsTrigger value="edit" className="text-xs sm:text-sm">
              편집 · 구성
            </TabsTrigger>
            <TabsTrigger value="list" className="text-xs sm:text-sm">
              프로모션 목록
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="mt-0 space-y-6 focus-visible:outline-none">
            <div className="mx-auto w-full max-w-[min(100%,1600px)] space-y-6">
            <PromoBuilderPanel
              className={cn(
                'shadow-sm transition-shadow duration-300',
                newRegisterPulse && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              )}
              title={t('posPromoFormTitle')}
              description={editingId ? t('itemsFormEditDesc') : t('itemsFormNewDesc')}
              action={
                <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-[11px]" onClick={handleNewRegister}>
                  <FilePlus className="h-3.5 w-3.5" />
                  {t('itemsBtnNewRegister')}
                </Button>
              }
            >
              {!editingId && newRegisterPulse && (
                <p className="text-[11px] font-medium text-primary">
                  {t('posPromoNewModeOn')}
                </p>
              )}
              <div ref={formCardRef} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold">{t('posPromoMarketingCampaign')} *</label>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    캠페인 허브에서 먼저 등록한 캠페인을 선택하세요. 고유번호가 프로모션 코드의 접두가 됩니다.
                  </p>
                  <Select
                    value={formData.marketingCampaignId || '_none'}
                    onValueChange={(v) => setFormData((p) => ({ ...p, marketingCampaignId: v === '_none' ? '' : v }))}
                  >
                    <SelectTrigger className="mt-1 h-10">
                      <SelectValue placeholder={t('posPromoCampaignSelectPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">캠페인 선택 *</SelectItem>
                      {campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.campaignNo ? `[${c.campaignNo}] ` : ''}
                          {c.topic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold">{t('posMenuCode')} (POS)</label>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    신규는 캠페인 고유번호 기준 자동 부여입니다. 저장 후에는 POS·메뉴 연동을 위해 변경할 수 없습니다.
                  </p>
                  <Input
                    placeholder={formData.marketingCampaignId ? '저장 시 자동 부여' : '먼저 캠페인을 선택하세요'}
                    className="mt-1 h-10 font-mono bg-muted/40"
                    value={formData.code}
                    readOnly
                    disabled={false}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">{t('posPromoName')}</label>
                  <Input
                    placeholder={t('posPromoNamePlaceholder')}
                    className="mt-1 h-10"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">{t('posMenuCategoryMain')}</label>
                  <div className="mt-1 h-10 flex items-center rounded-md border bg-muted/40 px-3 text-sm">
                    {PROMOTION_MAIN_CATEGORY}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold">{t('posMenuCategory')}</label>
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
                    <label className="text-xs font-semibold">{t('posPromoValidFrom')}</label>
                    <Input
                      type="date"
                      className="mt-1 h-10"
                      value={formData.validFrom}
                      onChange={(e) => setFormData((p) => ({ ...p, validFrom: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t('posPromoValidTo')}</label>
                    <Input
                      type="date"
                      className="mt-1 h-10"
                      value={formData.validTo}
                      onChange={(e) => setFormData((p) => ({ ...p, validTo: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold">실제 비용 (฿) · 지출관리 지급예정</label>
                  <Input
                    type="number"
                    min={0}
                    className="mt-1 h-10"
                    value={formData.marketingActualCost}
                    onChange={(e) => setFormData((p) => ({ ...p, marketingActualCost: e.target.value }))}
                    placeholder="0"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    본사 권한으로 저장 시 지급예정에 반영됩니다. 비용 발생일은 적용 시작일을 사용합니다.
                  </p>
                </div>
                {campaignRangeMismatch && (
                  <p className="text-[11px] text-amber-700">
                    {t('posPromoCampaignDateHint')}
                  </p>
                )}
                <div>
                  <p className="text-xs font-semibold mb-2">{t('posPromoChannels')}</p>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={formData.channelHall}
                        onCheckedChange={(v) => setFormData((p) => ({ ...p, channelHall: v === true }))}
                      />
                      {t('posOrderTypeDineIn')}
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
                      {t('posOrderTypeDelivery')}
                    </label>
                  </div>
                </div>
                {formData.channelDelivery && deliveryApps.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-1">{t('posPromoDeliveryApps')}</p>
                    {canSearchAll && stores.length > 0 && (
                      <Select value={storeCode || '_'} onValueChange={(v) => setStoreCode(v === '_' ? '' : v)}>
                        <SelectTrigger className="mb-2 h-8 text-xs">
                          <SelectValue placeholder={t('posPromoStorePlaceholder')} />
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
                  <label className="text-xs font-semibold">{t('posMenuPriceHall')}</label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="mt-1 h-10 text-right"
                    value={formData.price}
                    onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">{t('posMenuPriceDelivery')}</label>
                  <Input
                    type="number"
                    placeholder={t('posPromoPriceDeliveryPlaceholder')}
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
                {!editingId && (
                  <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
                    <p className="mb-1 font-semibold text-foreground">{t('posPromoItems')}</p>
                    <p className="leading-relaxed">{t('posPromoComposeAfterSave')}</p>
                    <p className="mt-2 text-[10px] leading-relaxed">
                      저장 후 이 화면 아래에 넓은 구성 작업판이 열립니다. 합산 정가·원가·할인율을 한곳에서 확인할 수 있습니다.
                    </p>
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <Button className="flex-1" onClick={handleSave} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? t('loading') : t('itemsBtnSave')}
                  </Button>
                  <Button variant="outline" onClick={handleReset}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t('itemsBtnReset')}
                  </Button>
                </div>
              </div>
            </PromoBuilderPanel>

            {editingId && (
              <div
                ref={composeAnchorRef}
                className="scroll-mt-24 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]"
              >
                <PromoLineComposerPanel expanded title={t('posPromoItems')}>
                  {menus.length === 0 && (
                    <p className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      {t('posPromoNoMenusForCompose')}
                    </p>
                  )}
                  <div className="mb-3 min-h-0 flex-1 overflow-auto rounded-md border bg-muted/15">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead className="sticky top-0 z-[1] bg-muted/90 backdrop-blur-sm">
                        <tr className="border-b text-left">
                          <th className="px-2 py-2 font-semibold">구성</th>
                          <th className="w-12 px-2 py-2 text-right font-semibold">수량</th>
                          <th className="w-24 px-2 py-2 text-right font-semibold">정가</th>
                          <th className="w-24 px-2 py-2 text-right font-semibold">원가홀</th>
                          <th className="w-24 px-2 py-2 text-right font-semibold">원가딜</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {promoLineDetails.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                              메뉴를 추가하면 행이 표시됩니다.
                            </td>
                          </tr>
                        ) : (
                          promoLineDetails.map((row) => (
                            <tr key={row.item.id} className="border-b border-border/60 last:border-0">
                              <td className="px-2 py-1.5">{getItemDisplayName(row.item)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{row.qty}</td>
                              <td className="px-2 py-1.5 text-right font-mono tabular-nums">฿{row.lineReg.toLocaleString()}</td>
                              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                                {row.hasCost ? `฿${Math.round(row.lineHall).toLocaleString()}` : '…'}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                                {row.hasCost ? `฿${Math.round(row.lineDel).toLocaleString()}` : '…'}
                              </td>
                              <td className="px-1 py-1 text-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteItem(row.item)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-auto flex flex-shrink-0 flex-col gap-2 border-t pt-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Select
                        value={menuCategoryMainFilter || '_all'}
                        onValueChange={(v) => {
                          const next = v === '_all' ? '' : v
                          setMenuCategoryMainFilter(next)
                          setMenuCategoryFilter('')
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="대분류" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">대분류 전체</SelectItem>
                          {menuCategoryMainOptions.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={menuCategoryFilter || '_all'}
                        onValueChange={(v) => setMenuCategoryFilter(v === '_all' ? '' : v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="카테고리" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">카테고리 전체</SelectItem>
                          {menuCategoryOptions.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-8 text-xs"
                        placeholder="메뉴 검색"
                        value={menuSearchKeyword}
                        onChange={(e) => setMenuSearchKeyword(e.target.value)}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">메뉴 후보 {filteredMenusForCompose.length}개</p>
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={newItemMenuId || '_'}
                        onValueChange={(v) => {
                          setNewItemMenuId(v === '_' ? '' : v)
                          setNewItemOptionId(null)
                        }}
                      >
                        <SelectTrigger className="h-8 min-w-[160px] flex-1 text-xs">
                          <SelectValue placeholder={t('posPromoSelectMenu')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_">-</SelectItem>
                          {filteredMenusForCompose.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                              {m.category ? ` · ${m.category}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(optionsByMenuId[newItemMenuId]?.length ?? 0) > 0 && (
                        <Select
                          value={newItemOptionId || '_'}
                          onValueChange={(v) => setNewItemOptionId(v === '_' ? null : v)}
                        >
                          <SelectTrigger className="h-8 min-w-[120px] flex-1 text-xs">
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
                      <Button type="button" size="sm" className="h-8 shrink-0 px-2" onClick={handleAddItem}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </PromoLineComposerPanel>

                <div className="space-y-4">
                  <div className="rounded-xl border bg-card p-4 shadow-sm">
                    <p className="text-xs font-semibold text-foreground">목표 할인율 → 홀 판매가</p>
                    <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                      정가 합계 기준으로 위 기본 정보의 <strong className="text-foreground">홀 판매가</strong> 필드에 반영합니다.
                    </p>
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <div className="min-w-[6rem] flex-1">
                        <label className="text-[10px] font-medium text-muted-foreground">할인율 (%)</label>
                        <Input
                          className="mt-0.5 h-9 text-right text-sm"
                          inputMode="decimal"
                          placeholder="예: 15"
                          value={discountTargetPct}
                          onChange={(e) => setDiscountTargetPct(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 shrink-0"
                        onClick={() => void handleApplyDiscountPctToHall()}
                      >
                        판매가에 반영
                      </Button>
                    </div>
                  </div>
                  {promoItems.length > 0 ? (
                    <PromoEconomicsPanel
                      title={
                        <span className="flex items-center gap-2">
                          <Calculator className="h-4 w-4" />
                          {t('posPromoCostSummary')}
                        </span>
                      }
                      className={cn(
                        'space-y-2',
                        !hasAllCosts && 'opacity-75 border-amber-200 bg-amber-50/50'
                      )}
                    >
                      <div className="grid gap-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('posPromoRegularSum')}</span>
                          <span className="font-mono tabular-nums">฿{regularPriceSum.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('posPromoCostSumHall')}</span>
                          <span className="font-mono tabular-nums">
                            {hasAllCosts ? `฿${costTotalHall.toFixed(0)}` : t('loading')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('posPromoCostSumDelivery')}</span>
                          <span className="font-mono tabular-nums">
                            {hasAllCosts ? `฿${costTotalDelivery.toFixed(0)}` : t('loading')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('posMenuPriceHall')}</span>
                          <span className="font-mono font-semibold tabular-nums">฿{salePrice.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{t('posCostRatioHall')}</span>
                          <span className="font-mono tabular-nums">{costRateHall.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between text-amber-700">
                          <span>{t('posPromoDiscount')}</span>
                          <span className="font-mono tabular-nums">
                            -฿{discountAmt.toLocaleString()} ({discountPercent.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="flex justify-between border-t pt-1.5 font-medium">
                          <span>{t('posPromoMargin')}</span>
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
                          <span>{t('posPromoMarginDelivery')}</span>
                          <span
                            className={cn(
                              'font-mono tabular-nums',
                              marginBahtDel >= 0 ? 'text-green-600' : 'text-destructive'
                            )}
                          >
                            ฿{marginBahtDel.toFixed(0)} ({marginPercentDel.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{t('posCostRatioDelivery')}</span>
                          <span className="font-mono tabular-nums">{costRateDelivery.toFixed(1)}%</span>
                        </div>
                      </div>
                    </PromoEconomicsPanel>
                  ) : (
                    <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-center text-xs text-muted-foreground leading-relaxed">
                      구성 메뉴를 추가하면 정가·원가·할인·마진 요약이 표시됩니다.
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>

          </TabsContent>

          <TabsContent value="list" className="mt-0 focus-visible:outline-none">
          <PromoSearchListPanel
            header={
              <>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold">{t('posPromoListTitle')}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t('posPromoListHint')}
                  </p>
                </div>
                <p className="text-[11px] font-medium tabular-nums text-muted-foreground sm:pt-0.5">
                  {t('posPromoListShowing')
                    .replace(/\{n\}/g, String(filteredPromos.length))
                    .replace(/\{total\}/g, String(promos.length))}
                </p>
              </div>
              <div className="mt-4 space-y-3 rounded-lg border bg-muted/20 px-3 py-3 sm:px-4">
                <p className="text-[11px] font-semibold text-foreground">{t('posPromoListFilterTitle')}</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-[min(100%,280px)] flex-1">
                    <label className="mb-0.5 block text-[10px] font-medium text-muted-foreground">캠페인 · 목록</label>
                    <select
                      value={listCampaignId}
                      onChange={(e) => setListCampaignId(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">캠페인 선택…</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.campaignNo ? `[${c.campaignNo}] ` : ''}
                          {c.topic}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                  <div className="relative min-w-[10rem] flex-1 basis-[min(100%,14rem)]">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      className="h-9 pl-8 text-sm"
                      placeholder={t('posPromoListSearchPh')}
                      value={listFilter.search}
                      onChange={(e) => setListFilter((d) => ({ ...d, search: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void runPromoListSearch()
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 shrink-0 gap-1.5 px-3 text-xs"
                    disabled={listRefreshing}
                    onClick={() => void runPromoListSearch()}
                  >
                    {listRefreshing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    {listRefreshing ? t('loading') : t('search')}
                  </Button>
                  <label className="flex shrink-0 items-center gap-2 text-xs whitespace-nowrap">
                    <Checkbox
                      checked={listFilter.activeOnly}
                      onCheckedChange={(v) => setListFilter((d) => ({ ...d, activeOnly: v === true }))}
                    />
                    {t('posPromoListFilterActiveOnly')}
                  </label>
                  <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 text-xs" onClick={clearListFilters}>
                    {t('posPromoListFilterClear')}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">{t('posPromoListFilterApplyHint')}</p>
                <p className="text-[10px] text-muted-foreground leading-snug">{t('posPromoListFilterOverlapHint')}</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[130px] flex-1">
                    <label className="text-[10px] font-medium text-muted-foreground">{t('posPromoListFilterFrom')}</label>
                    <Input
                      type="date"
                      className="mt-0.5 h-9"
                      value={listFilter.overlapFrom}
                      onChange={(e) => setListFilter((d) => ({ ...d, overlapFrom: e.target.value }))}
                    />
                  </div>
                  <div className="min-w-[130px] flex-1">
                    <label className="text-[10px] font-medium text-muted-foreground">{t('posPromoListFilterTo')}</label>
                    <Input
                      type="date"
                      className="mt-0.5 h-9"
                      value={listFilter.overlapTo}
                      onChange={(e) => setListFilter((d) => ({ ...d, overlapTo: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] text-muted-foreground">{t('posPromoListFilterChannelsHint')}</p>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={listFilter.hall}
                        onCheckedChange={(v) => setListFilter((d) => ({ ...d, hall: v === true }))}
                      />
                      {t('posOrderTypeDineIn')}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={listFilter.takeout}
                        onCheckedChange={(v) => setListFilter((d) => ({ ...d, takeout: v === true }))}
                      />
                      {t('posOrderTypeTakeout')}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={listFilter.delivery}
                        onCheckedChange={(v) => setListFilter((d) => ({ ...d, delivery: v === true }))}
                      />
                      {t('posOrderTypeDelivery')}
                    </label>
                  </div>
                </div>
              </div>
              </>
            }
          >
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">캠페인번호</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t('posMenuCode')}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[160px]">{t('posPromoName')}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[100px]">
                      {t('posPromoValidPeriod')}
                    </th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-32">
                      {t('posMenuPriceHall')} / {t('posMenuPriceDelivery')}
                    </th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t('posMenuActive')}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t('itemsColAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPromos.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                        {!listCampaignId.trim()
                          ? '목록을 보려면 위에서 캠페인을 선택하세요.'
                          : promos.length === 0
                            ? loading
                              ? t('loading')
                              : t('posPromoListEmpty')
                            : t('posPromoListNoMatch')}
                      </td>
                    </tr>
                  )}
                  {filteredPromos.map((p, idx) => (
                    <tr
                      key={p.id}
                      className={cn(
                        'border-b last:border-b-0 hover:bg-muted/20 cursor-pointer',
                        idx % 2 === 1 && 'bg-muted/5',
                        editingId === p.id && 'bg-primary/5'
                      )}
                      onClick={() => handleEdit(p)}
                    >
                      <td className="px-5 py-3 text-center text-[10px] text-muted-foreground font-mono">
                        {p.marketingCampaignNo?.trim() || '—'}
                      </td>
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
                        {(p.marketingActualCost ?? 0) > 0 && (
                          <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                            실비 {(p.marketingActualCost ?? 0).toLocaleString()} ฿
                          </div>
                        )}
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
          </PromoSearchListPanel>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

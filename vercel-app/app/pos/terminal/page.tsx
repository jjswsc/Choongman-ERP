'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { POSHeader } from '@/components/pos/pos-header'
import { TableFloorView } from '@/components/pos/table-floor-view'
import { TableOrderPanel } from '@/components/pos/table-order-panel'
import { OrderBarList, type OrderBarItem } from '@/components/pos/order-bar-list'
import { PosTerminalMenuScreen } from '@/components/pos/pos-terminal-menu-screen'
import { CartPanel, type CartPanelHandle } from '@/components/pos/cart-panel'
import { LiveMenuSearchDialog } from '@/components/pos/live-menu-search-dialog'
import { usePosStore } from '@/hooks/use-pos-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LayoutGrid, Bike, Package, Search } from 'lucide-react'
import { getMembers, getPosMenus, getPosPrinterSettings, getPosTodaySales, savePosOrder, updatePosOrder, type PosMenu } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { canAccessAdmin, isOfficeRole } from '@/lib/permissions'

export type DeliveryApp = 'grab' | 'lineman' | 'shopee'
type TakeoutMode = 'slot' | 'member'
type PendingPayRequest = {
  tableName: string
  items: { id: string; name: string; price: number; quantity: number }[]
} | null

/** 테이블 현황 + 배달/포장 주문 + 장바구니. 테이블 선택 시 메뉴로 주문 추가. */
export default function PosTerminalPage() {
  const searchParams = useSearchParams()
  const typeParam = searchParams.get('type') ?? 'dine_in'
  const orderType = useMemo(() => {
    if (typeParam === 'takeout') return 'takeout' as const
    if (typeParam === 'delivery') return 'delivery' as const
    return 'dine-in' as const
  }, [typeParam])

  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const cartRef = useRef<CartPanelHandle>(null)
  const {
    stores,
    currentStore,
    currentStoreId,
    currentLayout,
    setCurrentStoreId,
    deliveryOrders,
    takeoutOrders,
    refetchStores,
    loadingTables,
  } = usePosStore()

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [servingTableId, setServingTableId] = useState<string | null>(null)
  const [deliveryApp, setDeliveryApp] = useState<DeliveryApp | null>(orderType === 'delivery' ? null : null)
  const [deliveryOrderNo, setDeliveryOrderNo] = useState('')
  const [takeoutMode, setTakeoutMode] = useState<TakeoutMode>('slot')
  const [takeoutSlot, setTakeoutSlot] = useState('1')
  const [takeoutMemberName, setTakeoutMemberName] = useState('')
  const [takeoutMemberNames, setTakeoutMemberNames] = useState<string[]>([])
  const [selectedDeliveryTargetId, setSelectedDeliveryTargetId] = useState<string | null>(null)
  const [selectedDeliveryTargetLabel, setSelectedDeliveryTargetLabel] = useState<string>('')
  const [selectedTakeoutTargetId, setSelectedTakeoutTargetId] = useState<string | null>(null)
  const [selectedTakeoutTargetLabel, setSelectedTakeoutTargetLabel] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'tables' | 'delivery' | 'takeout'>(
    orderType === 'delivery' ? 'delivery' : orderType === 'takeout' ? 'takeout' : 'tables'
  )
  const [pendingDineInOrderId, setPendingDineInOrderId] = useState<number | null>(null)
  const [pendingPayRequest, setPendingPayRequest] = useState<PendingPayRequest>(null)
  const [liveSearchOpen, setLiveSearchOpen] = useState(false)
  const [todaySales, setTodaySales] = useState<{
    completedCount: number
    completedTotal: number
  } | null>(null)
  const [cookingRules, setCookingRules] = useState<{
    freshMaxMin: number
    warningMaxMin: number
    mode: 'elapsed' | 'recipe_diff'
    recipeWarnDiff: number
    recipeUrgentDiff: number
    delayBadgeEnabled: boolean
    delaySoundEnabled: boolean
    delayAlertOverMin: number
  }>({
    freshMaxMin: 10,
    warningMaxMin: 15,
    mode: 'elapsed',
    recipeWarnDiff: 0,
    recipeUrgentDiff: 5,
    delayBadgeEnabled: true,
    delaySoundEnabled: false,
    delayAlertOverMin: 0,
  })
  const [menuTargets, setMenuTargets] = useState<{ byId: Map<string, number>; byName: Map<string, number> }>({
    byId: new Map(),
    byName: new Map(),
  })

  useEffect(() => {
    if (orderType !== 'delivery') setDeliveryApp(null)
  }, [orderType])

  useEffect(() => {
    getMembers({ limit: 300 })
      .then((list) => {
        const names = Array.from(
          new Set(
            list
              .filter((m) => m.status !== 'inactive')
              .map((m) => String(m.name || '').trim())
              .filter(Boolean)
          )
        ).slice(0, 300)
        setTakeoutMemberNames(names)
      })
      .catch(() => setTakeoutMemberNames([]))
  }, [])

  useEffect(() => {
    const storeCode = auth?.store
    if (!storeCode) return
    getPosTodaySales({ storeCode })
      .then(s => setTodaySales({ completedCount: s.completedCount, completedTotal: s.completedTotal }))
      .catch(() => setTodaySales(null))
  }, [auth?.store])

  useEffect(() => {
    if (!currentStoreId) return
    getPosPrinterSettings({ storeCode: currentStoreId })
      .then((s) => {
        const fresh = Math.max(1, Number(s.cookingFreshMaxMin ?? 10))
        const warning = Math.max(fresh + 1, Number(s.cookingWarningMaxMin ?? 15))
        const warnDiff = Math.max(0, Number(s.cookingRecipeWarningDiffMin ?? 0))
        const urgentDiff = Math.max(warnDiff + 1, Number(s.cookingRecipeUrgentDiffMin ?? 5))
        setCookingRules({
          freshMaxMin: fresh,
          warningMaxMin: warning,
          mode: s.cookingRuleMode === 'recipe_diff' ? 'recipe_diff' : 'elapsed',
          recipeWarnDiff: warnDiff,
          recipeUrgentDiff: urgentDiff,
          delayBadgeEnabled: s.cookingDelayBadgeEnabled !== false,
          delaySoundEnabled: Boolean(s.cookingDelaySoundEnabled),
          delayAlertOverMin: Math.max(0, Number(s.cookingDelayAlertOverMin ?? 0)),
        })
      })
      .catch(() => {
        setCookingRules({
          freshMaxMin: 10,
          warningMaxMin: 15,
          mode: 'elapsed',
          recipeWarnDiff: 0,
          recipeUrgentDiff: 5,
          delayBadgeEnabled: true,
          delaySoundEnabled: false,
          delayAlertOverMin: 0,
        })
      })
    getPosMenus()
      .then((list) => {
        const byId = new Map<string, number>()
        const byName = new Map<string, number>()
        ;(list || []).forEach((m: PosMenu) => {
          const min = Number(m.cookingTimeMin ?? 0)
          if (!Number.isFinite(min) || min <= 0) return
          const id = String(m.id || '').trim()
          const name = String(m.name || '').trim()
          if (id) byId.set(id, min)
          if (name) byName.set(name, min)
        })
        setMenuTargets({ byId, byName })
      })
      .catch(() => setMenuTargets({ byId: new Map(), byName: new Map() }))
  }, [currentStoreId])

  useEffect(() => {
    if (!pendingPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openDineInPaymentFromOrder(pendingPayRequest)
    setPendingPayRequest(null)
  }, [pendingPayRequest])

  const todayCompleted = todaySales?.completedCount ?? 0
  const totalSales = todaySales?.completedTotal ?? 0
  const selectedTable = currentStore?.tables.find(tbl => tbl.id === selectedTableId)
  const servingTable = currentStore?.tables.find(tbl => tbl.id === servingTableId)
  const deliveryApps: { id: DeliveryApp; labelKey: string }[] = [
    { id: 'grab', labelKey: 'posDeliveryAppGrab' },
    { id: 'lineman', labelKey: 'posDeliveryAppLineMan' },
    { id: 'shopee', labelKey: 'posDeliveryAppShopee' },
  ]
  const cartOrderType = activeTab === 'delivery' ? 'delivery' : activeTab === 'takeout' ? 'takeout' : 'dine-in'
  const formatTakeoutSlotLabel = (slot: string) =>
    (t('posTakeoutSlotN') || '포장 {{n}}').replace('{{n}}', slot)
  const baseTakeoutLabel = takeoutMode === 'member'
    ? (takeoutMemberName.trim() || (t('posTakeoutMemberName') || '회원 이름'))
    : formatTakeoutSlotLabel(takeoutSlot)
  const takeoutLabel = selectedTakeoutTargetLabel || baseTakeoutLabel
  const filteredTakeoutMembers = takeoutMemberName.trim()
    ? takeoutMemberNames.filter((name) => name.toLowerCase().includes(takeoutMemberName.trim().toLowerCase())).slice(0, 6)
    : takeoutMemberNames.slice(0, 6)

  const getOrderVisual = (order: {
    status?: string
    createdAt?: Date | string
    items?: { id?: string; name?: string; servedAt?: string | null }[]
  }) => {
    const items = Array.isArray(order.items) ? order.items : []
    const servedCount = items.filter((item) => Boolean(item.servedAt)).length
    const normalizedStatus = String(order.status || '').toLowerCase()
    const status: 'preparing' | 'partial_served' | 'completed' =
      normalizedStatus === 'completed'
        ? 'completed'
        : servedCount > 0
          ? 'partial_served'
          : 'preparing'
    const getItemTarget = (item: { id?: string; name?: string }) => {
      const rawId = String(item.id || '').trim()
      const rawName = String(item.name || '').trim()
      const normalizedId = rawId.replace(/^cart-existing-\d+-/, '')
      const idKey = normalizedId.split('-')[0]
      if (idKey && menuTargets.byId.has(idKey)) return menuTargets.byId.get(idKey) || 0
      const mainName = rawName.replace(/\s*\(.+\)\s*$/, '').trim()
      if (mainName && menuTargets.byName.has(mainName)) return menuTargets.byName.get(mainName) || 0
      return 0
    }
    const targetMin = status === 'preparing'
      ? Math.max(0, ...items.map((it) => getItemTarget({ id: String(it.id || ''), name: String(it.name || '') })))
      : 0
    const createdAt = order.createdAt
      ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt))
      : undefined
    return { status, createdAt, targetMin }
  }

  const detectDeliveryApp = (text: string): DeliveryApp | null => {
    const raw = text.toLowerCase()
    if (raw.includes('grab') || raw.includes('그랩')) return 'grab'
    if (raw.includes('lineman') || raw.includes('line man') || raw.includes('라인맨')) return 'lineman'
    if (raw.includes('shopee') || raw.includes('쇼피')) return 'shopee'
    return null
  }

  const detectDeliveryOrderNo = (text: string): string => {
    const hashMatch = text.match(/#\s*([A-Za-z0-9-]+)/)
    if (hashMatch?.[1]) return hashMatch[1]
    const bracketMatch = text.match(/\(([^)]+)\)/)
    if (bracketMatch?.[1]) return bracketMatch[1].trim()
    return ''
  }

  const deliveryBarItems = useMemo<OrderBarItem[]>(() => {
    const sortedOrders = [...deliveryOrders].sort((a, b) => {
      const at = new Date(a.createdAt).getTime()
      const bt = new Date(b.createdAt).getTime()
      return at - bt
    })
    const existingItems = sortedOrders.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const visual = getOrderVisual(order)
      const appId = detectDeliveryApp(label)
      const appLabel = appId ? t(deliveryApps.find((a) => a.id === appId)?.labelKey || '') : (t('posOrderTypeDelivery') || '배달')
      const no = detectDeliveryOrderNo(label)
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: visual.status,
        createdAt: visual.createdAt,
        targetMin: visual.targetMin,
        subLabel: t('posOrderStatusPreparing') || '진행 중',
        rightLabel: [appLabel, no ? `#${no}` : ''].filter(Boolean).join(' · '),
      } satisfies OrderBarItem
    })

    if (!deliveryApp) return existingItems
    const appLabel = t(deliveryApps.find((a) => a.id === deliveryApp)?.labelKey || '')
    const orderNoLabel = deliveryOrderNo.trim() ? `#${deliveryOrderNo.trim()}` : ''
    const draftLabel = [appLabel, orderNoLabel].filter(Boolean).join(' ') || (t('posOrderTypeDelivery') || '배달')
    const draftItem: OrderBarItem = {
      id: 'delivery-draft',
      label: draftLabel,
      status: null,
      subLabel: t('posSelectDeliveryApp') || '배달앱 선택',
      rightLabel: [appLabel, orderNoLabel].filter(Boolean).join(' · '),
    }
    return [draftItem, ...existingItems]
  }, [deliveryApp, deliveryOrderNo, deliveryOrders, menuTargets, t])

  const takeoutBarItems = useMemo<OrderBarItem[]>(() => {
    if (takeoutMode === 'member') {
      const typedName = takeoutMemberName.trim()
      if (typedName) {
        const matched = takeoutOrders.find((o) => String(o.customerName || '').trim() === typedName)
        const visual = matched ? getOrderVisual(matched) : { status: null as const, createdAt: undefined, targetMin: 0 }
        return [{
          id: `takeout-member-${typedName}`,
          label: typedName,
          status: visual.status,
          createdAt: visual.createdAt,
          targetMin: visual.targetMin,
          subLabel: t('posTakeoutMemberName') || '회원 이름',
          rightLabel: t('posOrderTypeTakeout') || '포장',
        }]
      }
      const names = Array.from(new Set(filteredTakeoutMembers.filter(Boolean))).slice(0, 7)
      return names.map((name) => {
        const matched = takeoutOrders.find((o) => String(o.customerName || '').trim() === name)
        const visual = matched ? getOrderVisual(matched) : { status: null as const, createdAt: undefined, targetMin: 0 }
        return {
          id: `takeout-member-${name}`,
          label: name,
          status: visual.status,
          createdAt: visual.createdAt,
          targetMin: visual.targetMin,
          subLabel: t('posTakeoutMemberName') || '회원 이름',
          rightLabel: t('posOrderTypeTakeout') || '포장',
        }
      })
    }
    return Array.from({ length: 7 }, (_, i) => i + 1).map((slotNo) => {
      const slotLabel = formatTakeoutSlotLabel(String(slotNo))
      const matched = takeoutOrders.find((o) => {
        const raw = String(o.customerName || '').trim()
        const m = raw.match(/(\d+)/)
        return m ? Number(m[1]) === slotNo : raw === slotLabel
      })
      const visual = matched ? getOrderVisual(matched) : { status: null as const, createdAt: undefined, targetMin: 0 }
      return {
        id: `takeout-slot-${slotNo}`,
        label: slotLabel,
        status: visual.status,
        createdAt: visual.createdAt,
        targetMin: visual.targetMin,
        rightLabel: slotLabel,
      }
    })
  }, [takeoutMode, takeoutMemberName, filteredTakeoutMembers, takeoutOrders, menuTargets, t])

  const handleTableSelect = (tableId: string) => {
    if (selectedTableId && selectedTableId !== tableId) {
      cartRef.current?.clearCart()
    }
    const table = currentStore?.tables.find((t) => t.id === tableId)
    if (table?.order) {
      setSelectedTableId(null)
      setServingTableId(tableId)
      return
    }
    setServingTableId(null)
    setSelectedTableId(tableId)
  }
  const handleAddItemToCart = (item: { id: string; name: string; price: number }) => {
    cartRef.current?.addItem(item)
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <POSHeader
        stores={stores}
        currentStoreId={currentStoreId}
        onStoreChange={setCurrentStoreId}
        onRefresh={refetchStores}
        todayCompleted={todayCompleted}
        totalSales={totalSales}
        showBackToAdmin={canAccessAdmin(auth?.role || '')}
        showBackButton
        canChangeStore={isOfficeRole(auth?.role || '')}
        canAccessAdmin={canAccessAdmin(auth?.role || '')}
      />
      <div className="flex-1 flex min-h-0 min-w-0">
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'tables' | 'delivery' | 'takeout')} className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="border-b border-border bg-card px-4 shrink-0">
              <div className="flex h-10 items-center justify-between gap-2">
                <TabsList className="h-10 bg-transparent">
                  <TabsTrigger value="tables" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
                    <LayoutGrid className="w-4 h-4" />
                    {t('posTableStatus')}
                  </TabsTrigger>
                  <TabsTrigger value="delivery" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
                    <Bike className="w-4 h-4" />
                    {t('posOrderTypeDelivery') || '배달'}
                  </TabsTrigger>
                  <TabsTrigger value="takeout" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
                    <Package className="w-4 h-4" />
                    {t('posOrderTypeTakeout') || '포장'}
                  </TabsTrigger>
                </TabsList>
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setLiveSearchOpen(true)}>
                  <Search className="h-3.5 w-3.5" />
                  {t('posLiveMenuSearch') || '실시간 메뉴 검색'}
                </Button>
              </div>
            </div>
            {activeTab === 'delivery' && (
              <div className="px-4 py-2 border-b border-border bg-card flex items-center gap-3 flex-wrap shrink-0">
                <span className="text-sm font-medium text-muted-foreground">{t('posSelectDeliveryApp')}</span>
                {deliveryApps.map((app) => (
                  <Button
                    key={app.id}
                    variant={deliveryApp === app.id ? 'default' : 'outline'}
                    size="sm"
                    className="h-8"
                    onClick={() => setDeliveryApp(app.id)}
                  >
                    {t(app.labelKey)}
                  </Button>
                ))}
                <span className="text-sm font-medium text-muted-foreground ml-2">{t('posDeliveryOrderNo') || '주문 번호'}</span>
                <Input
                  type="text"
                  placeholder={t('posDeliveryOrderNoPh') || '배달 플랫폼 주문번호'}
                  value={deliveryOrderNo}
                  onChange={(e) => setDeliveryOrderNo(e.target.value)}
                  className="h-8 w-40 max-w-full text-sm"
                />
              </div>
            )}
            {activeTab === 'takeout' && (
              <div className="px-4 py-2 border-b border-border bg-card flex items-center gap-2 flex-wrap shrink-0">
                <span className="text-sm font-medium text-muted-foreground">{t('posOrderTypeTakeout') || '포장'}</span>
                <Button
                  variant={takeoutMode === 'slot' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8"
                  onClick={() => setTakeoutMode('slot')}
                >
                  {t('posTakeoutSlot') || '포장 번호'}
                </Button>
                <Button
                  variant={takeoutMode === 'member' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8"
                  onClick={() => setTakeoutMode('member')}
                >
                  {t('posTakeoutMemberName') || '회원 이름'}
                </Button>
                {takeoutMode === 'slot' ? (
                  <div className="grid grid-cols-7 gap-1.5 w-full sm:w-auto sm:min-w-[34rem]">
                    {Array.from({ length: 7 }, (_, i) => i + 1).map((slotNo) => {
                      const slotLabel = formatTakeoutSlotLabel(String(slotNo))
                      return (
                      <Button
                        key={slotNo}
                        variant={takeoutSlot === String(slotNo) ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 min-w-0 px-2 text-xs"
                        onClick={() => setTakeoutSlot(String(slotNo))}
                      >
                        {slotLabel}
                      </Button>
                    )})}
                  </div>
                ) : (
                  <>
                    <Input
                      type="text"
                      placeholder={t('posTakeoutMemberNamePh') || '회원 이름 입력'}
                      value={takeoutMemberName}
                      onChange={(e) => setTakeoutMemberName(e.target.value)}
                      list="takeout-member-history"
                      className="h-8 w-48 max-w-full text-sm"
                    />
                    <datalist id="takeout-member-history">
                      {filteredTakeoutMembers.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </>
                )}
              </div>
            )}

            {/* 테이블 현황 탭: 테이블 선택 전 = 플로어 뷰, 선택 후 = 전체 메뉴 화면(대분류/카테고리/옵션) */}
            <TabsContent value="tables" className="flex-1 m-0 p-4 min-h-0 min-w-0 flex flex-col">
              {selectedTableId ? (
                <div className="flex-1 min-h-0">
                  <PosTerminalMenuScreen
                    selectedTableName={selectedTable?.name ?? selectedTableId}
                    onBack={() => setSelectedTableId(null)}
                    onAddItem={handleAddItemToCart}
                    className="h-full"
                  />
                </div>
              ) : (
                <>
                  {loadingTables && (
                    <div className="h-full flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm min-h-[320px]">
                      {t('loading')}
                    </div>
                  )}
                  {!loadingTables && currentLayout.length > 0 && (
                    <div className="h-full min-h-[320px] min-w-0">
                      <TableFloorView
                        layout={currentLayout}
                        getTableStatus={(id, name) => {
                          const tbl = currentStore?.tables.find((t) => t.id === id || t.name === name)
                          if (!tbl?.order) return null
                          const items = Array.isArray(tbl.order.items) ? tbl.order.items : []
                          const servedCount = items.filter((item) => Boolean(item.servedAt)).length
                          const status: 'preparing' | 'partial_served' | 'completed' =
                            tbl.order.status === 'completed'
                              ? 'completed'
                              : servedCount > 0
                                ? 'partial_served'
                                : 'preparing'
                          const getItemTarget = (item: { id?: string; name?: string }) => {
                            const rawId = String(item.id || '').trim()
                            const rawName = String(item.name || '').trim()
                            const normalizedId = rawId.replace(/^cart-existing-\d+-/, '')
                            const idKey = normalizedId.split('-')[0]
                            if (idKey && menuTargets.byId.has(idKey)) return menuTargets.byId.get(idKey) || 0
                            const mainName = rawName.replace(/\s*\(.+\)\s*$/, '').trim()
                            if (mainName && menuTargets.byName.has(mainName)) return menuTargets.byName.get(mainName) || 0
                            return 0
                          }
                          const targetMin = status === 'preparing'
                            ? Math.max(
                                0,
                                ...items.map((it) => getItemTarget({ id: String(it.id || ''), name: String(it.name || '') }))
                              )
                            : 0
                          const createdAt = tbl.order.createdAt
                            ? (tbl.order.createdAt instanceof Date
                                ? tbl.order.createdAt.toISOString()
                                : String(tbl.order.createdAt))
                            : undefined
                          return { status, createdAt, targetMin }
                        }}
                        selectedTableId={selectedTableId ?? servingTableId}
                        onTableSelect={handleTableSelect}
                        t={t}
                        className="h-full min-h-[320px]"
                        freshMaxMin={cookingRules.freshMaxMin}
                        warningMaxMin={cookingRules.warningMaxMin}
                        ruleMode={cookingRules.mode}
                        recipeWarningDiffMin={cookingRules.recipeWarnDiff}
                        recipeUrgentDiffMin={cookingRules.recipeUrgentDiff}
                        delayBadgeEnabled={cookingRules.delayBadgeEnabled}
                        delaySoundEnabled={cookingRules.delaySoundEnabled}
                        delayAlertOverMin={cookingRules.delayAlertOverMin}
                      />
                    </div>
                  )}
                  {!loadingTables && currentLayout.length === 0 && currentStore && (
                    <div className="h-full min-h-[280px] flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm p-4 text-center">
                      {t('posTableStatusEmpty') || '이 매장에 테이블이 없습니다. 관리자 > POS 화면 구성 > 테이블 구성에서 배치해 주세요.'}
                    </div>
                  )}
                  {!loadingTables && !currentStore && stores.length === 0 && (
                    <div className="h-full min-h-[280px] flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm">
                      {t('posTableStatusEmpty') || '매장/테이블 배치를 관리자 페이지에서 설정해 주세요.'}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* 배달 탭 */}
            <TabsContent value="delivery" className="flex-1 m-0 p-4 min-h-0 overflow-auto">
              {selectedDeliveryTargetId ? (
                <PosTerminalMenuScreen
                  selectedTableName={selectedDeliveryTargetLabel || (t('posOrderTypeDelivery') || '배달')}
                  onBack={() => setSelectedDeliveryTargetId(null)}
                  backButtonLabel="뒤로가기"
                  onAddItem={handleAddItemToCart}
                  className="h-full"
                />
              ) : (
                <OrderBarList
                  items={deliveryBarItems}
                  t={t}
                  selectedId={selectedDeliveryTargetId}
                  onSelect={(id) => {
                    const selected = deliveryBarItems.find((item) => item.id === id)
                    if (!selected) return
                    if (selectedDeliveryTargetId && selectedDeliveryTargetId !== id) {
                      cartRef.current?.clearCart()
                    }
                    setSelectedDeliveryTargetId(id)
                    setSelectedDeliveryTargetLabel(selected.label || (t('posOrderTypeDelivery') || '배달'))
                    const appId = detectDeliveryApp([selected.label, selected.rightLabel || ''].join(' '))
                    if (appId) setDeliveryApp(appId)
                    const parsedNo = detectDeliveryOrderNo([selected.label, selected.rightLabel || ''].join(' '))
                    setDeliveryOrderNo(parsedNo)
                  }}
                  freshMaxMin={cookingRules.freshMaxMin}
                  warningMaxMin={cookingRules.warningMaxMin}
                  ruleMode={cookingRules.mode}
                  recipeWarningDiffMin={cookingRules.recipeWarnDiff}
                  recipeUrgentDiffMin={cookingRules.recipeUrgentDiff}
                  delayBadgeEnabled={cookingRules.delayBadgeEnabled}
                  delayAlertOverMin={cookingRules.delayAlertOverMin}
                />
              )}
            </TabsContent>

            {/* 포장 탭 */}
            <TabsContent value="takeout" className="flex-1 m-0 p-4 min-h-0 overflow-auto">
              {selectedTakeoutTargetId ? (
                <PosTerminalMenuScreen
                  selectedTableName={`${t('posOrderTypeTakeout') || '포장'} · ${selectedTakeoutTargetLabel || takeoutLabel}`}
                  onBack={() => setSelectedTakeoutTargetId(null)}
                  backButtonLabel="뒤로가기"
                  onAddItem={handleAddItemToCart}
                  className="h-full"
                />
              ) : (
                <OrderBarList
                  items={takeoutBarItems}
                  t={t}
                  touchMode="large"
                  selectedId={selectedTakeoutTargetId}
                  onSelect={(id) => {
                    const selected = takeoutBarItems.find((item) => item.id === id)
                    if (!selected) return
                    if (selectedTakeoutTargetId && selectedTakeoutTargetId !== id) {
                      cartRef.current?.clearCart()
                    }
                    setSelectedTakeoutTargetId(id)
                    setSelectedTakeoutTargetLabel(selected.label)
                    if (takeoutMode === 'slot') {
                      const numMatch = selected.label.match(/(\d+)/)
                      if (numMatch) setTakeoutSlot(String(Number(numMatch[1])))
                    } else {
                      setTakeoutMemberName(selected.label)
                    }
                  }}
                  freshMaxMin={cookingRules.freshMaxMin}
                  warningMaxMin={cookingRules.warningMaxMin}
                  ruleMode={cookingRules.mode}
                  recipeWarningDiffMin={cookingRules.recipeWarnDiff}
                  recipeUrgentDiffMin={cookingRules.recipeUrgentDiff}
                  delayBadgeEnabled={cookingRules.delayBadgeEnabled}
                  delayAlertOverMin={cookingRules.delayAlertOverMin}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
        <div className="w-80 border-l border-border flex-shrink-0 min-h-0">
          {activeTab === 'tables' && servingTable?.order ? (
            <TableOrderPanel
              tableName={servingTable.name}
              order={servingTable.order}
              onServed={refetchStores}
              onAddOrder={() => {
                if (!servingTableId) return
                setServingTableId(null)
                setSelectedTableId(servingTableId)
              }}
              onPay={() => {
                if (!servingTableId || !servingTable?.order) return
                setPendingDineInOrderId(Number(servingTable.order.id))
                setPendingPayRequest({
                  tableName: servingTable.name,
                  items: servingTable.order.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                  })),
                })
                setServingTableId(null)
              }}
              onClose={() => setServingTableId(null)}
              t={t}
            />
          ) : (
<CartPanel
            ref={cartRef}
            stores={stores}
            currentStoreId={currentStoreId}
            selectedTable={selectedTable}
            onStoreChange={setCurrentStoreId}
            t={t}
            lockOrderType
            orderType={cartOrderType}
            deliveryApp={deliveryApp ?? undefined}
            deliveryOrderNo={deliveryOrderNo}
            takeoutLabel={takeoutLabel}
            pendingOrderId={pendingDineInOrderId}
            onOrderSubmit={async (payload) => {
              try {
                const res = await savePosOrder({
                  storeCode: currentStoreId,
                  orderType: 'dine_in',
                  tableName: payload.tableName,
                  memo: payload.memo,
                  discountAmt: payload.discountAmt,
                  discountReason: payload.discountReason,
                  memberId: payload.memberId,
                  memberNo: payload.memberNo,
                  couponCode: payload.couponCode,
                  couponDiscountAmt: payload.couponDiscountAmt,
                  pointUsed: payload.pointUsed,
                  paymentCash: 0,
                  paymentCard: 0,
                  paymentQr: 0,
                  paymentOther: 0,
                  items: payload.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity })),
                })
                if (!res.success) {
                  const msg = (res as { message?: string }).message || t('posOrderSaveFailed') || '주문 저장에 실패했습니다.'
                  alert(msg)
                  return
                }
                if (res.orderId != null) setPendingDineInOrderId(res.orderId)
                setServingTableId(null)
                setSelectedTableId(null)
                await refetchStores()
              } catch (e) {
                console.error('savePosOrder:', e)
              }
            }}
            onDineInOrderComplete={async (payload, existingOrderId) => {
              try {
                if (existingOrderId != null && payload.payment != null) {
                  await updatePosOrder({
                    id: existingOrderId,
                    items: payload.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity })),
                    tableName: payload.tableName,
                    memo: payload.memo,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    paymentCash: payload.payment.paymentCash,
                    paymentCard: payload.payment.paymentCard,
                    paymentQr: payload.payment.paymentQr,
                    paymentOther: payload.payment.paymentOther,
                  })
                } else {
                  await savePosOrder({
                    storeCode: currentStoreId,
                    orderType: 'dine_in',
                    tableName: payload.tableName,
                    memo: payload.memo,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    couponCode: payload.couponCode,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    pointUsed: payload.pointUsed,
                    items: payload.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity })),
                    paymentCash: payload.payment?.paymentCash ?? 0,
                    paymentCard: payload.payment?.paymentCard ?? 0,
                    paymentQr: payload.payment?.paymentQr ?? 0,
                    paymentOther: payload.payment?.paymentOther ?? 0,
                  })
                }
                setPendingDineInOrderId(null)
                setServingTableId(null)
                setSelectedTableId(null)
                await refetchStores()
              } catch (e) {
                console.error('savePosOrder/updatePosOrder:', e)
              }
            }}
            onNonDineOrderComplete={async (payload) => {
              try {
                const res = await savePosOrder({
                  storeCode: currentStoreId,
                  orderType: payload.orderType,
                  tableName: payload.orderLabel,
                  memo: payload.memo,
                  discountAmt: payload.discountAmt ?? 0,
                  discountReason: payload.discountReason ?? '',
                  memberId: payload.memberId,
                  memberNo: payload.memberNo,
                  couponCode: payload.couponCode,
                  couponDiscountAmt: payload.couponDiscountAmt,
                  pointUsed: payload.pointUsed,
                  items: payload.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity })),
                  paymentCash: payload.payment?.paymentCash ?? 0,
                  paymentCard: payload.payment?.paymentCard ?? 0,
                  paymentQr: payload.payment?.paymentQr ?? 0,
                  paymentOther: payload.payment?.paymentOther ?? 0,
                })
                if (!res.success) {
                  const msg = (res as { message?: string }).message || t('posOrderSaveFailed') || '주문 저장에 실패했습니다.'
                  alert(msg)
                  return
                }
                await refetchStores()
              } catch (e) {
                console.error('savePosOrder(non-dine):', e)
              }
            }}
          />
          )}
        </div>
      </div>
      <LiveMenuSearchDialog
        open={liveSearchOpen}
        onOpenChange={setLiveSearchOpen}
        storeCode={currentStoreId}
        t={t}
      />
    </div>
  )
}

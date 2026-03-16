'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { POSHeader } from '@/components/pos/pos-header'
import { TableFloorView } from '@/components/pos/table-floor-view'
import { TableOrderPanel } from '@/components/pos/table-order-panel'
import { DeliveryOrderPanel } from '@/components/pos/delivery-order-panel'
import { TakeoutOrderPanel } from '@/components/pos/takeout-order-panel'
import { OrderBarList, type OrderBarItem } from '@/components/pos/order-bar-list'
import { PosTerminalMenuScreen } from '@/components/pos/pos-terminal-menu-screen'
import { CartPanel, type CartPanelHandle } from '@/components/pos/cart-panel'
import { LiveMenuSearchDialog } from '@/components/pos/live-menu-search-dialog'
import { usePosStore } from '@/hooks/use-pos-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LayoutGrid, Bike, Package, Search } from 'lucide-react'
import { getMembers, getPosMenus, getPosPrinterSettings, getPosTodaySales, getPosDeliveryApps, updatePosOrder, updatePosOrderStatus, type PosMenu, type PosDeliveryApp } from '@/lib/api-client'
import { savePosOrderWithOffline } from '@/lib/offline'
import { OfflineBanner } from '@/components/offline-banner'
import { PosReceiptModal, type ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { canAccessAdmin, isOfficeRole } from '@/lib/permissions'
import type { Order } from '@/lib/pos-types'

/** 배달앱 코드 (API에서 동적 로드 가능) */
export type DeliveryApp = string
type TakeoutMode = 'slot' | 'member'
type PendingPayRequest = {
  tableName: string
  items: { id: string; name: string; price: number; quantity: number }[]
  /** 기존 주문 결제 시 영수증용 */
  orderNo?: string
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
    packagedDeliveryOrders,
    completedDeliveryOrders,
    takeoutOrders,
    packagedTakeoutOrders,
    completedTakeoutOrders,
    refetchStores,
    clearTableOrder,
    loadingTables,
  } = usePosStore()

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [servingTableId, setServingTableId] = useState<string | null>(null)
  const [deliveryApp, setDeliveryApp] = useState<DeliveryApp | null>(null)
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
  const [pendingTakeoutOrderId, setPendingTakeoutOrderId] = useState<number | null>(null)
  const [pendingTakeoutPayRequest, setPendingTakeoutPayRequest] = useState<PendingPayRequest>(null)
  const [pendingDeliveryOrderId, setPendingDeliveryOrderId] = useState<number | null>(null)
  const [pendingDeliveryPayRequest, setPendingDeliveryPayRequest] = useState<PendingPayRequest>(null)
  const [liveSearchOpen, setLiveSearchOpen] = useState(false)
  const [deliveryEditOrderNoOpen, setDeliveryEditOrderNoOpen] = useState(false)
  const [deliveryEditOrderNoValue, setDeliveryEditOrderNoValue] = useState('')
  const [deliveryListMode, setDeliveryListMode] = useState<'in_progress' | 'completed' | 'all'>('in_progress')
  const [takeoutListMode, setTakeoutListMode] = useState<'in_progress' | 'completed' | 'all'>('in_progress')
  const [deliveryAppsFromApi, setDeliveryAppsFromApi] = useState<PosDeliveryApp[]>([])
  const [menus, setMenus] = useState<PosMenu[]>([])
  const [receiptData, setReceiptData] = useState<ReceiptModalData | null>(null)
  /** 기존 주문 결제 시 영수증 orderNo (pendingPayRequest/pendingTakeoutPayRequest에 있던 값) */
  const [pendingReceiptOrderNo, setPendingReceiptOrderNo] = useState<string | null>(null)
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
    getPosDeliveryApps({ storeCode: currentStoreId || undefined })
      .then((list) => setDeliveryAppsFromApi(Array.isArray(list) ? list : []))
      .catch(() => setDeliveryAppsFromApi([]))
  }, [currentStoreId])

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
        const arr = Array.isArray(list) ? list : []
        setMenus(arr)
        const byId = new Map<string, number>()
        const byName = new Map<string, number>()
        arr.forEach((m: PosMenu) => {
          const min = Number(m.cookingTimeMin ?? 0)
          if (!Number.isFinite(min) || min <= 0) return
          const id = String(m.id || '').trim()
          const name = String(m.name || '').trim()
          if (id) byId.set(id, min)
          if (name) byName.set(name, min)
        })
        setMenuTargets({ byId, byName })
      })
      .catch(() => {
        setMenus([])
        setMenuTargets({ byId: new Map(), byName: new Map() })
      })
  }, [currentStoreId])

  useEffect(() => {
    if (!pendingPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openDineInPaymentFromOrder(pendingPayRequest)
    setPendingPayRequest(null)
  }, [pendingPayRequest])

  useEffect(() => {
    if (!pendingTakeoutPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openTakeoutPaymentFromOrder({
      orderLabel: pendingTakeoutPayRequest.tableName,
      items: pendingTakeoutPayRequest.items,
    })
    setPendingTakeoutPayRequest(null)
  }, [pendingTakeoutPayRequest])

  useEffect(() => {
    if (!pendingDeliveryPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openDeliveryPaymentFromOrder({
      orderLabel: pendingDeliveryPayRequest.tableName,
      items: pendingDeliveryPayRequest.items,
    })
    setPendingDeliveryPayRequest(null)
  }, [pendingDeliveryPayRequest])

  const todayCompleted = todaySales?.completedCount ?? 0
  const totalSales = todaySales?.completedTotal ?? 0
  const selectedTable = currentStore?.tables.find(tbl => tbl.id === selectedTableId)
  const servingTable = currentStore?.tables.find(tbl => tbl.id === servingTableId)
  const selectedDeliveryOrderId = selectedDeliveryTargetId?.startsWith('delivery-order-')
    ? selectedDeliveryTargetId.replace('delivery-order-', '')
    : null
  const selectedDeliveryOrder = selectedDeliveryOrderId
    ? [...deliveryOrders, ...packagedDeliveryOrders, ...completedDeliveryOrders].find((o) => String(o.id) === selectedDeliveryOrderId)
    : null
  const selectedTakeoutOrderId = selectedTakeoutTargetId?.startsWith('takeout-order-')
    ? selectedTakeoutTargetId.replace('takeout-order-', '')
    : null
  const selectedTakeoutOrder = selectedTakeoutOrderId
    ? [...takeoutOrders, ...packagedTakeoutOrders, ...completedTakeoutOrders].find((o) => String(o.id) === selectedTakeoutOrderId)
    : null
  const deliveryApps = deliveryAppsFromApi
    .filter((a) => a.enabled)
    .map((a) => ({ id: a.code, name: a.name }))
  const deliveryAppsFallback = deliveryApps.length === 0 ? [
    { id: 'grab', name: 'Grab' },
    { id: 'lineman', name: 'Line Man' },
    { id: 'shopee', name: 'Shopee' },
  ] : []
  const effectiveDeliveryApps = deliveryApps.length > 0 ? deliveryApps : deliveryAppsFallback
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
    const status: 'preparing' | 'partial_served' | 'packaged' | 'completed' =
      normalizedStatus === 'completed'
        ? 'completed'
        : normalizedStatus === 'ready'
          ? 'packaged'
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

  const detectDeliveryApp = (text: string): PosDeliveryApp | null => {
    const raw = text.toLowerCase()
    for (const app of deliveryAppsFromApi) {
      const keywords = app.matchKeywords || []
      if (keywords.some((k) => raw.includes(String(k).toLowerCase()))) return app
    }
    if (deliveryAppsFromApi.length === 0) {
      if (raw.includes('grab') || raw.includes('그랩')) return { id: 0, code: 'grab', name: 'Grab', matchKeywords: ['grab'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'lime', storeCode: null }
      if (raw.includes('lineman') || raw.includes('line man') || raw.includes('라인맨')) return { id: 0, code: 'lineman', name: 'Line Man', matchKeywords: ['lineman'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'sky', storeCode: null }
      if (raw.includes('shopee') || raw.includes('쇼피')) return { id: 0, code: 'shopee', name: 'Shopee', matchKeywords: ['shopee'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'amber', storeCode: null }
    }
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
    let orders = [...deliveryOrders]
    orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return orders.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const visual = getOrderVisual(order)
      const app = detectDeliveryApp(label)
      const appLabelEn = app ? app.name : (t('posOrderTypeDelivery') || '배달')
      const no = detectDeliveryOrderNo(label)
      const rightLabel = app ? (no ? `#${no}` : undefined) : [appLabelEn, no ? `#${no}` : ''].filter(Boolean).join(' · ')
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: visual.status,
        createdAt: visual.createdAt,
        targetMin: visual.targetMin,
        subLabel: t('posOrderStatusPreparing') || '진행 중',
        rightLabel: rightLabel || undefined,
        deliveryAppAccent: (app?.accentColor as OrderBarItem['deliveryAppAccent']) || undefined,
        deliveryAppName: app?.name,
      } satisfies OrderBarItem
    })
  }, [deliveryOrders, menuTargets, t, deliveryAppsFromApi])

  const packagedDeliveryBarItems = useMemo<OrderBarItem[]>(() => {
    let filtered = [...packagedDeliveryOrders]
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const app = detectDeliveryApp(label)
      const appLabelEn = app ? app.name : (t('posOrderTypeDelivery') || '배달')
      const no = detectDeliveryOrderNo(label)
      const rightLabel = app ? (no ? `#${no}` : undefined) : [appLabelEn, no ? `#${no}` : ''].filter(Boolean).join(' · ')
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: 'packaged' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: t('posDeliveryPackagingComplete') || '포장 완료',
        rightLabel: rightLabel || undefined,
        deliveryAppAccent: (app?.accentColor as OrderBarItem['deliveryAppAccent']) || undefined,
        deliveryAppName: app?.name,
      } satisfies OrderBarItem
    })
  }, [packagedDeliveryOrders, t, deliveryAppsFromApi])

  const completedDeliveryBarItems = useMemo<OrderBarItem[]>(() => {
    let filtered = [...completedDeliveryOrders]
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const app = detectDeliveryApp(label)
      const appLabelEn = app ? app.name : (t('posOrderTypeDelivery') || '배달')
      const no = detectDeliveryOrderNo(label)
      const rightLabel = app ? (no ? `#${no}` : undefined) : [appLabelEn, no ? `#${no}` : ''].filter(Boolean).join(' · ')
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: 'completed' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: order.orderNo || '',
        rightLabel: rightLabel || undefined,
        deliveryAppAccent: (app?.accentColor as OrderBarItem['deliveryAppAccent']) || undefined,
        deliveryAppName: app?.name,
      } satisfies OrderBarItem
    })
  }, [completedDeliveryOrders, t, deliveryAppsFromApi])

  const allDeliveryBarItems = useMemo<OrderBarItem[]>(() => {
    type Tagged = Order & { _listType?: 'in_progress' | 'packaged' | 'completed' }
    const merged: Tagged[] = [
      ...deliveryOrders.map((o) => ({ ...o, _listType: 'in_progress' as const })),
      ...packagedDeliveryOrders.map((o) => ({ ...o, _listType: 'packaged' as const })),
      ...completedDeliveryOrders.map((o) => ({ ...o, _listType: 'completed' as const })),
    ]
    let filtered = merged
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const listType = (order as Tagged)._listType
      const app = detectDeliveryApp(label)
      const appLabelEn = app ? app.name : (t('posOrderTypeDelivery') || '배달')
      const no = detectDeliveryOrderNo(label)
      const visual = getOrderVisual(order)
      const barStatus = listType === 'completed' ? 'completed' as const : listType === 'packaged' ? 'packaged' as const : visual.status
      const rightLabel = app ? (no ? `#${no}` : undefined) : [appLabelEn, no ? `#${no}` : ''].filter(Boolean).join(' · ')
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: barStatus,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: listType === 'in_progress' ? visual.targetMin : 0,
        subLabel: listType === 'completed' ? (order.orderNo || '') : listType === 'packaged' ? (t('posDeliveryPackagingComplete') || '포장 완료') : (t('posOrderStatusPreparing') || '진행 중'),
        rightLabel: rightLabel || undefined,
        deliveryAppAccent: (app?.accentColor as OrderBarItem['deliveryAppAccent']) || undefined,
        deliveryAppName: app?.name,
      } satisfies OrderBarItem
    })
  }, [deliveryOrders, packagedDeliveryOrders, completedDeliveryOrders, menuTargets, t, deliveryAppsFromApi])

  const inProgressOrPackagedDeliveryBarItems = useMemo(() => {
    const merged = [...deliveryBarItems, ...packagedDeliveryBarItems]
    merged.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()))
    return merged
  }, [deliveryBarItems, packagedDeliveryBarItems])
  const currentDeliveryBarItems = deliveryListMode === 'all' ? allDeliveryBarItems : deliveryListMode === 'completed' ? completedDeliveryBarItems : inProgressOrPackagedDeliveryBarItems

  const takeoutBarItems = useMemo<OrderBarItem[]>(() => {
    let orders = [...takeoutOrders]
    orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return orders.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeTakeout') || '포장'} #${order.id}`
      const visual = getOrderVisual(order)
      return {
        id: `takeout-order-${order.id}`,
        label,
        status: visual.status,
        createdAt: visual.createdAt,
        targetMin: visual.targetMin,
        subLabel: t('posOrderStatusPreparing') || '진행 중',
        rightLabel: label,
      } satisfies OrderBarItem
    })
  }, [takeoutOrders, menuTargets, t])

  const packagedTakeoutBarItems = useMemo<OrderBarItem[]>(() => {
    let filtered = [...packagedTakeoutOrders]
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeTakeout') || '포장'} #${order.id}`
      return {
        id: `takeout-order-${order.id}`,
        label,
        status: 'packaged' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: t('posDeliveryPackagingComplete') || '포장 완료',
        rightLabel: label,
      } satisfies OrderBarItem
    })
  }, [packagedTakeoutOrders, t])

  const completedTakeoutBarItems = useMemo<OrderBarItem[]>(() => {
    let filtered = [...completedTakeoutOrders]
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeTakeout') || '포장'} #${order.id}`
      return {
        id: `takeout-order-${order.id}`,
        label,
        status: 'completed' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: order.orderNo || '',
        rightLabel: label,
      } satisfies OrderBarItem
    })
  }, [completedTakeoutOrders, t])

  const allTakeoutBarItems = useMemo<OrderBarItem[]>(() => {
    type Tagged = Order & { _listType?: 'in_progress' | 'packaged' | 'completed' }
    const merged: Tagged[] = [
      ...takeoutOrders.map((o) => ({ ...o, _listType: 'in_progress' as const })),
      ...packagedTakeoutOrders.map((o) => ({ ...o, _listType: 'packaged' as const })),
      ...completedTakeoutOrders.map((o) => ({ ...o, _listType: 'completed' as const })),
    ]
    let filtered = merged
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeTakeout') || '포장'} #${order.id}`
      const listType = (order as Tagged)._listType
      const visual = getOrderVisual(order)
      const barStatus = listType === 'completed' ? 'completed' as const : listType === 'packaged' ? 'packaged' as const : visual.status
      return {
        id: `takeout-order-${order.id}`,
        label,
        status: barStatus,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: listType === 'in_progress' ? visual.targetMin : 0,
        subLabel: listType === 'completed' ? (order.orderNo || '') : listType === 'packaged' ? (t('posDeliveryPackagingComplete') || '포장 완료') : (t('posOrderStatusPreparing') || '진행 중'),
        rightLabel: label,
      } satisfies OrderBarItem
    })
  }, [takeoutOrders, packagedTakeoutOrders, completedTakeoutOrders, menuTargets, t])

  const inProgressOrPackagedTakeoutBarItems = useMemo(() => {
    const merged = [...takeoutBarItems, ...packagedTakeoutBarItems]
    merged.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()))
    return merged
  }, [takeoutBarItems, packagedTakeoutBarItems])
  const currentTakeoutBarItems = takeoutListMode === 'all' ? allTakeoutBarItems : takeoutListMode === 'completed' ? completedTakeoutBarItems : inProgressOrPackagedTakeoutBarItems

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
      <OfflineBanner onSyncComplete={refetchStores} />
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
                <div className="flex items-center gap-2">
                  {activeTab === 'delivery' && (
                    <Select
                      value={deliveryListMode}
                      onValueChange={(v: 'in_progress' | 'completed' | 'all') => {
                        setDeliveryListMode(v)
                        setSelectedDeliveryTargetId(null)
                      }}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress">{t('posFilterPreparing') || '준비중'}</SelectItem>
                        <SelectItem value="completed">{t('posFilterComplete') || '결재 완료'}</SelectItem>
                        <SelectItem value="all">{t('posStatusAll') || '전체'}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {activeTab === 'takeout' && (
                    <Select
                      value={takeoutListMode}
                      onValueChange={(v: 'in_progress' | 'completed' | 'all') => {
                        setTakeoutListMode(v)
                        setSelectedTakeoutTargetId(null)
                      }}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress">{t('posFilterPreparing') || '준비중'}</SelectItem>
                        <SelectItem value="completed">{t('posFilterComplete') || '결재 완료'}</SelectItem>
                        <SelectItem value="all">{t('posStatusAll') || '전체'}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setLiveSearchOpen(true)}>
                    <Search className="h-3.5 w-3.5" />
                    {t('posLiveMenuSearch') || '실시간 메뉴 검색'}
                  </Button>
                </div>
              </div>
            </div>
            {activeTab === 'delivery' && (
              <div className="px-4 py-2 border-b border-border bg-card flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-3 flex-wrap">
                {effectiveDeliveryApps.map((app) => (
                  <Button
                    key={app.id}
                    variant={deliveryApp === app.id ? 'default' : 'outline'}
                    size="sm"
                    className="h-8"
                    onClick={() => setDeliveryApp(app.id)}
                  >
                    {app.name}
                  </Button>
                ))}
                <span className="text-sm font-medium text-muted-foreground ml-2">{t('posDeliveryOrderNo') || '주문 번호'}</span>
                <Input
                  type="text"
                  placeholder={t('posDeliveryOrderNoPh') || '배달 플랫폼 주문번호'}
                  value={deliveryOrderNo}
                  onChange={(e) => setDeliveryOrderNo(e.target.value)}
                  className="h-8 w-32 max-w-full text-sm"
                />
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    if (!deliveryApp) return
                    setDeliveryOrderNo('')
                    setSelectedDeliveryTargetId('delivery-draft')
                    const appLabelEn = effectiveDeliveryApps.find((a) => a.id === deliveryApp)?.name ?? deliveryApp
                    setSelectedDeliveryTargetLabel(appLabelEn)
                  }}
                  disabled={!deliveryApp}
                >
                  + {t('posNewOrder') || '새 주문'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    if (selectedDeliveryOrder) {
                      const label = String(selectedDeliveryOrder.customerName || '').trim() || ''
                      const appId = detectDeliveryApp(label)
                      const no = detectDeliveryOrderNo(label)
                      setDeliveryEditOrderNoValue(no)
                      setDeliveryEditOrderNoOpen(true)
                    }
                  }}
                  disabled={!selectedDeliveryOrder}
                >
                  {t('posEditOrderNo') || '수정'}
                </Button>
                </div>
              </div>
            )}
            {activeTab === 'takeout' && (
              <div className="px-4 py-2 border-b border-border bg-card flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-3 flex-wrap">
                  {Array.from({ length: 7 }, (_, i) => i + 1).map((slotNo) => (
                    <Button
                      key={slotNo}
                      variant={takeoutMode === 'slot' && takeoutSlot === String(slotNo) ? 'default' : 'outline'}
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setTakeoutMode('slot')
                        setTakeoutSlot(String(slotNo))
                      }}
                    >
                      {formatTakeoutSlotLabel(String(slotNo))}
                    </Button>
                  ))}
                  <span className="text-sm font-medium text-muted-foreground ml-2">{t('posTakeoutMemberName') || '회원 이름'}</span>
                  <Input
                    type="text"
                    placeholder={t('posTakeoutMemberNamePh') || '회원 이름 입력'}
                    value={takeoutMemberName}
                    onChange={(e) => {
                      const v = e.target.value
                      setTakeoutMemberName(v)
                      setTakeoutMode(v.trim() ? 'member' : 'slot')
                    }}
                    onFocus={() => takeoutMemberName.trim() && setTakeoutMode('member')}
                    list="takeout-member-history"
                    className="h-8 w-32 max-w-full text-sm"
                  />
                  <datalist id="takeout-member-history">
                    {filteredTakeoutMembers.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      setSelectedTakeoutTargetId('takeout-draft')
                      setSelectedTakeoutTargetLabel(baseTakeoutLabel)
                    }}
                  >
                    + {t('posNewOrder') || '새 주문'}
                  </Button>
                </div>
              </div>
            )}

            {/* 테이블 현황 탭: 테이블 선택 전 = 플로어 뷰, 선택 후 = 전체 메뉴 화면(대분류/카테고리/옵션) */}
            <TabsContent value="tables" className="flex-1 m-0 p-4 min-h-0 min-w-0 flex flex-col">
              {selectedTableId ? (
                <div className="flex-1 min-h-0">
                  <PosTerminalMenuScreen
                    mode="pos-order"
                    storeCode={currentStoreId}
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
                            (tbl.order.status === 'completed' || tbl.order.status === 'ready')
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

            {/* 배달 탭: 새 주문(draft)일 때만 메뉴 화면, 기존 주문 선택 시 목록 유지 */}
            <TabsContent value="delivery" className="flex-1 m-0 p-4 min-h-0 overflow-auto min-h-[640px]">
              {selectedDeliveryTargetId === 'delivery-draft' ? (
                <PosTerminalMenuScreen
                  mode="pos-order"
                  storeCode={currentStoreId}
                  selectedTableName={selectedDeliveryTargetLabel || (t('posOrderTypeDelivery') || '배달')}
                  onBack={() => setSelectedDeliveryTargetId(null)}
                  backButtonLabel={t('posBack') || '뒤로가기'}
                  onAddItem={handleAddItemToCart}
                  className="h-full"
                />
              ) : (
                <OrderBarList
                  items={currentDeliveryBarItems}
                  className="min-h-[600px]"
                  t={t}
                  usePackagingLabel
                  selectedId={selectedDeliveryTargetId}
                  onSelect={(id) => {
                    const selected = currentDeliveryBarItems.find((item) => item.id === id)
                    if (!selected) return
                    if (selectedDeliveryTargetId && selectedDeliveryTargetId !== id) {
                      cartRef.current?.clearCart()
                    }
                    setSelectedDeliveryTargetId(id)
                    setSelectedDeliveryTargetLabel(selected.label || (t('posOrderTypeDelivery') || '배달'))
                    const app = detectDeliveryApp([selected.label, selected.rightLabel || ''].join(' '))
                    if (app) setDeliveryApp(app.code)
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

            {/* 포장 탭 (배달과 동일 높이: 8개 주문 표시) */}
            <TabsContent value="takeout" className="flex-1 m-0 p-4 min-h-0 overflow-auto min-h-[640px]">
              {selectedTakeoutTargetId === 'takeout-draft' ? (
                <PosTerminalMenuScreen
                  mode="pos-order"
                  storeCode={currentStoreId}
                  selectedTableName={`${t('posOrderTypeTakeout') || '포장'} · ${selectedTakeoutTargetLabel || takeoutLabel}`}
                  onBack={() => setSelectedTakeoutTargetId(null)}
                  backButtonLabel={t('posBack') || '뒤로가기'}
                  onAddItem={handleAddItemToCart}
                  className="h-full"
                />
              ) : (
                <OrderBarList
                  items={currentTakeoutBarItems}
                  className="min-h-[600px]"
                  t={t}
                  usePackagingLabel
                  selectedId={selectedTakeoutTargetId}
                  onSelect={(id) => {
                    const selected = currentTakeoutBarItems.find((item) => item.id === id)
                    if (!selected) return
                    if (selectedTakeoutTargetId && selectedTakeoutTargetId !== id) {
                      cartRef.current?.clearCart()
                    }
                    setSelectedTakeoutTargetId(id)
                    setSelectedTakeoutTargetLabel(selected.label)
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
          {activeTab === 'delivery' && selectedDeliveryOrder ? (
            <DeliveryOrderPanel
              orderLabel={selectedDeliveryTargetLabel || selectedDeliveryOrder.customerName || String(selectedDeliveryOrder.id)}
              deliveryApps={deliveryAppsFromApi}
              order={selectedDeliveryOrder}
              onPackaged={refetchStores}
              onCancel={refetchStores}
              onPay={() => {
                if (!selectedDeliveryOrder) return
                setPendingDeliveryOrderId(Number(selectedDeliveryOrder.id))
                setPendingReceiptOrderNo(selectedDeliveryOrder.orderNo ?? null)
                setPendingDeliveryPayRequest({
                  tableName: selectedDeliveryTargetLabel || selectedDeliveryOrder.customerName || String(selectedDeliveryOrder.id),
                  items: selectedDeliveryOrder.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                  })),
                  orderNo: selectedDeliveryOrder.orderNo,
                })
                setSelectedDeliveryTargetId(null)
                setSelectedDeliveryTargetLabel('')
                setDeliveryApp(null)
                setDeliveryOrderNo('')
              }}
              onClose={() => {
                setSelectedDeliveryTargetId(null)
                setSelectedDeliveryTargetLabel('')
                setDeliveryApp(null)
                setDeliveryOrderNo('')
              }}
              t={t}
            />
          ) : activeTab === 'tables' && servingTable?.order ? (
            <TableOrderPanel
              tableName={servingTable.name}
              order={servingTable.order}
              deliveryApps={deliveryAppsFromApi}
              onServed={refetchStores}
              onAddOrder={() => {
                if (!servingTableId) return
                setServingTableId(null)
                setSelectedTableId(servingTableId)
              }}
              onPay={() => {
                if (!servingTableId || !servingTable?.order) return
                setPendingDineInOrderId(Number(servingTable.order.id))
                setPendingReceiptOrderNo(servingTable.order.orderNo ?? null)
                setPendingPayRequest({
                  tableName: servingTable.name,
                  items: servingTable.order.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                  })),
                  orderNo: servingTable.order.orderNo,
                })
                setServingTableId(null)
              }}
              onLeaveTable={async () => {
                if (!servingTable?.order || !servingTable?.name) return
                clearTableOrder(currentStoreId, servingTable.name)
                setServingTableId(null)
                await refetchStores()
              }}
              onCancel={refetchStores}
              onClose={() => setServingTableId(null)}
              t={t}
            />
          ) : activeTab === 'takeout' && selectedTakeoutOrder ? (
            <TakeoutOrderPanel
              orderLabel={selectedTakeoutTargetLabel || selectedTakeoutOrder.customerName || String(selectedTakeoutOrder.id)}
              order={selectedTakeoutOrder}
              onPackaged={refetchStores}
              onCancel={refetchStores}
              onPay={() => {
                if (!selectedTakeoutOrder) return
                setPendingTakeoutOrderId(Number(selectedTakeoutOrder.id))
                setPendingReceiptOrderNo(selectedTakeoutOrder.orderNo ?? null)
                setPendingTakeoutPayRequest({
                  tableName: selectedTakeoutTargetLabel || selectedTakeoutOrder.customerName || String(selectedTakeoutOrder.id),
                  items: selectedTakeoutOrder.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                  })),
                  orderNo: selectedTakeoutOrder.orderNo,
                })
                setSelectedTakeoutTargetId(null)
                setSelectedTakeoutTargetLabel('')
              }}
              onClose={() => {
                setSelectedTakeoutTargetId(null)
                setSelectedTakeoutTargetLabel('')
              }}
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
            deliveryAppName={effectiveDeliveryApps.find((a) => a.id === deliveryApp)?.name}
            deliveryOrderNo={deliveryOrderNo}
            takeoutLabel={takeoutLabel}
            pendingOrderId={activeTab === 'tables' ? pendingDineInOrderId : activeTab === 'takeout' ? pendingTakeoutOrderId : activeTab === 'delivery' ? pendingDeliveryOrderId : null}
            onDeliveryOrderComplete={async (payload, existingOrderId) => {
              try {
                if (existingOrderId != null && payload.payment != null) {
                  await updatePosOrder({
                    id: existingOrderId,
                    items: payload.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity })),
                    tableName: payload.orderLabel,
                    memo: payload.memo ?? '',
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
                  await updatePosOrderStatus({ id: existingOrderId, status: 'completed' })
                }
                const subtotal = payload.items.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const total = Math.max(0, subtotal - discountAmt)
                setReceiptData({
                  orderNo: pendingReceiptOrderNo ?? '',
                  items: payload.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity || 1 })),
                  subtotal,
                  discountAmt,
                  total,
                  storeCode: currentStoreId,
                  orderType: 'delivery',
                  tableName: payload.orderLabel,
                  memo: payload.memo,
                  discountReason: payload.discountReason,
                })
                setPendingReceiptOrderNo(null)
                setPendingDeliveryOrderId(null)
                setSelectedDeliveryTargetId(null)
                setSelectedDeliveryTargetLabel('')
                setDeliveryApp(null)
                setDeliveryOrderNo('')
                await refetchStores()
              } catch (e) {
                console.error('updatePosOrder/updatePosOrderStatus:', e)
              }
            }}
            onTakeoutOrderComplete={async (payload, existingOrderId) => {
              try {
                if (existingOrderId != null && payload.payment != null) {
                  await updatePosOrder({
                    id: existingOrderId,
                    items: payload.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity })),
                    tableName: payload.orderLabel,
                    memo: payload.memo ?? '',
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
                  await updatePosOrderStatus({ id: existingOrderId, status: 'completed' })
                }
                const subtotal = payload.items.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const total = Math.max(0, subtotal - discountAmt)
                setReceiptData({
                  orderNo: pendingReceiptOrderNo ?? '',
                  items: payload.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity || 1 })),
                  subtotal,
                  discountAmt,
                  total,
                  storeCode: currentStoreId,
                  orderType: 'takeout',
                  tableName: payload.orderLabel,
                  memo: payload.memo,
                  discountReason: payload.discountReason,
                })
                setPendingReceiptOrderNo(null)
                setPendingTakeoutOrderId(null)
                setSelectedTakeoutTargetId(null)
                setSelectedTakeoutTargetLabel('')
                await refetchStores()
              } catch (e) {
                console.error('updatePosOrder/updatePosOrderStatus:', e)
              }
            }}
            onOrderSubmit={async (payload) => {
              try {
                const res = await savePosOrderWithOffline({
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
                let orderIdToComplete: number | null = null
                let orderNo: string = ''
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
                  orderIdToComplete = existingOrderId
                  orderNo = pendingReceiptOrderNo ?? ''
                } else {
                  const res = await savePosOrderWithOffline({
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
                  orderIdToComplete = (res as { orderId?: number }).orderId ?? null
                  orderNo = (res as { orderNo?: string }).orderNo ?? ''
                }
                if (orderIdToComplete != null) {
                  const targetStatus = payload.isPrepaid ? 'paid' : 'completed'
                  await updatePosOrderStatus({ id: orderIdToComplete, status: targetStatus })
                  if (!payload.isPrepaid && payload.tableName) {
                    clearTableOrder(currentStoreId, payload.tableName)
                  }
                }
                const subtotal = payload.items.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const total = Math.max(0, subtotal - discountAmt)
                setReceiptData({
                  orderNo,
                  items: payload.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity || 1 })),
                  subtotal,
                  discountAmt,
                  total,
                  storeCode: currentStoreId,
                  orderType: 'dine_in',
                  tableName: payload.tableName,
                  memo: payload.memo,
                  discountReason: payload.discountReason,
                })
                setPendingReceiptOrderNo(null)
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
                const res = await savePosOrderWithOffline({
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
                const orderNo = (res as { orderNo?: string }).orderNo ?? ''
                const subtotal = payload.items.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const total = Math.max(0, subtotal - discountAmt)
                setReceiptData({
                  orderNo,
                  items: payload.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity || 1 })),
                  subtotal,
                  discountAmt,
                  total,
                  storeCode: currentStoreId,
                  orderType: payload.orderType,
                  tableName: payload.orderLabel,
                  memo: payload.memo,
                  discountReason: payload.discountReason,
                })
                if (payload.orderType === 'delivery') {
                  setSelectedDeliveryTargetId(null)
                  setSelectedDeliveryTargetLabel('')
                  setDeliveryApp(null)
                  setDeliveryOrderNo('')
                } else if (payload.orderType === 'takeout') {
                  setSelectedTakeoutTargetId(null)
                  setSelectedTakeoutTargetLabel('')
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
      <PosReceiptModal
        open={!!receiptData}
        onOpenChange={(open) => !open && setReceiptData(null)}
        receiptData={receiptData}
        menus={menus}
        orderTypeLabels={{
          dine_in: t('posOrderTypeDineIn') ?? '매장',
          takeout: t('posOrderTypeTakeout') ?? '포장',
          delivery: t('posOrderTypeDelivery') ?? '배달',
        }}
        t={t}
      />
      <Dialog open={deliveryEditOrderNoOpen} onOpenChange={setDeliveryEditOrderNoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('posEditOrderNoDialogTitle') || '주문번호 수정'}</DialogTitle>
          </DialogHeader>
          {selectedDeliveryOrder && (() => {
            const label = String(selectedDeliveryOrder.customerName || '').trim() || ''
            const app = detectDeliveryApp(label)
            const appLabelEn = app ? app.name : (t('posOrderTypeDelivery') || '배달')
            return (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground shrink-0">{appLabelEn}</span>
                  <span className="text-muted-foreground">#</span>
                  <Input
                    type="text"
                    placeholder={t('posDeliveryOrderNoPh') || '주문번호'}
                    value={deliveryEditOrderNoValue}
                    onChange={(e) => setDeliveryEditOrderNoValue(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeliveryEditOrderNoOpen(false)}>
                    {t('cancel') || '취소'}
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!selectedDeliveryOrder) return
                      const newTableName = [appLabelEn, deliveryEditOrderNoValue.trim() ? `#${deliveryEditOrderNoValue.trim()}` : ''].filter(Boolean).join(' ')
                      try {
                        const res = await updatePosOrder({
                          id: Number(selectedDeliveryOrder.id),
                          items: selectedDeliveryOrder.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity || 1 })),
                          tableName: newTableName || appLabelEn,
                          memo: selectedDeliveryOrder.memo,
                        })
                        if (!(res as { success?: boolean }).success) {
                          alert((res as { message?: string }).message || (t('posOrderSaveFailed') || '저장에 실패했습니다.'))
                          return
                        }
                        setSelectedDeliveryTargetLabel(newTableName || appLabelEn)
                        setDeliveryEditOrderNoOpen(false)
                        await refetchStores()
                      } catch (e) {
                        alert(String(e))
                      }
                    }}
                  >
                    {t('posSave') || '저장'}
                  </Button>
                </DialogFooter>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

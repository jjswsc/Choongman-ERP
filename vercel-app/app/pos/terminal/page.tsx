'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { POSHeader } from '@/components/pos/pos-header'
import { TableFloorView } from '@/components/pos/table-floor-view'
import { TableOrderPanel } from '@/components/pos/table-order-panel'
import { PosTerminalMenuScreen } from '@/components/pos/pos-terminal-menu-screen'
import { OrderList } from '@/components/pos/order-list'
import { CartPanel, type CartPanelHandle } from '@/components/pos/cart-panel'
import { usePosStore } from '@/hooks/use-pos-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LayoutGrid, Bike, Package } from 'lucide-react'
import { getPosTodaySales, savePosOrder, updatePosOrder } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { canAccessAdmin, isOfficeRole } from '@/lib/permissions'
import { cn } from '@/lib/utils'

export type DeliveryApp = 'grab' | 'lineman' | 'shopee'
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
    updateOrderStatus,
    refetchStores,
    loadingTables,
  } = usePosStore()

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [servingTableId, setServingTableId] = useState<string | null>(null)
  const [deliveryApp, setDeliveryApp] = useState<DeliveryApp | null>(orderType === 'delivery' ? null : null)
  const [deliveryOrderNo, setDeliveryOrderNo] = useState('')
  const [activeTab, setActiveTab] = useState<'tables' | 'delivery' | 'takeout'>('tables')
  const [pendingDineInOrderId, setPendingDineInOrderId] = useState<number | null>(null)
  const [pendingPayRequest, setPendingPayRequest] = useState<PendingPayRequest>(null)
  const [todaySales, setTodaySales] = useState<{
    completedCount: number
    completedTotal: number
  } | null>(null)

  useEffect(() => {
    if (orderType !== 'delivery') setDeliveryApp(null)
  }, [orderType])

  useEffect(() => {
    const storeCode = auth?.store
    if (!storeCode) return
    getPosTodaySales({ storeCode })
      .then(s => setTodaySales({ completedCount: s.completedCount, completedTotal: s.completedTotal }))
      .catch(() => setTodaySales(null))
  }, [auth?.store])

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

  const handleTableSelect = (tableId: string) => {
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

  const deliveryApps: { id: DeliveryApp; labelKey: string }[] = [
    { id: 'grab', labelKey: 'posDeliveryAppGrab' },
    { id: 'lineman', labelKey: 'posDeliveryAppLineMan' },
    { id: 'shopee', labelKey: 'posDeliveryAppShopee' },
  ]

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
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'tables' | 'delivery' | 'takeout')} className="flex-1 flex flex-col min-h-0">
            {orderType === 'delivery' && activeTab === 'delivery' && (
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
            <div className="border-b border-border bg-card px-4 shrink-0">
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
            </div>

            {/* 테이블 현황 탭: 테이블 선택 전 = 플로어 뷰, 선택 후 = 전체 메뉴 화면(대분류/카테고리/옵션) */}
            <TabsContent value="tables" className="flex-1 m-0 p-4 min-h-0 flex flex-col">
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
                    <TableFloorView
                      layout={currentLayout}
                      getTableStatus={(id, name) => {
                        const tbl = currentStore?.tables.find((t) => t.id === id || t.name === name)
                        if (!tbl?.order) return null
                        const status = tbl.order.status === 'completed' ? 'completed' : 'preparing'
                        const createdAt = tbl.order.createdAt
                          ? (tbl.order.createdAt instanceof Date
                              ? tbl.order.createdAt.toISOString()
                              : String(tbl.order.createdAt))
                          : undefined
                        return { status, createdAt }
                      }}
                      selectedTableId={selectedTableId ?? servingTableId}
                      onTableSelect={handleTableSelect}
                      t={t}
                      className="h-full min-h-[320px]"
                    />
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
              <OrderList
                deliveryOrders={deliveryOrders}
                takeoutOrders={takeoutOrders}
                mode="delivery"
                onStatusUpdate={updateOrderStatus}
                t={t}
              />
            </TabsContent>

            {/* 포장 탭 */}
            <TabsContent value="takeout" className="flex-1 m-0 p-4 min-h-0 overflow-auto">
              <OrderList
                deliveryOrders={deliveryOrders}
                takeoutOrders={takeoutOrders}
                mode="takeout"
                onStatusUpdate={updateOrderStatus}
                t={t}
              />
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
            orderType={orderType}
            deliveryApp={deliveryApp ?? undefined}
            deliveryOrderNo={deliveryOrderNo}
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
                  paymentCash: 0,
                  paymentCard: 0,
                  paymentQr: 0,
                  paymentOther: 0,
                  items: payload.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity })),
                })
                if (!res.success) {
                  const msg = (res as { message?: string }).message || '주문 저장에 실패했습니다.'
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
          />
          )}
        </div>
      </div>
    </div>
  )
}

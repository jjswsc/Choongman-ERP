'use client'

import { useState, forwardRef, useImperativeHandle } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { ShoppingCart, Trash2, Tag, Minus, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import type { Store, Table, OrderItem } from '@/lib/pos-types'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

export type CartOrderType = 'dine-in' | 'delivery' | 'takeout'
export type CartDeliveryApp = 'grab' | 'lineman' | 'shopee'

export interface CartPanelHandle {
  addItem: (item: { id: string; name: string; price: number }) => void
  clearCart: () => void
  openDineInPaymentFromOrder: (payload: {
    tableName: string
    items: { id: string; name: string; price: number; quantity: number }[]
  }) => void
}

interface CartPanelProps {
  stores: Store[]
  currentStoreId: string
  selectedTable?: Table | null
  onStoreChange: (storeId: string) => void
  t?: (k: string) => string
  /** 터미널에서 진입 시 주문 타입 고정 (타입 선택 UI 숨김) */
  lockOrderType?: boolean
  orderType?: CartOrderType
  deliveryApp?: CartDeliveryApp
  /** 배달 주문 번호 (플랫폼 주문 ID, API 연동 전까지 수동 입력) */
  deliveryOrderNo?: string
  /** 홀 주문 전송 (주방 전달) - 부모에서 savePosOrder 호출 후 pendingOrderId 전달 */
  onOrderSubmit?: (payload: { items: { id: string; name: string; price: number; quantity: number }[]; tableName: string; memo?: string; discountAmt: number; discountReason: string }) => void
  /** 홀 주문 결제 완료 시. existingOrderId 있으면 해당 주문에 결제만 반영(updatePosOrder) */
  onDineInOrderComplete?: (payload: { items: { id: string; name: string; price: number; quantity: number }[]; tableName: string; memo?: string; discountAmt?: number; discountReason?: string; payment?: Record<string, number> }, existingOrderId?: number) => void
  /** 주문 버튼으로 이미 전송된 주문 ID (결제 시 해당 주문에 결제 반영용) */
  pendingOrderId?: number | null
}

interface CartItem extends OrderItem {
  note?: string
}

export const CartPanel = forwardRef<CartPanelHandle, CartPanelProps>(function CartPanel({
  stores,
  currentStoreId,
  selectedTable,
  onStoreChange,
  t: tProp,
  lockOrderType,
  orderType: orderTypeProp,
  deliveryApp: deliveryAppProp,
  deliveryOrderNo: deliveryOrderNoProp,
  onOrderSubmit,
  onDineInOrderComplete,
  pendingOrderId,
}, ref) {
  const { lang } = useLang()
  const tDefault = useT(lang)
  const t = tProp ?? tDefault
  const [orderTypeInternal, setOrderTypeInternal] = useState<CartOrderType>('dine-in')
  const orderType = lockOrderType && orderTypeProp != null ? orderTypeProp : orderTypeInternal
  const canSubmit =
    !lockOrderType ||
    (orderType === 'dine-in' ? !!selectedTable : orderType === 'delivery' ? !!deliveryAppProp : true)
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [takeoutSlot, setTakeoutSlot] = useState<string>('1')
  const [takeoutMemberName, setTakeoutMemberName] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [memberOptions] = useState<{ value: string; label: string }[]>([]) // TODO: 연동 시 회원 목록 API
  const [guestCount, setGuestCount] = useState(1)
  const [guestDirectOpen, setGuestDirectOpen] = useState(false)
  const [guestDirectValue, setGuestDirectValue] = useState('10')
  const [customerMemo, setCustomerMemo] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [discountValue, setDiscountValue] = useState(0)
  const [discountReason, setDiscountReason] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [payCash, setPayCash] = useState('')
  const [payCard, setPayCard] = useState('')
  const [payTrueMoney, setPayTrueMoney] = useState('')
  const [payWeChat, setPayWeChat] = useState('')
  const [payAlipay, setPayAlipay] = useState('')
  const [payPromptPay, setPayPromptPay] = useState('')
  const [payLinePay, setPayLinePay] = useState('')
  const [payShopeePay, setPayShopeePay] = useState('')
  const [payOther, setPayOther] = useState('')
  const [showOtherPayments, setShowOtherPayments] = useState(true)
  const [menuNameTooltipOpen, setMenuNameTooltipOpen] = useState<string | null>(null)
  const [paymentTableNameOverride, setPaymentTableNameOverride] = useState<string | null>(null)

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const discount = discountType === 'percent'
    ? Math.floor((subtotal * discountValue) / 100)
    : discountValue
  const total = subtotal - discount

  const confirmGuestDirect = () => {
    const v = parseInt(guestDirectValue, 10)
    if (!Number.isNaN(v)) setGuestCount(Math.max(1, Math.min(99, v)))
    setGuestDirectOpen(false)
  }

  const openPaymentModalWithAmount = (amount: number) => {
    if (amount <= 0) return
    setPayCash(String(amount))
    setPayCard('0')
    setPayTrueMoney('0')
    setPayWeChat('0')
    setPayAlipay('0')
    setPayPromptPay('0')
    setPayLinePay('0')
    setPayShopeePay('0')
    setPayOther('0')
    setShowPaymentModal(true)
  }
  const openPaymentModal = () => openPaymentModalWithAmount(total)

  const paymentSum =
    (parseFloat(payCash) || 0) +
    (parseFloat(payCard) || 0) +
    (parseFloat(payTrueMoney) || 0) +
    (parseFloat(payWeChat) || 0) +
    (parseFloat(payAlipay) || 0) +
    (parseFloat(payPromptPay) || 0) +
    (parseFloat(payLinePay) || 0) +
    (parseFloat(payShopeePay) || 0) +
    (parseFloat(payOther) || 0)
  const paymentSumMatch = Math.abs(paymentSum - total) < 0.01

  const addItem = (item: { id: string; name: string; price: number }) => {
    const lineId = `cart-${Date.now()}-${item.id}`
    setCartItems(prev => {
      const existing = prev.find(p => p.name === item.name && p.price === item.price)
      if (existing) {
        return prev.map(p => p.id === existing.id ? { ...p, quantity: p.quantity + 1 } : p)
      }
      return [...prev, { ...item, id: lineId, quantity: 1 }]
    })
  }

  const openDineInPaymentFromOrder = (payload: {
    tableName: string
    items: { id: string; name: string; price: number; quantity: number }[]
  }) => {
    const normalized = payload.items.map((i, idx) => ({
      id: `cart-existing-${idx}-${i.id}`,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    }))
    setDiscountType('percent')
    setDiscountValue(0)
    setDiscountReason('')
    setPaymentTableNameOverride(payload.tableName)
    setCartItems(normalized)
    const amount = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0)
    openPaymentModalWithAmount(amount)
  }

  useImperativeHandle(ref, () => ({ addItem, clearCart: handleClearCart, openDineInPaymentFromOrder }), [])

  const handleClearCart = () => {
    setCartItems([])
    setCustomerMemo('')
    setCouponCode('')
    setDiscountValue(0)
    setDiscountReason('')
    setPaymentTableNameOverride(null)
  }

  const updateItemQuantity = (itemId: string, delta: number) => {
    setCartItems(prev =>
      prev
        .map(item => {
          if (item.id === itemId) {
            const newQty = Math.max(0, item.quantity + delta)
            return newQty === 0 ? null : { ...item, quantity: newQty }
          }
          return item
        })
        .filter((item): item is CartItem => item != null)
    )
  }

  return (
    <>
    <Card className="h-full flex flex-col min-w-0 overflow-hidden">
      <CardHeader className="py-2.5 px-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2 flex-wrap">
            <ShoppingCart className="w-4 h-4" />
            {t('posCart')}
            {orderType && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold shrink-0 ring-1 ring-black/10 dark:ring-white/20',
                  orderType === 'dine-in' && 'bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-50',
                  orderType === 'delivery' && 'bg-emerald-500 text-white dark:bg-emerald-600 dark:text-emerald-50',
                  orderType === 'takeout' && 'bg-amber-500 text-white dark:bg-amber-600 dark:text-amber-50'
                )}
              >
                <span
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    orderType === 'dine-in' && 'bg-blue-200 dark:bg-blue-300',
                    orderType === 'delivery' && 'bg-emerald-200 dark:bg-emerald-300',
                    orderType === 'takeout' && 'bg-amber-200 dark:bg-amber-300'
                  )}
                />
                {orderType === 'dine-in' ? t('posOrderTypeDineIn') : orderType === 'delivery' ? t('posOrderTypeDelivery') : t('posOrderTypeTakeout')}
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={handleClearCart}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            {t('posClearCart')}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col py-3 gap-3 min-h-0 overflow-hidden px-0">
        {/* 주문 타입 & 테이블 & 회원 (터미널에서는 유형/테이블/배달앱을 장바구니 옆 상단에 표시하므로 lockOrderType일 때는 생략) */}
        <div className="space-y-2 shrink-0 px-3">
          {!lockOrderType && (
            <div className="flex items-center gap-2">
              <Label className="text-sm w-12 flex-shrink-0">{t('posOrderTypeLabel')}</Label>
              <div className="flex gap-1">
                {[
                  { value: 'dine-in' as const, labelKey: 'posOrderTypeDineIn' },
                  { value: 'delivery' as const, labelKey: 'posOrderTypeDelivery' },
                  { value: 'takeout' as const, labelKey: 'posOrderTypeTakeout' }
                ].map(type => (
                  <Button
                    key={type.value}
                    variant={orderType === type.value ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setOrderTypeInternal(type.value)}
                  >
                    {t(type.labelKey)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {!lockOrderType && orderType === 'dine-in' && (
            <div className="flex items-center gap-2">
              <Label className="text-sm w-12 flex-shrink-0">{t('posTableLabel')}</Label>
              <Badge variant="secondary" className="h-7 px-3">
                {selectedTable?.name || t('posSelectTableNone')}
              </Badge>
            </div>
          )}
          {!lockOrderType && orderType === 'delivery' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm flex-shrink-0">{t('posDeliveryApp')}</Label>
                <Badge variant="secondary" className="h-7 px-3">
                  {deliveryAppProp === 'grab' ? t('posDeliveryAppGrab') : deliveryAppProp === 'lineman' ? t('posDeliveryAppLineMan') : deliveryAppProp === 'shopee' ? t('posDeliveryAppShopee') : t('posSelectDeliveryApp')}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm flex-shrink-0">{t('posDeliveryOrderNo') || '주문 번호'}</Label>
                <span className="text-sm text-muted-foreground min-w-0 truncate max-w-[8rem]">
                  {deliveryOrderNoProp || '—'}
                </span>
              </div>
            </div>
          )}
          {!lockOrderType && orderType === 'takeout' && (
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-sm flex-shrink-0">{t('posTakeoutSlot') || '포장'}</Label>
              <Select
                value={takeoutSlot}
                onValueChange={(v) => setTakeoutSlot(v)}
              >
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {(t('posTakeoutSlotN') || '포장 {{n}}').replace('{{n}}', String(n))}
                    </SelectItem>
                  ))}
                  <SelectItem value="__member__">{t('posTakeoutMemberName') || '회원 이름'}</SelectItem>
                </SelectContent>
              </Select>
              {takeoutSlot === '__member__' && (
                <Input
                  placeholder={t('posTakeoutMemberNamePh') || '회원 이름 입력'}
                  value={takeoutMemberName}
                  onChange={(e) => setTakeoutMemberName(e.target.value)}
                  className="h-8 flex-1 min-w-0 max-w-[10rem] text-sm"
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Label className="text-sm w-12 flex-shrink-0">{t('posMember') || '회원'}</Label>
              <Select
                value={selectedMemberId === '' ? '__none__' : selectedMemberId}
                onValueChange={(v) => setSelectedMemberId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger className="flex-1 min-w-0 h-8">
                  <SelectValue placeholder={t('posMemberNone') || '비회원'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('posMemberNone') || '비회원'}</SelectItem>
                  {memberOptions.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm flex-shrink-0">{t('posGuestCount') || '손님'}</Label>
              <Select
                value={guestCount >= 1 && guestCount <= 9 ? String(guestCount) : '__direct__'}
                onValueChange={(v) => {
                  if (v === '__direct__') {
                    setGuestDirectValue(String(guestCount > 9 ? guestCount : 10))
                    setGuestDirectOpen(true)
                  } else {
                    setGuestCount(Number(v))
                  }
                }}
              >
                <SelectTrigger className="w-14 h-8 [&>span]:flex [&>span]:items-center [&>span]:justify-center">
                  <span className="tabular-nums">{guestCount}</span>
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                  <SelectItem value="__direct__">{t('posGuestDirectInput') || '직접 입력'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Dialog open={guestDirectOpen} onOpenChange={setGuestDirectOpen}>
              <DialogContent className="sm:max-w-xs">
                <DialogHeader>
                  <DialogTitle>{t('posGuestCount') || '손님'} · {t('posGuestDirectInput') || '직접 입력'}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-2 py-2">
                  <Label className="text-sm text-muted-foreground">{t('posGuestDirectInput') || '몇 명?'}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    className="tabular-nums"
                    value={guestDirectValue}
                    onChange={(e) => setGuestDirectValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), confirmGuestDirect())}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setGuestDirectOpen(false)}>
                    {t('posCancel') ?? t('cancel') ?? '취소'}
                  </Button>
                  <Button size="sm" onClick={confirmGuestDirect}>
                    {t('posConfirm') || '확인'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Cart Items - 메뉴 리스트 영역 최대 확보 (좌우 여백 없이 끝까지 사용) */}
        <ScrollArea className="flex-1 min-h-0 min-w-0 w-full overflow-x-hidden [&>[data-radix-scroll-area-viewport]]:max-w-full">
          {cartItems.length === 0 ? (
            <div className="h-full min-h-[120px] flex items-center justify-center text-muted-foreground text-sm px-3">
              {t('posCartEmpty')}
            </div>
          ) : (
            <TooltipProvider delayDuration={0}>
              <div className="space-y-1.5 w-full max-w-full min-w-0 overflow-hidden">
                {cartItems.map(item => {
                  const optMatch = item.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                  const mainName = optMatch ? optMatch[1].trim() : item.name
                  const optionPart = optMatch ? optMatch[2].trim() : null
                  return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_auto] gap-2 items-start py-1.5 px-2 bg-secondary/50 w-full min-w-0 max-w-full"
                  >
                    <div className="min-w-0 overflow-hidden">
                      <Tooltip
                        open={menuNameTooltipOpen === item.id}
                        onOpenChange={(open) => setMenuNameTooltipOpen(open ? item.id : null)}
                      >
                        <TooltipTrigger asChild>
                          <p
                            className="text-sm font-medium truncate cursor-default touch-manipulation select-none"
                            title={item.name}
                            onClick={() => setMenuNameTooltipOpen((prev) => (prev === item.id ? null : item.id))}
                          >
                            {mainName}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[min(20rem,85vw)] text-left whitespace-normal">
                          {item.name}
                        </TooltipContent>
                      </Tooltip>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5 flex-wrap">
                        {optionPart && <span className="truncate">{optionPart}</span>}
                        <span className="tabular-nums shrink-0">{item.price.toLocaleString()} ฿</span>
                      </p>
                    </div>
                  <div className="flex items-center gap-0.5 w-[5.5rem] shrink-0 justify-end">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => updateItemQuantity(item.id, -1)}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => updateItemQuantity(item.id, 1)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                    </div>
                  </div>
                  )
                })}
              </div>
            </TooltipProvider>
          )}
        </ScrollArea>

        {/* Options - 쿠폰/할인은 결제 페이지에서 입력 */}
        <div className="space-y-2 pt-3 border-t shrink-0 px-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">{t('posCustomerMemo')}</Label>
            <Input
              placeholder={t('posCustomerMemoPh')}
              value={customerMemo}
              onChange={e => setCustomerMemo(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Totals - 여백 유지 */}
        <div className="space-y-1.5 pt-3 border-t px-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('posSubtotal')}</span>
            <span>{subtotal.toLocaleString()} ฿</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-destructive">
              <span>{t('posDiscount')}</span>
              <span>-{discount.toLocaleString()} ฿</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>{t('posInputTotal')}</span>
            <span>{total.toLocaleString()} ฿</span>
          </div>
        </div>

        <div className="px-3 flex gap-2">
          {orderType === 'dine-in' && selectedTable && (
            <Button
              className="w-full h-12 text-base font-semibold bg-amber-600 hover:bg-amber-700"
              disabled={total <= 0 || cartItems.length === 0}
              onClick={() => {
                if (total <= 0 || !selectedTable || cartItems.length === 0) return
                onOrderSubmit?.({
                  items: cartItems.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
                  tableName: selectedTable.name,
                  memo: customerMemo,
                  discountAmt: discount,
                  discountReason: discountReason,
                })
              }}
            >
              {t('posOrderButton') || '주문'}
            </Button>
          )}
          {orderType !== 'dine-in' && (
            <Button
              className="w-full h-12 text-lg font-semibold bg-primary hover:bg-primary/90"
              disabled={total <= 0}
              onClick={openPaymentModal}
            >
              {t('posPayButton')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>

    <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
      <DialogContent className="max-w-xs sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('posSplitPayment') || '결제 수단 입력'}</DialogTitle>
        </DialogHeader>
        {orderType === 'delivery' ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 px-3 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{t('posSubtotal')}</span>
                <span className="tabular-nums">{subtotal.toLocaleString()} ฿</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posDiscount')}</span>
                  <span className="tabular-nums">-{discount.toLocaleString()} ฿</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t">
                <span>{t('posInputTotal') || '결제 금액'}</span>
                <span className="tabular-nums">{total.toLocaleString()} ฿</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('posDeliveryPaymentNote') || '배달 주문은 플랫폼에서 결제 완료되며, 익일 통장으로 정산됩니다.'}
            </p>
            <DialogFooter>
              <Button
                onClick={() => {
                  setShowPaymentModal(false)
                  handleClearCart()
                }}
              >
                {t('posConfirm') || '확인'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* 결제 금액 요약: 소계 / 쿠폰·할인 / 결제 금액 */}
            <div className="rounded-lg border bg-muted/30 px-3 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{t('posSubtotal')}</span>
                <span className="tabular-nums">{subtotal.toLocaleString()} ฿</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('posDiscount')}</span>
                  <span className="tabular-nums">-{discount.toLocaleString()} ฿</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t">
                <span>{t('posPaymentTotalLabel') || '결제 금액'}</span>
                <span className="tabular-nums">{total.toLocaleString()} ฿</span>
              </div>
            </div>

            {/* 쿠폰 · 할인 (결제 페이지에서 입력/수정) */}
            <div className="space-y-3 border rounded-lg p-3 bg-background">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">{t('posCoupon')}</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={t('posCouponCodePh')}
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value)}
                    className="h-8 text-sm flex-1"
                  />
                  <Button variant="outline" size="sm" className="h-8 shrink-0">
                    <Tag className="w-3 h-3 mr-1" />
                    {t('posCouponApply')}
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">{t('posDiscount')}</Label>
                <div className="flex gap-2 flex-wrap">
                  <div className="flex border rounded-md overflow-hidden shrink-0">
                    <button
                      type="button"
                      className={cn(
                        'px-2 py-1 text-xs transition-colors',
                        discountType === 'fixed' ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                      )}
                      onClick={() => setDiscountType('fixed')}
                    >
                      W
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'px-2 py-1 text-xs transition-colors',
                        discountType === 'percent' ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                      )}
                      onClick={() => setDiscountType('percent')}
                    >
                      %
                    </button>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    value={discountValue}
                    onChange={e => setDiscountValue(Number(e.target.value))}
                    className="h-8 text-sm w-20"
                  />
                  <Input
                    placeholder={t('posDiscountReasonPh')}
                    value={discountReason}
                    onChange={e => setDiscountReason(e.target.value)}
                    className="h-8 text-sm flex-1 min-w-0"
                  />
                </div>
              </div>
            </div>

            {/* 결제 수단: 현금 / 카드 / 프롬프트페이 / 기타(태국 앱) */}
            <div className="grid gap-2">
              {[
                { value: payCash, set: setPayCash, labelKey: 'posPaymentCash' },
                { value: payCard, set: setPayCard, labelKey: 'posPaymentCard' },
                { value: payPromptPay, set: setPayPromptPay, labelKey: 'posPaymentPromptPay' },
              ].map(({ value, set, labelKey }) => (
                <div key={labelKey} className="flex items-center gap-2">
                  <label className="w-24 text-sm shrink-0">{t(labelKey)}</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={value}
                    onChange={e => set(e.target.value)}
                    className="h-9 text-right flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-6">฿</span>
                </div>
              ))}

              <Collapsible open={showOtherPayments} onOpenChange={setShowOtherPayments}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between h-9 px-2 text-sm font-medium">
                    <span>{t('posPaymentOther') || '기타'}</span>
                    {showOtherPayments ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="grid gap-2 pt-1 pl-2 border-l-2 border-muted">
                  {[
                    { value: payTrueMoney, set: setPayTrueMoney, labelKey: 'posPaymentTrueMoney' },
                    { value: payWeChat, set: setPayWeChat, labelKey: 'posPaymentWeChat' },
                    { value: payAlipay, set: setPayAlipay, labelKey: 'posPaymentAlipay' },
                    { value: payLinePay, set: setPayLinePay, labelKey: 'posPaymentLinePay' },
                    { value: payShopeePay, set: setPayShopeePay, labelKey: 'posPaymentShopeePay' },
                    { value: payOther, set: setPayOther, labelKey: 'posPaymentOtherEtc' },
                  ].map(({ value, set, labelKey }) => (
                    <div key={labelKey} className="flex items-center gap-2">
                      <label className="w-20 text-xs shrink-0">{t(labelKey)}</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={value}
                        onChange={e => set(e.target.value)}
                        className="h-8 text-right flex-1 text-sm"
                      />
                      <span className="text-xs text-muted-foreground w-5">฿</span>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>

            <div className={cn(
              'rounded-lg px-3 py-2 text-sm flex justify-between',
              paymentSumMatch ? 'bg-green-500/10 text-green-700 dark:bg-green-500/20 dark:text-green-400' : 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
            )}>
              <span>{t('posPaymentSum') || '입력 합계'}</span>
              <span className="tabular-nums font-medium">{paymentSum.toLocaleString()} ฿</span>
            </div>
            {!paymentSumMatch && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{t('posPaymentSumMismatch') || '결제 합계가 주문 금액과 일치해야 합니다.'}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPaymentModal(false)}>{t('posCancel') || '취소'}</Button>
              <Button
                disabled={!paymentSumMatch}
                onClick={() => {
                  const dineInTableName = selectedTable?.name || paymentTableNameOverride
                  if (orderType === 'dine-in' && dineInTableName && onDineInOrderComplete) {
                    const paymentOtherSum =
                      (parseFloat(payTrueMoney) || 0) +
                      (parseFloat(payWeChat) || 0) +
                      (parseFloat(payAlipay) || 0) +
                      (parseFloat(payLinePay) || 0) +
                      (parseFloat(payShopeePay) || 0) +
                      (parseFloat(payOther) || 0)
                    onDineInOrderComplete(
                      {
                        items: cartItems.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
                        tableName: dineInTableName,
                        memo: customerMemo,
                        discountAmt: discount,
                        discountReason: discountReason,
                        payment: {
                          paymentCash: parseFloat(payCash) || 0,
                          paymentCard: parseFloat(payCard) || 0,
                          paymentQr: parseFloat(payPromptPay) || 0,
                          paymentOther: paymentOtherSum,
                        },
                      },
                      pendingOrderId ?? undefined
                    )
                  }
                  setShowPaymentModal(false)
                  handleClearCart()
                }}
              >
                {t('posPayConfirm') || '결제 완료'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
})

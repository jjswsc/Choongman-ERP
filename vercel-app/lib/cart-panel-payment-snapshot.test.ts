import { describe, expect, it } from 'vitest'
import type { OrderItem } from '@/lib/pos-types'
import type { PosPaymentMethodItem } from '@/lib/api-client'
import {
  buildCartPanelOrderItemPayload,
  buildCartPanelPaymentOtherBreakdown,
  buildCartPanelPaymentSnapshot,
} from '@/lib/cart-panel-payment-snapshot'

describe('buildCartPanelOrderItemPayload', () => {
  const line: OrderItem = { id: 'A', name: 'Pad Thai', price: 120, quantity: 2, note: '  no egg ', menuId: 'M1' }

  it('매장 주문은 dine_in, 메모 trim, 빈 필드는 생략', () => {
    const out = buildCartPanelOrderItemPayload({
      i: line,
      quantityOverride: undefined,
      lineIdx: undefined,
      lineDiscountAmtOverride: undefined,
      orderType: 'dine-in',
      lineDiscountSnapshot: [],
      deliveryAppProp: undefined,
    })
    expect(out).toEqual({
      id: 'A',
      name: 'Pad Thai',
      price: 120,
      quantity: 2,
      orderType: 'dine_in',
      note: 'no egg',
      menuId: 'M1',
    })
  })

  it('줄 할인: override가 스냅샷보다 우선', () => {
    const common = {
      i: line,
      quantityOverride: 1,
      orderType: 'takeout' as const,
      lineDiscountSnapshot: [30],
      deliveryAppProp: undefined,
    }
    expect(
      buildCartPanelOrderItemPayload({ ...common, lineIdx: 0, lineDiscountAmtOverride: undefined })
    ).toMatchObject({ quantity: 1, lineDiscountAmt: 30, orderType: 'takeout' })
    expect(buildCartPanelOrderItemPayload({ ...common, lineIdx: 0, lineDiscountAmtOverride: 5 })).toMatchObject({
      lineDiscountAmt: 5,
    })
    expect(
      buildCartPanelOrderItemPayload({ ...common, lineIdx: 0, lineDiscountAmtOverride: 0 })
    ).not.toHaveProperty('lineDiscountAmt')
  })

  it('배달 앱 코드는 배달 주문에만, 프로모 필드 유지', () => {
    const promoLine: OrderItem = {
      ...line,
      promoId: 'P1',
      promoCode: 'SET1',
      promoItems: [{ menuId: 'M1', optionId: null, quantity: 1 }],
    }
    const delivery = buildCartPanelOrderItemPayload({
      i: promoLine,
      quantityOverride: undefined,
      lineIdx: undefined,
      lineDiscountAmtOverride: undefined,
      orderType: 'delivery',
      lineDiscountSnapshot: [],
      deliveryAppProp: 'GRAB',
    })
    expect(delivery).toMatchObject({ deliveryAppCode: 'GRAB', promoId: 'P1', promoCode: 'SET1' })
    expect(delivery.promoItems).toHaveLength(1)
    const takeout = buildCartPanelOrderItemPayload({
      i: promoLine,
      quantityOverride: undefined,
      lineIdx: undefined,
      lineDiscountAmtOverride: undefined,
      orderType: 'takeout',
      lineDiscountSnapshot: [],
      deliveryAppProp: 'GRAB',
    })
    expect(takeout).not.toHaveProperty('deliveryAppCode')
  })
})

describe('buildCartPanelPaymentOtherBreakdown', () => {
  const legacy = {
    useAdminPaymentLines: false,
    adminPaymentLines: [] as PosPaymentMethodItem[],
    payAdminLineAmounts: {},
    payTrueMoney: '',
    payWeChat: '',
    payAlipay: '',
    payUnionPay: '',
    payLinePay: '',
    payShopeePay: '',
    payOther: '',
  }

  it('입력 없으면 undefined', () => {
    expect(buildCartPanelPaymentOtherBreakdown(legacy)).toBeUndefined()
  })

  it('기존 지갑 칸 금액만 담는다', () => {
    expect(buildCartPanelPaymentOtherBreakdown({ ...legacy, payTrueMoney: '50', payOther: '10' })).toEqual({
      trueMoney: 50,
      misc: 10,
    })
  })

  it('관리자 결제 수단 줄 — 금액·이름', () => {
    const lines = [
      { id: 'a1', storeCode: null, category: 'other', name: 'Rabbit', hidden: false, sortOrder: 1 },
      { id: 'a2', storeCode: null, category: 'other', name: '', hidden: false, sortOrder: 2 },
      { id: 'a3', storeCode: null, category: 'other', name: 'Zero', hidden: false, sortOrder: 3 },
    ] satisfies PosPaymentMethodItem[]
    expect(
      buildCartPanelPaymentOtherBreakdown({
        ...legacy,
        useAdminPaymentLines: true,
        adminPaymentLines: lines,
        payAdminLineAmounts: { a1: '30', a2: '15', a3: '0' },
      })
    ).toEqual({ admin: { a1: 30, a2: 15 }, adminLabels: { a1: 'Rabbit' } })
  })
})

describe('buildCartPanelPaymentSnapshot', () => {
  const base = {
    payDeliveryApp: '',
    deliveryAppProp: undefined,
    deliveryOrderNoProp: undefined,
    paymentTableNameOverride: null,
    customerMemo: '',
    deliveryPaymentChannel: 'grab' as const,
    useAdminPaymentLines: false,
    adminConfiguredWalletSum: 0,
    legacyWalletPaymentSum: 0,
    buildPaymentOtherBreakdownSnapshot: () => undefined,
    payCash: '',
    cashTenderedRef: { current: '' },
    cashTendered: '',
    payCard: '',
    payPromptPay: '',
    payCrypto: '',
    payQrType: 'THAI_QR' as const,
    cryptoMeta: null,
  }

  it('현금만 결제하고 받은 돈 미입력이면 현금액을 받은 돈으로', () => {
    const out = buildCartPanelPaymentSnapshot({ ...base, payCash: '200' })
    expect(out).toMatchObject({ paymentCash: 200, paymentCashTendered: 200, paymentDeliveryApp: 0 })
    expect(out.deliveryPaymentChannel).toBeNull()
  })

  it('받은 돈은 ref 값이 state보다 우선', () => {
    const out = buildCartPanelPaymentSnapshot({
      ...base,
      payCash: '200',
      cashTendered: '300',
      cashTenderedRef: { current: '500' },
    })
    expect(out.paymentCashTendered).toBe(500)
  })

  it('현금+카드 혼합이고 받은 돈 미입력이면 받은 돈 생략', () => {
    const out = buildCartPanelPaymentSnapshot({ ...base, payCash: '100', payCard: '50' })
    expect(out).toMatchObject({ paymentCash: 100, paymentCard: 50 })
    expect(out).not.toHaveProperty('paymentCashTendered')
  })

  it('EDC QR은 THAI_QR로 저장하고 EDC 표시 플래그', () => {
    const out = buildCartPanelPaymentSnapshot({ ...base, payPromptPay: '80', payQrType: 'EDC' })
    expect(out).toMatchObject({ paymentQr: 80, paymentQrType: 'THAI_QR', paymentQrShowOnEdc: true })
  })

  it('지갑 합계·내역·배달앱 금액', () => {
    const out = buildCartPanelPaymentSnapshot({
      ...base,
      legacyWalletPaymentSum: 60,
      buildPaymentOtherBreakdownSnapshot: () => ({ trueMoney: 60 }),
      payDeliveryApp: '300',
      deliveryAppProp: 'GRAB',
    })
    expect(out).toMatchObject({
      paymentOther: 60,
      paymentOtherBreakdown: { trueMoney: 60 },
      paymentDeliveryApp: 300,
    })
    expect(out).not.toHaveProperty('paymentCashTendered')
  })
})

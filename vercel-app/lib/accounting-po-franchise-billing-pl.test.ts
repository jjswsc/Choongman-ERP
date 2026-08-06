import { describe, expect, it } from 'vitest'
import {
  accumulateFranchiseBillingFromPos,
  franchiseBillingPoInPeriod,
  parseFranchiseBillingKind,
  type FranchiseBillingPoRow,
} from '@/lib/accounting-po-franchise-billing-pl'
import { serializePurchaseOrderCart } from '@/lib/purchase-order-cart'

function makePo(opts: {
  status?: string
  billingKind?: 'royalty' | 'delivery_gp' | 'grab_gp' | 'all'
  billingMonthYm?: string
  relatedStore?: string
  issuerStore?: string
  orderDate?: string
  subtotal?: number
  total?: number
  logisticsOnly?: boolean
}): FranchiseBillingPoRow {
  if (opts.logisticsOnly) {
    return {
      status: opts.status ?? 'Approved',
      cart_json: serializePurchaseOrderCart([{ code: 'X', name: 'item', price: 100, qty: 1 }]),
      subtotal: opts.subtotal ?? 100,
      total: opts.total ?? 107,
      created_at: '2026-05-15T10:00:00+07:00',
    }
  }
  return {
    status: opts.status ?? 'Approved',
    cart_json: serializePurchaseOrderCart([{ code: 'B', name: 'royalty', price: opts.subtotal ?? 1000, qty: 1, taxType: 'taxable' }], {
      relatedStore: opts.relatedStore ?? 'StoreA',
      issuerStore: opts.issuerStore,
      billingMonthYm: opts.billingMonthYm ?? '2026-05',
      billingKind: opts.billingKind ?? 'royalty',
      orderDate: opts.orderDate,
    }),
    subtotal: opts.subtotal ?? 1000,
    total: opts.total ?? 1070,
    created_at: '2026-05-15T10:00:00+07:00',
    location_name: 'Warehouse',
  }
}

describe('accounting-po-franchise-billing-pl', () => {
  it('parseFranchiseBillingKind reads meta', () => {
    const po = makePo({ billingKind: 'delivery_gp' })
    expect(parseFranchiseBillingKind(po.cart_json)).toBe('delivery_gp')
  })

  it('franchiseBillingPoInPeriod prefers billingMonthYm', () => {
    const po = makePo({ billingMonthYm: '2026-05', orderDate: '2026-04-01' })
    expect(franchiseBillingPoInPeriod(po, '2026-05', '2026-05-01', '2026-05-31')).toBe(true)
    expect(franchiseBillingPoInPeriod(po, '2026-04', '2026-04-01', '2026-04-30')).toBe(false)
  })

  it('accumulates store expense and HQ revenue with gross/net', () => {
    const rows = [
      makePo({ billingKind: 'royalty', relatedStore: 'StoreA', subtotal: 1000, total: 1070 }),
      makePo({ billingKind: 'delivery_gp', relatedStore: 'StoreA', subtotal: 200, total: 214 }),
      makePo({ billingKind: 'royalty', relatedStore: 'StoreB', subtotal: 500, total: 535 }),
      makePo({ status: 'Draft', relatedStore: 'StoreA' }),
      makePo({ logisticsOnly: true }),
    ]
    const r = accumulateFranchiseBillingFromPos(rows, {
      yearMonth: '2026-05',
      startStr: '2026-05-01',
      endStr: '2026-05-31',
      matchExpense: (s) => s === 'StoreA',
      matchRevenue: (issuer) => issuer == null,
    })
    expect(r.expense.royaltyGross).toBe(1070)
    expect(r.expense.royaltyNet).toBe(1000)
    expect(r.expense.deliveryGpGross).toBe(214)
    expect(r.expense.totalGross).toBe(1284)
    expect(r.expense.totalNet).toBe(1200)
    // issuer 없음 = 본사 매출: StoreA+StoreB 전부
    expect(r.revenue.totalGross).toBe(1819)
    expect(r.revenue.totalNet).toBe(1700)
    expect(r.fetched).toBe(3)
  })

  it('billingKind all goes to combined bucket', () => {
    const rows = [makePo({ billingKind: 'all', relatedStore: 'StoreA', subtotal: 100, total: 107 })]
    const r = accumulateFranchiseBillingFromPos(rows, {
      yearMonth: '2026-05',
      startStr: '2026-05-01',
      endStr: '2026-05-31',
      matchExpense: () => true,
      matchRevenue: () => false,
    })
    // 단일 라인이라도 이름이 royalty면 로열티로 분류
    expect(r.expense.royaltyGross).toBe(107)
    expect(r.expense.royaltyNet).toBe(100)
    expect(r.expense.combinedGross).toBe(0)
  })

  it('splits billingKind all by line names into royalty delivery grab', () => {
    const cart = serializePurchaseOrderCart(
      [
        { code: '1', name: 'Royalty (2026-05)', price: 1000, qty: 1, taxType: 'taxable' },
        { code: '2', name: 'Delivery GP (2026-05)', price: 200, qty: 1, taxType: 'taxable' },
        { code: '3', name: 'Grab GP (2026-05)', price: 50, qty: 1, taxType: 'taxable' },
      ],
      {
        relatedStore: 'StoreA',
        billingMonthYm: '2026-05',
        billingKind: 'all',
      }
    )
    const po: FranchiseBillingPoRow = {
      status: 'Approved',
      cart_json: cart,
      subtotal: 1250,
      total: 1337.5,
      created_at: '2026-05-15T10:00:00+07:00',
    }
    const r = accumulateFranchiseBillingFromPos([po], {
      yearMonth: '2026-05',
      startStr: '2026-05-01',
      endStr: '2026-05-31',
      matchExpense: () => true,
      matchRevenue: () => false,
    })
    expect(r.expense.royaltyNet).toBe(1000)
    expect(r.expense.deliveryGpNet).toBe(200)
    expect(r.expense.grabGpNet).toBe(50)
    expect(r.expense.totalNet).toBe(1250)
    expect(r.expense.totalGross).toBe(1337.5)
  })

  it('issuerStore revenue matches store issuer', () => {
    const rows = [
      makePo({
        billingKind: 'grab_gp',
        relatedStore: 'StoreA',
        issuerStore: 'StoreX',
        subtotal: 50,
        total: 53.5,
      }),
    ]
    const r = accumulateFranchiseBillingFromPos(rows, {
      yearMonth: '2026-05',
      startStr: '2026-05-01',
      endStr: '2026-05-31',
      matchExpense: (s) => s === 'StoreA',
      matchRevenue: (issuer) => issuer === 'StoreX',
    })
    expect(r.expense.grabGpNet).toBe(50)
    expect(r.revenue.grabGpGross).toBe(53.5)
  })

  it('infers royalty from line name when billingKind meta missing', () => {
    const cart = serializePurchaseOrderCart(
      [{ code: '1', name: '로얄티 (2026-07)', price: 500, qty: 1, taxType: 'taxable' }],
      {
        relatedStore: 'CM MBK',
        billingMonthYm: '2026-07',
        orderDate: '2026-07-31',
      }
    )
    const po: FranchiseBillingPoRow = {
      status: 'Approved',
      cart_json: cart,
      subtotal: 500,
      total: 535,
      created_at: '2026-07-31T10:00:00+07:00',
    }
    const r = accumulateFranchiseBillingFromPos([po], {
      yearMonth: '2026-07',
      startStr: '2026-07-01',
      endStr: '2026-07-31',
      matchExpense: (s) => s === 'CM MBK',
      matchRevenue: () => false,
    })
    expect(r.expense.royaltyNet).toBe(500)
    expect(r.expense.royaltyGross).toBe(535)
    expect(r.fetched).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import {
  aggregateDeliveryAppReconcileRows,
  applyFeePctToReconcileRows,
  applySettledAmountsToReconcileRows,
  buildDeliveryAppReconcileResult,
  resolveInStoreDeliveryAppCode,
} from '@/lib/pos-delivery-app-reconcile'

describe('resolveInStoreDeliveryAppCode', () => {
  it('returns grab for dine-in GrabPay', () => {
    expect(
      resolveInStoreDeliveryAppCode({
        order_type: 'dine_in',
        delivery_payment_channel: 'grab',
        payment_delivery_app: 515,
        total: 515,
      })
    ).toBe('grab')
  })

  it('falls back to delivery_app_code when dine GrabPay has no payment channel', () => {
    expect(
      resolveInStoreDeliveryAppCode({
        order_type: 'dine_in',
        delivery_app_code: 'grab',
        payment_delivery_app: 515,
        total: 515,
      })
    ).toBe('grab')
  })

  it('returns empty for delivery orders', () => {
    expect(
      resolveInStoreDeliveryAppCode({
        order_type: 'delivery',
        delivery_app_code: 'grab',
        payment_delivery_app: 100,
        total: 100,
      })
    ).toBe('')
  })
})

describe('aggregateDeliveryAppReconcileRows', () => {
  it('keeps Grab delivery and GrabPay dine-in in separate buckets', () => {
    const rows = aggregateDeliveryAppReconcileRows([
      {
        status: 'paid',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        payment_delivery_app: 218592,
        total: 218592,
        store_code: 'CM Union Mall',
        created_at: '2026-07-01 12:00:00',
      },
      {
        status: 'paid',
        order_type: 'dine_in',
        delivery_payment_channel: 'grab',
        payment_delivery_app: 6437,
        total: 6437,
        store_code: 'CM Union Mall',
        created_at: '2026-07-07 18:00:00',
      },
    ])
    expect(rows).toHaveLength(1)
    const grab = rows[0]
    expect(grab.appCode).toBe('grab')
    expect(grab.deliveryCount).toBe(1)
    expect(grab.deliverySales).toBe(218592)
    expect(grab.inStoreCount).toBe(1)
    expect(grab.inStoreSales).toBe(6437)
    expect(grab.appNetSales).toBe(225029)
    expect(grab.suggestedFee).toBe(43718.4)
    expect(grab.suggestedNet).toBe(174873.6)
    expect(grab.suggestedPayout).toBe(181310.6)
  })

  it('does not add dine-in GrabPay into delivery totals even if delivery_app_code is set', () => {
    const rows = aggregateDeliveryAppReconcileRows([
      {
        status: 'paid',
        order_type: 'dine_in',
        delivery_app_code: 'grab',
        delivery_payment_channel: 'grab',
        payment_delivery_app: 150,
        total: 150,
        store_code: 'CM Union Mall',
        created_at: '2026-07-01 12:00:00',
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].deliveryCount).toBe(0)
    expect(rows[0].deliverySales).toBe(0)
    expect(rows[0].inStoreCount).toBe(1)
    expect(rows[0].inStoreSales).toBe(150)
  })

  it('puts dine GrabPay on the same Grab row as delivery even without payment channel', () => {
    const rows = aggregateDeliveryAppReconcileRows([
      {
        status: 'paid',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        total: 218592,
        store_code: 'CM Union Mall',
        created_at: '2026-07-01 12:00:00',
      },
      {
        status: 'paid',
        order_type: 'dine_in',
        delivery_app_code: 'grab',
        payment_delivery_app: 6437,
        total: 6437,
        store_code: 'CM Union Mall',
        created_at: '2026-07-07 18:00:00',
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].appCode).toBe('grab')
    expect(rows[0].deliverySales).toBe(218592)
    expect(rows[0].inStoreSales).toBe(6437)
    expect(rows[0].appNetSales).toBe(225029)
  })

  it('counts takeout app pay as in-store, not delivery', () => {
    const rows = aggregateDeliveryAppReconcileRows([
      {
        status: 'paid',
        order_type: 'takeout',
        delivery_payment_channel: 'grab',
        payment_delivery_app: 502,
        total: 502,
        store_code: 'CM Union Mall',
        created_at: '2026-07-04 13:00:00',
      },
    ])
    expect(rows[0].deliveryCount).toBe(0)
    expect(rows[0].inStoreCount).toBe(1)
    expect(rows[0].inStoreSales).toBe(502)
  })

  it('skips cancelled and cooking orders', () => {
    const rows = aggregateDeliveryAppReconcileRows([
      {
        status: 'cancelled',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        total: 189,
        store_code: 'CM Union Mall',
        created_at: '2026-07-11 12:00:00',
      },
      {
        status: 'cooking',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        total: 390,
        store_code: 'CM Union Mall',
        created_at: '2026-07-11 13:00:00',
      },
    ])
    expect(rows).toHaveLength(0)
  })

  it('splits LINE MAN and Shopee from Grab', () => {
    const rows = aggregateDeliveryAppReconcileRows([
      {
        status: 'completed',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        total: 100,
        store_code: 'A',
        created_at: '2026-07-01 10:00:00',
      },
      {
        status: 'completed',
        order_type: 'delivery',
        delivery_app_code: 'lineman',
        total: 200,
        store_code: 'A',
        created_at: '2026-07-01 10:00:00',
      },
      {
        status: 'completed',
        order_type: 'delivery',
        delivery_app_code: 'shopee',
        total: 50,
        store_code: 'A',
        created_at: '2026-07-01 10:00:00',
      },
    ])
    expect(rows.map((r) => r.appCode)).toEqual(['grab', 'lineman', 'shopee'])
    expect(rows.find((r) => r.appCode === 'lineman')?.deliverySales).toBe(200)
  })

  it('matches Union Mall July Grab KPI shape (641 delivery + 11 GrabPay)', () => {
    const orders: Array<{
      status: string
      order_type: 'delivery' | 'dine_in'
      delivery_app_code?: string
      delivery_payment_channel?: string
      total: number
      payment_delivery_app: number
      store_code: string
      created_at: string
    }> = []
    for (let i = 0; i < 641; i++) {
      orders.push({
        status: 'paid',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        total: i === 0 ? 218592 - 640 : 1,
        payment_delivery_app: i === 0 ? 218592 - 640 : 1,
        store_code: 'CM Union Mall',
        created_at: '2026-07-15 12:00:00',
      })
    }
    const dineAmounts = [224, 515, 497, 564, 628, 575, 547, 646, 1129, 565, 547]
    expect(dineAmounts.reduce((a, n) => a + n, 0)).toBe(6437)
    for (const amt of dineAmounts) {
      orders.push({
        status: 'paid',
        order_type: 'dine_in',
        delivery_payment_channel: 'grab',
        total: amt,
        payment_delivery_app: amt,
        store_code: 'CM Union Mall',
        created_at: '2026-07-11 12:00:00',
      })
    }
    const grab = aggregateDeliveryAppReconcileRows(orders)[0]
    expect(grab.deliveryCount).toBe(641)
    expect(grab.deliverySales).toBe(218592)
    expect(grab.inStoreCount).toBe(11)
    expect(grab.inStoreSales).toBe(6437)
    const kpi = buildDeliveryAppReconcileResult([grab]).kpi
    expect(kpi.appNetSales).toBe(225029)
    expect(kpi.deliveryCount).toBe(641)
    expect(kpi.inStoreCount).toBe(11)
  })
})

describe('applyFeePctToReconcileRows / settlements', () => {
  it('overrides default % with store policy', () => {
    const base = aggregateDeliveryAppReconcileRows([
      {
        status: 'paid',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        total: 1000,
        store_code: 'CM Union Mall',
        created_at: '2026-07-01 12:00:00',
      },
    ])
    const next = applyFeePctToReconcileRows(base, () => ({ pct: 25, source: 'policy' }))
    expect(next[0].feePct).toBe(25)
    expect(next[0].feeSource).toBe('policy')
    expect(next[0].suggestedFee).toBe(250)
    expect(next[0].suggestedNet).toBe(750)
  })

  it('attaches settled FEE/NET when present', () => {
    const base = aggregateDeliveryAppReconcileRows([
      {
        status: 'paid',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        total: 1000,
        store_code: 'CM Union Mall',
        created_at: '2026-07-01 12:00:00',
      },
    ])
    const next = applySettledAmountsToReconcileRows(base, () => ({ fee: 180, net: 820 }))
    expect(next[0].settledFee).toBe(180)
    expect(next[0].settledNet).toBe(820)
  })
})

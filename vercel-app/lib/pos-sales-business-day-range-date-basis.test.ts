import { describe, expect, it } from 'vitest'
import { POS_BUSINESS_DAY_DEFAULT_HOURS } from '@/lib/pos-business-day'
import type { PosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import {
  filterRowsByPosSalesBusinessDateRangeBasis,
  parsePosOrdersDateBasis,
  posOrderInSalesBusinessDateRangeByBasis,
} from '@/lib/pos-sales-business-day-range'

/** 기본 05:00 방콕 영업일 */
const BIZ_CTX: PosBusinessDaySettingsContext = {
  globalDefault: POS_BUSINESS_DAY_DEFAULT_HOURS,
  byNormKey: new Map(),
}

describe('parsePosOrdersDateBasis', () => {
  it('maps aliases', () => {
    expect(parsePosOrdersDateBasis('paid')).toBe('paid')
    expect(parsePosOrdersDateBasis('paid_at')).toBe('paid')
    expect(parsePosOrdersDateBasis('either')).toBe('either')
    expect(parsePosOrdersDateBasis('both')).toBe('either')
    expect(parsePosOrdersDateBasis('')).toBe('created')
    expect(parsePosOrdersDateBasis('created')).toBe('created')
  })
})

describe('posOrderInSalesBusinessDateRangeByBasis', () => {
  /** 어제 영업일 생성(2026-10-23 19:58 BKK), 오늘 결제(2026-10-24 13:22 BKK) — Future Park 072 유형 */
  const carryOver = {
    store_code: 'CM Future Park',
    created_at: '2026-10-23T12:58:13.610Z',
    paid_at: '2026-10-24T06:22:34.471Z',
  }

  it('created: only order-open business day', () => {
    expect(
      posOrderInSalesBusinessDateRangeByBasis(carryOver, BIZ_CTX, '2026-10-24', '2026-10-24', 'created')
    ).toBe(false)
    expect(
      posOrderInSalesBusinessDateRangeByBasis(carryOver, BIZ_CTX, '2026-10-23', '2026-10-23', 'created')
    ).toBe(true)
  })

  it('paid: payment business day', () => {
    expect(
      posOrderInSalesBusinessDateRangeByBasis(carryOver, BIZ_CTX, '2026-10-24', '2026-10-24', 'paid')
    ).toBe(true)
    expect(
      posOrderInSalesBusinessDateRangeByBasis(carryOver, BIZ_CTX, '2026-10-23', '2026-10-23', 'paid')
    ).toBe(false)
  })

  it('either: appears on open day and pay day', () => {
    expect(
      posOrderInSalesBusinessDateRangeByBasis(carryOver, BIZ_CTX, '2026-10-24', '2026-10-24', 'either')
    ).toBe(true)
    expect(
      posOrderInSalesBusinessDateRangeByBasis(carryOver, BIZ_CTX, '2026-10-23', '2026-10-23', 'either')
    ).toBe(true)
  })

  it('either keeps unpaid same-day pending via created_at', () => {
    const pending = {
      store_code: 'CM Future Park',
      created_at: '2026-10-24T06:28:34.480Z',
      paid_at: null,
    }
    expect(
      posOrderInSalesBusinessDateRangeByBasis(pending, BIZ_CTX, '2026-10-24', '2026-10-24', 'either')
    ).toBe(true)
    expect(
      posOrderInSalesBusinessDateRangeByBasis(pending, BIZ_CTX, '2026-10-24', '2026-10-24', 'paid')
    ).toBe(false)
  })
})

describe('filterRowsByPosSalesBusinessDateRangeBasis', () => {
  it('either includes carry-over paid + same-day created', () => {
    const rows = [
      {
        order_no: '072',
        store_code: 'CM Future Park',
        created_at: '2026-10-23T12:58:13.610Z',
        paid_at: '2026-10-24T06:22:34.471Z',
      },
      {
        order_no: '013',
        store_code: 'CM Future Park',
        created_at: '2026-10-24T06:16:34.000Z',
        paid_at: '2026-10-24T06:16:59.000Z',
      },
      {
        order_no: 'old',
        store_code: 'CM Future Park',
        created_at: '2026-10-22T10:00:00.000Z',
        paid_at: '2026-10-22T11:00:00.000Z',
      },
    ]
    const filtered = filterRowsByPosSalesBusinessDateRangeBasis(
      rows,
      BIZ_CTX,
      '2026-10-24',
      '2026-10-24',
      'either'
    )
    expect(filtered.map((r) => r.order_no).sort()).toEqual(['013', '072'])
  })
})

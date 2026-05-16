import { describe, expect, it } from 'vitest'
import {
  buildHqOutboundIndexes,
  findHqOutboundMatchForStoreInbound,
  hqIssuedInvoiceNumberForStoreInput,
  unitPriceForStoreHqInputLog,
} from '@/lib/hq-store-vat-pricing'

describe('hq-store-vat-pricing', () => {
  it('pairs store Inbound with HQ Outbound by date/store/item/qty', () => {
    const logs = [
      {
        id: 10,
        log_type: 'Outbound',
        log_date: '2026-05-10T10:00:00Z',
        location: '본사',
        vendor_target: 'Store A',
        item_code: 'A01',
        item_name: 'Item',
        qty: -5,
        order_id: 99,
        invoice_unit_price: 100,
      },
      {
        id: 20,
        log_type: 'Inbound',
        log_date: '2026-05-10T11:00:00Z',
        location: 'Store A',
        vendor_target: 'From HQ',
        item_code: 'A01',
        item_name: 'Item',
        qty: 5,
      },
    ]
    const indexes = buildHqOutboundIndexes(logs)
    const inbound = logs[1]!
    const match = findHqOutboundMatchForStoreInbound(inbound, indexes)
    expect(match?.orderId).toBe(99)
    expect(hqIssuedInvoiceNumberForStoreInput({ inbound, logType: 'Inbound', hqMatch: match })).toBe(
      'IV20260510-99'
    )
    expect(
      unitPriceForStoreHqInputLog({
        inbound,
        logType: 'Inbound',
        hqMatch: match,
        orderCartById: {},
        masterPrice: 50,
        masterCost: 30,
      })
    ).toBe(100)
  })
})

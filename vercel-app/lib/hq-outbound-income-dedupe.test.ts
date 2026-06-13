import { describe, expect, it } from 'vitest'
import {
  dedupeHqOutboundIncomeLines,
  type HqOutboundProcessedLine,
} from '@/lib/hq-outbound-income-total'
import {
  filterNewHqOutboundRows,
  filterNewInboundFromHqRows,
  fingerprintStoreInboundFromHqRow,
  fingerprintHqOutboundStockLogRow,
  fingerprintsFromExistingOutboundLogs,
} from '@/lib/hq-outbound-receive-dedupe'

function line(partial: Partial<HqOutboundProcessedLine> & Pick<HqOutboundProcessedLine, 'id'>): HqOutboundProcessedLine {
  return {
    logDate: '2026-05-12',
    logType: 'Outbound',
    itemCode: 'CT030',
    targetStore: 'CM MBK',
    qty: 2,
    unitPrice: 80,
    lineAmount: 160,
    orderId: 1433,
    ...partial,
  }
}

describe('dedupeHqOutboundIncomeLines', () => {
  it('removes duplicate order-linked outbound rows (same order/item/qty/date/price)', () => {
    const { lines, dedupedCount } = dedupeHqOutboundIncomeLines([
      line({ id: 32799 }),
      line({ id: 32787 }),
      line({ id: 32798, itemCode: 'CT029', unitPrice: 640, lineAmount: 640 }),
      line({ id: 32786, itemCode: 'CT029', unitPrice: 640, lineAmount: 640 }),
      line({ id: 90001, orderId: null, logType: 'ForceOutbound' }),
    ])
    expect(dedupedCount).toBe(2)
    expect(lines).toHaveLength(3)
    expect(lines.find((l) => l.id === 32799)).toBeUndefined()
    expect(lines.find((l) => l.id === 32798)).toBeUndefined()
    expect(lines.some((l) => l.id === 32787)).toBe(true)
    expect(lines.some((l) => l.id === 32786)).toBe(true)
    expect(lines.some((l) => l.id === 90001)).toBe(true)
  })
})

describe('hq-outbound-receive-dedupe', () => {
  it('skips insert when fingerprint already exists for order', () => {
    const existing = fingerprintsFromExistingOutboundLogs(1433, [
      {
        item_code: 'CT030',
        qty: -2,
        log_date: '2026-05-12T10:00:00+07:00',
        invoice_unit_price: 80,
      },
    ])
    const filtered = filterNewHqOutboundRows(
      1433,
      '2026-05-12',
      [
        {
          item_code: 'CT030',
          qty: -2,
          invoice_unit_price: 80,
        },
        {
          item_code: 'CM001',
          qty: -1,
          invoice_unit_price: 1640,
        },
      ],
      existing
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.item_code).toBe('CM001')
    expect(
      fingerprintHqOutboundStockLogRow({
        orderId: 1433,
        itemCode: 'CT030',
        qtyAbs: 2,
        logDateYmd: '2026-05-12',
        unitPrice: 80,
      })
    ).toBe('1433|CT030|2|2026-05-12|80')
  })

  it('skips duplicate inbound From HQ rows', () => {
    const existing = new Set([
      fingerprintStoreInboundFromHqRow({
        storeLocation: 'CM MBK',
        itemCode: 'CM001',
        qtyAbs: 1,
        logDateYmd: '2026-05-12',
      }),
    ])
    const filtered = filterNewInboundFromHqRows(
      'CM MBK',
      '2026-05-12',
      [
        {
          location: 'CM MBK',
          item_code: 'CM001',
          qty: 1,
          vendor_target: 'From HQ',
        },
        {
          location: 'CM MBK',
          item_code: 'CM002',
          qty: 1,
          vendor_target: 'From HQ',
        },
      ],
      existing
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.item_code).toBe('CM002')
  })
})

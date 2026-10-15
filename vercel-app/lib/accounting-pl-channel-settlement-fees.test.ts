import { describe, expect, it } from 'vitest'
import {
  addFeeBatchCoverage,
  aggregateChannelSettlementFeesForPl,
  channelSettlementImplausibleWarning,
  feeBatchChannelsForRow,
  type ChannelSettlementFeeSourceRow,
} from '@/lib/accounting-pl-channel-settlement-fees'

const DELIVERY_ID = 5528
const CARD_ID = 5529

function settle(partial: Partial<ChannelSettlementFeeSourceRow>): ChannelSettlementFeeSourceRow {
  return {
    id: 1,
    store_code: 'CM_SEACON',
    settle_date: '2026-09-10',
    channel: 'grab',
    gross_amt: 1000,
    fee_amt: 200,
    net_amt: 800,
    fee_source: 'auto_bank_chip',
    memo: null,
    ...partial,
  }
}

function aggregate(rows: ChannelSettlementFeeSourceRow[], coverage = new Set<string>()) {
  return aggregateChannelSettlementFeesForPl(rows, {
    coverage,
    deliverySubjectId: DELIVERY_ID,
    cardSubjectId: CARD_ID,
  })
}

describe('feeBatchChannelsForRow', () => {
  it('maps vendor codes to settlement channels', () => {
    expect(feeBatchChannelsForRow({ vendor_code: 'GRAB_FEE' })).toEqual(['grab'])
    expect(feeBatchChannelsForRow({ vendor_code: 'lineman_fee::x' })).toEqual(['lineman'])
    expect(feeBatchChannelsForRow({ vendor_code: 'SHOPEE_FEE' })).toEqual(['shopee'])
    expect(feeBatchChannelsForRow({ vendor_code: 'CARD_INSTALLMENT_FEE' })).toEqual(['card'])
  })

  it('Robinhood batch does not cover any settlement channel', () => {
    expect(feeBatchChannelsForRow({ vendor_code: 'ROBINHOOD_FEE', memo: 'Delivery App fee 2026-08' })).toEqual([])
  })

  it('memo-only rows cover all delivery or card', () => {
    expect(feeBatchChannelsForRow({ memo: 'Delivery App fee 2026-08 - Grab' })).toEqual(['*delivery'])
    expect(feeBatchChannelsForRow({ memo: 'card fee 2026-08' })).toEqual(['card'])
    expect(feeBatchChannelsForRow({ memo: 'rent' })).toEqual([])
  })
})

describe('aggregateChannelSettlementFeesForPl', () => {
  it('sums plausible settlement fees into delivery/card subjects', () => {
    const out = aggregate([
      settle({ id: 1, channel: 'grab', gross_amt: 1000, fee_amt: 200, net_amt: 800 }),
      settle({ id: 2, channel: 'card', gross_amt: 1000, fee_amt: 30, net_amt: 970 }),
    ])
    expect(out.deliveryAppFees).toBe(200)
    expect(out.cardFees).toBe(30)
    expect(out.bySubject.get(DELIVERY_ID)).toBe(200)
    expect(out.bySubject.get(CARD_ID)).toBe(30)
    expect(out.rows.map((r) => r.id)).toEqual([1, 2])
  })

  it('monthly batch for the same store/channel wins over settlements', () => {
    const coverage = new Set<string>()
    addFeeBatchCoverage(coverage, 'CM_SEACON', { vendor_code: 'GRAB_FEE' })
    const out = aggregate(
      [
        settle({ id: 1, channel: 'grab' }),
        settle({ id: 2, channel: 'lineman', gross_amt: 1000, fee_amt: 100, net_amt: 900 }),
        settle({ id: 3, channel: 'grab', store_code: 'CM_ICONSIAM' }),
      ],
      coverage
    )
    expect(out.skippedBatch).toEqual({ count: 1, fee: 200 })
    expect(out.deliveryAppFees).toBe(300)
    expect(out.rows.map((r) => r.id)).toEqual([2, 3])
  })

  it('delivery_all settlement is covered by any delivery batch', () => {
    const coverage = new Set<string>()
    addFeeBatchCoverage(coverage, 'CM_SEACON', { vendor_code: 'LINEMAN_FEE' })
    const out = aggregate([settle({ channel: 'delivery_all' })], coverage)
    expect(out.skippedBatch.count).toBe(1)
    expect(out.deliveryAppFees).toBe(0)
  })

  it('card batch does not hide delivery settlements', () => {
    const coverage = new Set<string>()
    addFeeBatchCoverage(coverage, 'CM_SEACON', { vendor_code: 'CARD_FEE' })
    const out = aggregate([settle({ channel: 'grab' }), settle({ id: 2, channel: 'card', fee_amt: 20, net_amt: 980 })], coverage)
    expect(out.deliveryAppFees).toBe(200)
    expect(out.cardFees).toBe(0)
  })

  it('excludes implausible fee rates unless staff confirmed or CSV', () => {
    const bad = { channel: 'card', gross_amt: 1000, fee_amt: 400, net_amt: 600 }
    const out = aggregate([
      settle({ id: 1, ...bad }),
      settle({ id: 2, ...bad, fee_source: 'manual_confirmed' }),
      settle({ id: 3, ...bad, fee_source: 'csv_import' }),
    ])
    expect(out.implausible).toEqual({ count: 1, fee: 400 })
    expect(out.cardFees).toBe(800)
    expect(out.excludedRows).toHaveLength(1)
    expect(out.excludedRows[0]).toMatchObject({ id: 1, channel: 'card', feePct: 40, maxPct: 8, accountSubjectId: CARD_ID })
    expect(channelSettlementImplausibleWarning(out.implausible)).toContain('1건')
    expect(channelSettlementImplausibleWarning({ count: 0, fee: 0 })).toBeNull()
  })

  it('filters by store scope', () => {
    const out = aggregateChannelSettlementFeesForPl(
      [settle({ id: 1 }), settle({ id: 2, store_code: 'CM_ICONSIAM' })],
      { coverage: new Set(), deliverySubjectId: DELIVERY_ID, cardSubjectId: CARD_ID, storeFilter: 'CM_ICONSIAM' }
    )
    expect(out.rows.map((r) => r.id)).toEqual([2])
  })
})

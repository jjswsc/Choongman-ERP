import { describe, expect, it } from 'vitest'
import {
  aggregateCollabDiscountUsageByStoreFromOrders,
  aggregateCollabDiscountUsageDailyFromOrders,
  aggregateCollabDiscountUsageFromOrders,
} from '@/lib/collab-discount-usage'
import {
  parseMarketingCampaignIdForOrderSave,
  posOrderCollabDiscountFieldsFromPayload,
} from '@/lib/pos-order-collab-discount-fields'

describe('posOrderCollabDiscountFieldsFromPayload', () => {
  it('parses campaign id and amount', () => {
    expect(
      posOrderCollabDiscountFieldsFromPayload({
        collabCampaignId: '42',
        collabDiscountAmt: 50,
      })
    ).toEqual({ collabCampaignId: 42, collabDiscountAmt: 50 })
  })

  it('omits zero amount and invalid id', () => {
    expect(posOrderCollabDiscountFieldsFromPayload({ collabDiscountAmt: 0 })).toEqual({})
    expect(parseMarketingCampaignIdForOrderSave('')).toBeNull()
    expect(parseMarketingCampaignIdForOrderSave('abc')).toBeNull()
  })
})

describe('aggregateCollabDiscountUsageFromOrders', () => {
  it('groups by campaign and sums discount', () => {
    const rows = aggregateCollabDiscountUsageFromOrders([
      {
        marketing_campaign_id: 1,
        collab_discount_amt: 100,
        store_code: 'ST01',
        status: 'paid',
      },
      {
        marketing_campaign_id: '1',
        collab_discount_amt: 50,
        store_code: 'ST02',
        status: 'completed',
      },
      {
        marketing_campaign_id: 2,
        collab_discount_amt: 200,
        store_code: 'ST01',
        status: 'ready',
      },
      {
        marketing_campaign_id: 1,
        collab_discount_amt: 10,
        store_code: 'ST01',
        status: 'cancelled',
      },
      {
        marketing_campaign_id: null,
        collab_discount_amt: 99,
        store_code: 'ST01',
        status: 'paid',
      },
    ])
    expect(rows).toEqual([
      { campaignId: '2', orderCount: 1, discountAmount: 200, storeCount: 1 },
      { campaignId: '1', orderCount: 2, discountAmount: 150, storeCount: 2 },
    ])
  })
})

describe('aggregateCollabDiscountUsageByStoreFromOrders', () => {
  it('groups by store and counts campaigns', () => {
    const rows = aggregateCollabDiscountUsageByStoreFromOrders([
      {
        marketing_campaign_id: 1,
        collab_discount_amt: 100,
        store_code: 'ST01',
        status: 'paid',
      },
      {
        marketing_campaign_id: 2,
        collab_discount_amt: 50,
        store_code: 'ST01',
        status: 'completed',
      },
      {
        marketing_campaign_id: 1,
        collab_discount_amt: 80,
        store_code: 'ST02',
        status: 'ready',
      },
    ])
    expect(rows).toEqual([
      { storeCode: 'ST01', orderCount: 2, discountAmount: 150, campaignCount: 2 },
      { storeCode: 'ST02', orderCount: 1, discountAmount: 80, campaignCount: 1 },
    ])
  })
})

describe('aggregateCollabDiscountUsageDailyFromOrders', () => {
  it('groups by Bangkok calendar day', () => {
    const rows = aggregateCollabDiscountUsageDailyFromOrders([
      {
        marketing_campaign_id: 1,
        collab_discount_amt: 100,
        store_code: 'ST01',
        status: 'paid',
        created_at: '2026-07-01T10:00:00+07:00',
      },
      {
        marketing_campaign_id: 1,
        collab_discount_amt: 50,
        store_code: 'ST01',
        status: 'paid',
        created_at: '2026-07-01T22:00:00+07:00',
      },
      {
        marketing_campaign_id: 2,
        collab_discount_amt: 30,
        store_code: 'ST02',
        status: 'completed',
        created_at: '2026-07-02T01:00:00+07:00',
      },
    ])
    expect(rows).toEqual([
      { ymd: '2026-07-01', orderCount: 2, discountAmount: 150 },
      { ymd: '2026-07-02', orderCount: 1, discountAmount: 30 },
    ])
  })
})

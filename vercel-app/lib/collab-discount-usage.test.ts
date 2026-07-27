import { describe, expect, it } from 'vitest'
import { aggregateCollabDiscountUsageFromOrders } from '@/lib/collab-discount-usage'
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

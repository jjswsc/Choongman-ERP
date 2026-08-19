import { describe, expect, it } from 'vitest'
import {
  kitchenLinesFromPrintJobPayload,
  kitchenPrintJobClaimCreatedAtGteIso,
  kitchenPrintJobOrderFieldsFromPayload,
  MAIN_POS_KITCHEN_JOB_POLL_HEALTHY_MS,
  MAIN_POS_KITCHEN_JOB_POLL_MS,
  resolveKitchenPrintJobDedupeKey,
  resolveKitchenPrintJobPollMs,
} from '@/lib/pos-kitchen-print-job-worker'
import { posOrdersRealtimeChannelName, posPrintJobsInsertChannelName } from '@/lib/supabase-client'
import { buildDineInAddKitchenAutoPrintDedupeKey } from '@/lib/pos-kitchen-dine-in-delta'

describe('MAIN_POS_KITCHEN_JOB_POLL_MS', () => {
  it('claims every 2s so QR kitchen does not wait for slow order realtime', () => {
    expect(MAIN_POS_KITCHEN_JOB_POLL_MS).toBe(2_000)
    expect(MAIN_POS_KITCHEN_JOB_POLL_HEALTHY_MS).toBe(2_000)
    expect(resolveKitchenPrintJobPollMs({ realtimeChannelHealthy: false, realtimeRecentlyActive: false })).toBe(
      2_000
    )
    expect(resolveKitchenPrintJobPollMs({ realtimeChannelHealthy: true, realtimeRecentlyActive: true })).toBe(2_000)
  })
})

describe('kitchenPrintJobClaimCreatedAtGteIso', () => {
  it('excludes jobs older than 8 minutes', () => {
    const now = Date.parse('2026-08-17T11:20:00+07:00')
    expect(kitchenPrintJobClaimCreatedAtGteIso(now)).toBe(new Date(now - 8 * 60 * 1000).toISOString())
  })
})

describe('kitchenLinesFromPrintJobPayload', () => {
  it('returns kitchenLines objects only', () => {
    expect(
      kitchenLinesFromPrintJobPayload({
        kitchenLines: [{ menuId: '1', name: 'A', qty: 1 }, null, 'x'],
      })
    ).toEqual([{ menuId: '1', name: 'A', qty: 1 }])
    expect(kitchenLinesFromPrintJobPayload({})).toEqual([])
    expect(kitchenLinesFromPrintJobPayload(null)).toEqual([])
  })
})

describe('resolveKitchenPrintJobDedupeKey', () => {
  it('matches dine-in add autoprint key when kitchenLines exist', () => {
    const lines = [{ menuId: '90', name: '[Buffet] Soup', qty: 1, quantity: 1 }]
    expect(resolveKitchenPrintJobDedupeKey(58, { action: 'update_order', kitchenLines: lines })).toBe(
      buildDineInAddKitchenAutoPrintDedupeKey(58, lines)
    )
  })

  it('uses unique QR line ids so two phones ordering the same menu both print', () => {
    const a = [{ id: 'qr-12-90-1-aaa', menuId: '90', name: '[Buffet] Soup', qty: 1 }]
    const b = [{ id: 'qr-12-90-1-bbb', menuId: '90', name: '[Buffet] Soup', qty: 1 }]
    const keyA = resolveKitchenPrintJobDedupeKey(58, {
      action: 'update_order',
      source: 'qr_table_submit',
      kitchenLines: a,
    })
    const keyB = resolveKitchenPrintJobDedupeKey(58, {
      action: 'update_order',
      source: 'qr_table_submit',
      kitchenLines: b,
    })
    expect(keyA).toBe('order:58:kitchen:qr:qr-12-90-1-aaa')
    expect(keyB).toBe('order:58:kitchen:qr:qr-12-90-1-bbb')
    expect(keyA).not.toBe(keyB)
    expect(keyA).not.toBe(buildDineInAddKitchenAutoPrintDedupeKey(58, a))
  })

  it('uses create key when there are no kitchen lines', () => {
    expect(resolveKitchenPrintJobDedupeKey(12, { action: 'create_order' })).toBe('order:12:kitchen')
  })

  it('uses create key for create_order even when kitchenLines exist', () => {
    const lines = [{ menuId: '90', name: 'GOLDEN FRIED CHICKEN', qty: 1, quantity: 1 }]
    expect(resolveKitchenPrintJobDedupeKey(12, { action: 'create_order', kitchenLines: lines })).toBe(
      'order:12:kitchen'
    )
    expect(resolveKitchenPrintJobDedupeKey(12, { action: 'create_order', kitchenLines: lines })).not.toBe(
      buildDineInAddKitchenAutoPrintDedupeKey(12, lines)
    )
  })
})

describe('kitchenPrintJobOrderFieldsFromPayload', () => {
  it('reads header fields for slip print without extra fetch', () => {
    expect(
      kitchenPrintJobOrderFieldsFromPayload({
        orderNo: 'POS-1',
        tableName: 'A2',
        memo: 'QR',
        guestCount: 3,
      })
    ).toEqual({ orderNo: 'POS-1', tableName: 'A2', memo: 'QR', orderType: 'dine_in', guestCount: 3 })
  })

  it('keeps takeout/delivery labels instead of defaulting to dine_in', () => {
    expect(
      kitchenPrintJobOrderFieldsFromPayload({
        orderNo: '066',
        orderType: 'takeout',
      })
    ).toMatchObject({ orderNo: '066', orderType: 'takeout' })
    expect(
      kitchenPrintJobOrderFieldsFromPayload({
        orderNo: 'GF-1',
        order_type: 'delivery',
        deliveryAppCode: 'grab',
      })
    ).toMatchObject({ orderType: 'delivery', deliveryAppCode: 'grab' })
  })
})

describe('posPrintJobsInsertChannelName', () => {
  it('scopes the kitchen job channel per store', () => {
    expect(posPrintJobsInsertChannelName('OMNI Rama 2')).toBe('pos-print-jobs-insert-OMNI Rama 2')
  })
})

describe('posOrdersRealtimeChannelName', () => {
  it('keeps update subscriptions unique per purpose', () => {
    expect(posOrdersRealtimeChannelName('update', { store: 'CM Silom', channelKey: 'dine-in-addon' })).toBe(
      'pos-orders-update-dine-in-addon-CM Silom'
    )
    expect(posOrdersRealtimeChannelName('update', { store: 'CM Silom', channelKey: 'grab-cancel' })).toBe(
      'pos-orders-update-grab-cancel-CM Silom'
    )
    expect(posOrdersRealtimeChannelName('update', { store: 'CM Silom', channelKey: 'pending-items' })).not.toBe(
      posOrdersRealtimeChannelName('update', { store: 'CM Silom', channelKey: 'dine-in-addon' })
    )
  })
})

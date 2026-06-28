import { describe, expect, it } from 'vitest'
import {
  formatPosPrintOrderTypeLabel,
  isApiInboundDeliveryOrderMemo,
  isMeaningfulReceiptTableDisplay,
  pickPosChannelOrderNo,
  resolveDefaultDeliveryPaymentChannel,
  resolveDeliveryPaymentChannelForSave,
  resolvePosDeliveryPlatformDisplayName,
  resolveReceiptDeliveryPaymentChannelCode,
  resolveReceiptTableForPrint,
  stripRedundantChannelOrderNoFromTableDisplay,
} from '@/lib/pos-delivery-platform'

describe('isApiInboundDeliveryOrderMemo', () => {
  it('is true for Grab/ShopeeFood/LineMan webhook memo anchors', () => {
    expect(isApiInboundDeliveryOrderMemo('grab_order:ABC-12|grab_state:PENDING')).toBe(true)
    expect(isApiInboundDeliveryOrderMemo('sf_order:12345')).toBe(true)
    expect(isApiInboundDeliveryOrderMemo('lineman_order:lm-99')).toBe(true)
    expect(isApiInboundDeliveryOrderMemo('prefix shopee_order:xyz tail')).toBe(true)
  })
  it('is false for manual POS memos', () => {
    expect(isApiInboundDeliveryOrderMemo('')).toBe(false)
    expect(isApiInboundDeliveryOrderMemo('  ')).toBe(false)
    expect(isApiInboundDeliveryOrderMemo('ไม่เผ็ด ห้ามถั่ว')).toBe(false)
    expect(isApiInboundDeliveryOrderMemo('Grab #123 ลูกค้ารอหน้าร้าน')).toBe(false)
  })
})

describe('stripRedundantChannelOrderNoFromTableDisplay', () => {
  it('removes #token from table label when header already shows channel no', () => {
    expect(stripRedundantChannelOrderNoFromTableDisplay('Grab #GF-636 · Delivery · Name', 'GF-636')).toBe(
      'Grab · Delivery · Name'
    )
    expect(stripRedundantChannelOrderNoFromTableDisplay('Grab #GF-636', 'GF-636')).toBe('Grab')
  })
})

describe('resolveReceiptTableForPrint', () => {
  it('omits table row when only platform name remains after dedupe', () => {
    const pick = pickPosChannelOrderNo({
      tableName: 'Grab #GF-636',
      orderNo: 'POS-1',
      memo: 'grab_order:GF-636',
    })
    expect(
      resolveReceiptTableForPrint({
        tableName: 'Grab #GF-636',
        channelPick: pick,
      })
    ).toBe('')
  })
  it('keeps customer context without channel token', () => {
    const pick = pickPosChannelOrderNo({
      tableName: 'Grab #GF-636 · Delivery · Somchai',
      orderNo: 'POS-1',
      memo: 'grab_order:GF-636',
    })
    expect(
      resolveReceiptTableForPrint({
        tableName: 'Grab #GF-636 · Delivery · Somchai',
        channelPick: pick,
      })
    ).toBe('Grab · Delivery · Somchai')
  })
})

describe('isMeaningfulReceiptTableDisplay', () => {
  it('treats platform-only labels as not worth printing', () => {
    expect(isMeaningfulReceiptTableDisplay('Grab')).toBe(false)
    expect(isMeaningfulReceiptTableDisplay('Grab · Delivery')).toBe(false)
    expect(isMeaningfulReceiptTableDisplay('Grab · Delivery · Somchai')).toBe(true)
  })
})

describe('pickPosChannelOrderNo (sf_order anchor)', () => {
  it('reads ShopeeFood dedupe memo when no # in table_name', () => {
    const pick = pickPosChannelOrderNo({
      tableName: 'ShopeeFood',
      orderNo: 'POS-001',
      memo: 'sf_order:778899',
    })
    expect(pick.kind).toBe('memo_anchor')
    expect(pick.text).toBe('778899')
  })
})

describe('resolveReceiptDeliveryPaymentChannelCode', () => {
  it('prefers order delivery_app_code over mismatched payment channel', () => {
    expect(
      resolveReceiptDeliveryPaymentChannelCode({
        deliveryAppCode: 'shopee',
        deliveryPaymentChannel: 'grab',
        tableName: 'Shopee #392',
        memo: '',
        orderNo: 'X-20250502-001',
      })
    ).toBe('shopee')
  })
  it('infers Shopee from table/memo when payment channel is wrong', () => {
    expect(
      resolveReceiptDeliveryPaymentChannelCode({
        deliveryAppCode: '',
        deliveryPaymentChannel: 'grab',
        tableName: 'Shopee #392',
        memo: '',
        orderNo: '',
      })
    ).toBe('shopee')
  })
  it('uses memo webhook anchors before payment channel', () => {
    expect(
      resolveReceiptDeliveryPaymentChannelCode({
        deliveryPaymentChannel: 'grab',
        memo: 'sf_order:778899',
        tableName: '',
        orderNo: '',
      })
    ).toBe('shopee')
  })
  it('falls back to delivery_payment_channel when order hints are absent', () => {
    expect(
      resolveReceiptDeliveryPaymentChannelCode({
        deliveryPaymentChannel: 'grab',
        tableName: '',
        memo: '',
        orderNo: 'CM01-20250502-042',
      })
    ).toBe('grab')
  })
})

describe('resolveDefaultDeliveryPaymentChannel', () => {
  it('defaults ShopeeFood inbound orders to shopee', () => {
    expect(
      resolveDefaultDeliveryPaymentChannel({
        deliveryAppCode: 'shopee',
        tableName: 'Shopee #789',
        memo: 'sf_order:778899',
      })
    ).toBe('shopee')
  })
  it('defaults to grab when no order hints', () => {
    expect(resolveDefaultDeliveryPaymentChannel({ tableName: '', memo: '' })).toBe('grab')
  })
})

describe('resolveDeliveryPaymentChannelForSave', () => {
  it('overrides grab UI channel when order is ShopeeFood', () => {
    expect(
      resolveDeliveryPaymentChannelForSave({
        deliveryAppCode: 'shopee',
        deliveryPaymentChannel: 'grab',
        tableName: 'Shopee #789',
        memo: '',
        paymentDeliveryApp: 240,
      })
    ).toBe('shopee')
  })
})

describe('formatPosPrintOrderTypeLabel', () => {
  const t = (k: string) =>
    k === 'posOrderTypeDelivery' ? 'Delivery' : k === 'posOrderTypeTakeout' ? 'Takeaway' : k

  it('appends Shopee platform for sf_order webhook delivery', () => {
    expect(
      formatPosPrintOrderTypeLabel({
        orderType: 'delivery',
        tableName: 'ShopeeFood #2278',
        memo: 'sf_order:778899',
        t,
      })
    ).toBe('Delivery · Shopee')
  })

  it('appends Line Man from lineman_order memo anchor', () => {
    expect(
      formatPosPrintOrderTypeLabel({
        orderType: 'delivery',
        memo: 'lineman_order:lm-5768',
        t,
      })
    ).toBe('Delivery · Line Man')
  })

  it('infers platform when orderType is already translated Thai label', () => {
    expect(
      formatPosPrintOrderTypeLabel({
        orderType: 'เดลิเวอรี่',
        tableName: 'ShopeeFood #2278',
        memo: 'sf_order:778899',
        t: (k) => (k === 'posOrderTypeDelivery' ? 'เดลิเวอรี่' : k),
      })
    ).toBe('เดลิเวอรี่ · Shopee')
  })

  it('can append channel suffix for kitchen slip', () => {
    expect(
      formatPosPrintOrderTypeLabel({
        orderType: 'delivery',
        tableName: 'ShopeeFood #2278',
        memo: 'sf_order:778899',
        t,
        includeChannelSuffix: true,
      })
    ).toBe('Delivery · Shopee · #2278')
  })
})

describe('resolvePosDeliveryPlatformDisplayName', () => {
  it('reads deliveryAppCode on order', () => {
    expect(resolvePosDeliveryPlatformDisplayName({ deliveryAppCode: 'lineman' })).toBe('Line Man')
  })
})

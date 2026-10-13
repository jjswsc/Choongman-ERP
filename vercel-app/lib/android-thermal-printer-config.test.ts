import { describe, expect, it } from 'vitest'
import {
  describeAndroidThermalTarget,
  normalizeAndroidThermalConfig,
  parseAndroidThermalConfigJson,
  resolveAndroidThermalRasterParams,
  resolveAndroidThermalTarget,
  toPrintMediaHtml,
  type AndroidThermalConfig,
} from '@/lib/android-thermal-printer-config'

const receipt = { type: 'tcp' as const, host: '192.168.1.50', port: 9100 }
const kitchen1 = { type: 'tcp' as const, host: '192.168.1.51', port: 9100 }
const kitchenAny = { type: 'bluetooth' as const, address: 'AA:BB:CC:DD:EE:FF' }

function cfg(targets: AndroidThermalConfig['targets']): AndroidThermalConfig {
  return { enabled: true, paperWidth: 80, leftOffsetMm: 2, targets }
}

describe('resolveAndroidThermalTarget', () => {
  it('receipt role uses receipt slot only', () => {
    expect(resolveAndroidThermalTarget(cfg({ receipt, kitchen1 }), { printRole: 'receipt' })).toEqual(receipt)
    expect(resolveAndroidThermalTarget(cfg({ kitchen1 }), { printRole: 'receipt' })).toBeNull()
  })

  it('kitchen station falls back kitchenN → kitchen → receipt', () => {
    const c = cfg({ receipt, kitchen1, kitchen: kitchenAny })
    expect(resolveAndroidThermalTarget(c, { printRole: 'kitchen', kitchenStation: 1 })).toEqual(kitchen1)
    expect(resolveAndroidThermalTarget(c, { printRole: 'kitchen', kitchenStation: 2 })).toEqual(kitchenAny)
    expect(resolveAndroidThermalTarget(cfg({ receipt }), { printRole: 'kitchen', kitchenStation: 3 })).toEqual(
      receipt
    )
  })

  it('missing kitchenStation is treated as station 1', () => {
    expect(resolveAndroidThermalTarget(cfg({ kitchen1 }), { printRole: 'kitchen' })).toEqual(kitchen1)
  })
})

describe('normalizeAndroidThermalConfig', () => {
  it('drops invalid targets and clamps values', () => {
    const c = normalizeAndroidThermalConfig({
      enabled: true,
      paperWidth: 58,
      leftOffsetMm: 50,
      targets: {
        receipt: { type: 'tcp', host: ' 10.0.0.9 ', port: '99999' },
        kitchen1: { type: 'bluetooth', address: 'not-a-mac' },
        kitchen2: { type: 'usb', vendorId: 1155, productId: 22304, name: 'POS-80' },
        bogus: { type: 'tcp', host: 'x' },
      },
    })
    expect(c.enabled).toBe(true)
    expect(c.paperWidth).toBe(58)
    expect(c.leftOffsetMm).toBe(8)
    expect(c.targets.receipt).toEqual({ type: 'tcp', host: '10.0.0.9', port: 9100 })
    expect(c.targets.kitchen1).toBeUndefined()
    expect(c.targets.kitchen2).toEqual({ type: 'usb', vendorId: 1155, productId: 22304, name: 'POS-80' })
    expect(Object.keys(c.targets)).not.toContain('bogus')
  })

  it('broken JSON returns disabled default', () => {
    const c = parseAndroidThermalConfigJson('{oops')
    expect(c.enabled).toBe(false)
    expect(c.targets).toEqual({})
  })

  it('bluetooth address is upper-cased', () => {
    const c = normalizeAndroidThermalConfig({
      targets: { receipt: { type: 'bluetooth', address: 'aa:bb:cc:dd:ee:ff', name: 'InnerPrinter' } },
    })
    expect(c.targets.receipt).toEqual({ type: 'bluetooth', address: 'AA:BB:CC:DD:EE:FF', name: 'InnerPrinter' })
  })
})

describe('raster params', () => {
  it('80mm prints 1:1 at 576 dots, 58mm scales the same window to 384', () => {
    expect(resolveAndroidThermalRasterParams(cfg({}))).toEqual({
      paperWidthMm: 80,
      cropWidthDots: 576,
      printWidthDots: 576,
      leftOffsetDots: 16,
    })
    expect(resolveAndroidThermalRasterParams({ ...cfg({}), paperWidth: 58 }).printWidthDots).toBe(384)
  })
})

describe('toPrintMediaHtml', () => {
  it('applies print-only rules and disables screen-only rules', () => {
    const html =
      '<style>.receipt-print-actions{margin:0} @media print { .receipt-print-actions { display: none !important; } } @media screen and (min-width: 1px) { body { zoom: 2 } }</style>'
    const out = toPrintMediaHtml(html)
    expect(out).toContain('@media all { .receipt-print-actions { display: none !important; } }')
    expect(out).toContain('@media print and (min-width: 1px)')
    expect(out).not.toMatch(/@media\s+screen/)
  })
})

describe('describeAndroidThermalTarget', () => {
  it('formats each transport', () => {
    expect(describeAndroidThermalTarget(receipt)).toBe('LAN 192.168.1.50:9100')
    expect(describeAndroidThermalTarget({ type: 'usb', vendorId: 0x0483, productId: 0x5720 })).toBe(
      'USB (0483:5720)'
    )
  })
})

import { describe, expect, it } from 'vitest'
import {
  isOfflineSafePrintImgSrc,
  stripRemoteImgSrcForThermalPrint,
} from '@/lib/pos-receipt-print-assets'

describe('pos-receipt-print-assets', () => {
  it('detects data/blob as offline-safe', () => {
    expect(isOfflineSafePrintImgSrc('data:image/png;base64,xx')).toBe(true)
    expect(isOfflineSafePrintImgSrc('blob:https://x/1')).toBe(true)
    expect(isOfflineSafePrintImgSrc('https://example.com/a.png')).toBe(false)
    expect(isOfflineSafePrintImgSrc('/company-stamp.png')).toBe(false)
  })

  it('strips https img src to transparent data uri', () => {
    const html =
      '<img src="https://cdn.example.com/logo.png" alt="x" /><img src=\'http://a/b.png\' />'
    const out = stripRemoteImgSrcForThermalPrint(html)
    expect(out).not.toContain('https://cdn.example.com')
    expect(out).not.toContain('http://a/b.png')
    expect(out).toContain('data:image/gif;base64,')
  })

  it('keeps data uri img untouched', () => {
    const html = '<img src="data:image/png;base64,abc" />'
    expect(stripRemoteImgSrcForThermalPrint(html)).toBe(html)
  })
})

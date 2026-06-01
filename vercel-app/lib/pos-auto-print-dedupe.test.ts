import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPosAutoPrintDedupeForTests,
  posPaymentAutoPrintDedupeKey,
  reservePosAutoPrintKeys,
  reservePosAutoPrintKey,
} from './pos-auto-print-dedupe'

describe('reservePosAutoPrintKey', () => {
  beforeEach(() => {
    const bag: Record<string, string> = {}
    const localStorage = {
      getItem: (k: string) => bag[k] ?? null,
      setItem: (k: string, v: string) => {
        bag[k] = v
      },
      removeItem: (k: string) => {
        delete bag[k]
      },
    }
    vi.stubGlobal('window', { localStorage })
    clearPosAutoPrintDedupeForTests()
  })

  afterEach(() => {
    clearPosAutoPrintDedupeForTests()
    vi.unstubAllGlobals()
  })

  it('allows first reservation per store+key', () => {
    expect(reservePosAutoPrintKey('MBK', 'order:1:hall:auto')).toBe(true)
    expect(reservePosAutoPrintKey('MBK', 'order:1:hall:auto')).toBe(false)
  })

  it('isolates keys by store code', () => {
    expect(reservePosAutoPrintKey('MBK', 'order:1:hall:auto')).toBe(true)
    expect(reservePosAutoPrintKey('OTHER', 'order:1:hall:auto')).toBe(true)
  })

  it('blocks synchronous double reservation (realtime + poll race)', () => {
    expect(reservePosAutoPrintKey('MBK', 'order:53:hall:auto')).toBe(true)
    expect(reservePosAutoPrintKey('MBK', 'order:53:hall:auto')).toBe(false)
  })

  it('allows different keys for same order', () => {
    expect(reservePosAutoPrintKey('MBK', 'order:1:hall:auto')).toBe(true)
    expect(reservePosAutoPrintKey('MBK', 'order:1:kitchen')).toBe(true)
    expect(reservePosAutoPrintKey('MBK', 'order:1:hall:add:2')).toBe(true)
  })

  it('dedupes payment receipt auto print', () => {
    const key = posPaymentAutoPrintDedupeKey(3190)
    expect(key).toBe('order:3190:payment:auto')
    expect(reservePosAutoPrintKey('CM Silom', key)).toBe(true)
    expect(reservePosAutoPrintKey('CM Silom', key)).toBe(false)
  })

  it('allows split payment instance keys separately', () => {
    expect(
      reservePosAutoPrintKey('CM Silom', posPaymentAutoPrintDedupeKey(10, 'dutch:A:0:x'))
    ).toBe(true)
    expect(
      reservePosAutoPrintKey('CM Silom', posPaymentAutoPrintDedupeKey(10, 'dutch:A:1:y'))
    ).toBe(true)
  })

  it('dedupes alias keys as one reservation group', () => {
    expect(
      reservePosAutoPrintKeys('MBK', ['order:60:hall:auto', 'submit:hall:2026060106'])
    ).toBe(true)
    expect(reservePosAutoPrintKey('MBK', 'order:60:hall:auto')).toBe(false)
    expect(reservePosAutoPrintKey('MBK', 'submit:hall:2026060106')).toBe(false)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPosAutoPrintDedupeForTests, reservePosAutoPrintKey } from './pos-auto-print-dedupe'

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
})

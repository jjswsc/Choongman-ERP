import { describe, expect, it } from 'vitest'
import { grabSubmitPayloadHasLineItems } from '@/lib/grab-order-to-pos'

describe('grabSubmitPayloadHasLineItems', () => {
  it('treats a non-empty items array as ready to persist', () => {
    expect(grabSubmitPayloadHasLineItems({ items: [{ id: '1' }] })).toBe(true)
  })

  it('asks Grab again when items are missing or empty', () => {
    expect(grabSubmitPayloadHasLineItems({})).toBe(false)
    expect(grabSubmitPayloadHasLineItems({ items: [] })).toBe(false)
    expect(grabSubmitPayloadHasLineItems({ items: 'x' })).toBe(false)
    expect(grabSubmitPayloadHasLineItems(null)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildPosOptionGroupCodeFromKey,
  isPosOptionGroupCodeLike,
  resolvePosOptionGroupCode,
} from '@/lib/pos-option-group-code'

describe('pos-option-group-code', () => {
  it('builds stable code from key', () => {
    expect(buildPosOptionGroupCodeFromKey('sidedish')).toBe('OG_SIDEDISH')
    expect(buildPosOptionGroupCodeFromKey('Side Dish')).toBe('OG_SIDE_DISH')
  })

  it('falls back for empty key', () => {
    expect(buildPosOptionGroupCodeFromKey('')).toBe('OG_UNSPEC')
  })

  it('validates code format', () => {
    expect(isPosOptionGroupCodeLike('OG_SIDE_DISH')).toBe(true)
    expect(isPosOptionGroupCodeLike('side')).toBe(false)
  })

  it('resolvePosOptionGroupCode prefers DB code', () => {
    expect(resolvePosOptionGroupCode({ code: 'OG_PART', key: 'sidedish' })).toBe('OG_PART')
    expect(resolvePosOptionGroupCode({ code: '', key: 'part' })).toBe('OG_PART')
  })
})

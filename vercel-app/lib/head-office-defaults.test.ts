import { describe, expect, it } from 'vitest'
import {
  HEAD_OFFICE_DEFAULTS,
  firstNonHeadOfficeAddress,
  isHeadOfficeAddress,
  pickStoreBusinessAddress,
} from '@/lib/head-office-defaults'

describe('isHeadOfficeAddress', () => {
  it('matches the S&J True Digital Park default', () => {
    expect(isHeadOfficeAddress(HEAD_OFFICE_DEFAULTS.address)).toBe(true)
    expect(
      isHeadOfficeAddress(
        '101 true digital park pegasus building, floor 5, unit 545, Sukhumvit Rd. Khwang Bang Chak, Khet Phra Khanong, Bangkok 10260'
      )
    ).toBe(true)
  })

  it('does not treat an MBK mall address as HQ', () => {
    expect(
      isHeadOfficeAddress('444 MBK Center, Phayathai Road, Wang Mai, Pathum Wan, Bangkok 10330')
    ).toBe(false)
  })
})

describe('firstNonHeadOfficeAddress', () => {
  it('skips HQ copies and returns the first real branch address', () => {
    expect(
      firstNonHeadOfficeAddress([
        HEAD_OFFICE_DEFAULTS.address,
        '',
        '444 MBK Center, Phayathai Road, Wang Mai, Pathum Wan, Bangkok 10330',
      ])
    ).toBe('444 MBK Center, Phayathai Road, Wang Mai, Pathum Wan, Bangkok 10330')
  })

  it('returns empty when every candidate is HQ or blank', () => {
    expect(firstNonHeadOfficeAddress([HEAD_OFFICE_DEFAULTS.address, '  ', '-'])).toBe('')
  })
})

describe('pickStoreBusinessAddress', () => {
  it('keeps True Digital Park for head-office stores', () => {
    expect(
      pickStoreBusinessAddress({
        isHeadOfficeStore: true,
        candidates: [HEAD_OFFICE_DEFAULTS.address],
      })
    ).toBe(HEAD_OFFICE_DEFAULTS.address)
  })

  it('skips HQ copies for branch stores', () => {
    expect(
      pickStoreBusinessAddress({
        isHeadOfficeStore: false,
        candidates: [HEAD_OFFICE_DEFAULTS.address, '444 MBK Center'],
      })
    ).toBe('444 MBK Center')
  })
})

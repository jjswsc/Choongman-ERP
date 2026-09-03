import { describe, expect, it } from 'vitest'
import { uniqueQrGuestDescriptions } from '@/lib/qr-table-guest-translate'

describe('uniqueQrGuestDescriptions', () => {
  it('collects trimmed unique descriptions', () => {
    expect(
      uniqueQrGuestDescriptions([
        { description: ' ไก่ทอด ' },
        { description: 'ไก่ทอด' },
        { descriptionDefault: 'Fried chicken' },
        { description: '' },
      ]).sort()
    ).toEqual(['Fried chicken', 'ไก่ทอด'])
  })
})

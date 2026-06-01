import { describe, expect, it } from 'vitest'
import {
  filterPosSalesStoreOptionsForManagement,
  filterPosTerminalStoreOptions,
  isPosSalesTestOfficeStoreCode,
} from './pos-sales-test-office'

describe('filterPosTerminalStoreOptions', () => {
  it('includes CM Office and other head-office codes for terminal', () => {
    const input = ['CM Office', 'CM Asoke', 'Office', '']
    expect(filterPosTerminalStoreOptions(input)).toEqual(['CM Office', 'CM Asoke', 'Office'])
  })

  it('still excludes literal test sandbox code', () => {
    expect(filterPosTerminalStoreOptions(['test', 'CM Office'])).toEqual(['CM Office'])
  })
})

describe('management vs terminal filters', () => {
  it('management filter excludes head office; terminal filter keeps it', () => {
    expect(isPosSalesTestOfficeStoreCode('CM Office')).toBe(true)
    expect(filterPosSalesStoreOptionsForManagement(['CM Office', 'CM Asoke'])).toEqual(['CM Asoke'])
    expect(filterPosTerminalStoreOptions(['CM Office', 'CM Asoke'])).toEqual([
      'CM Office',
      'CM Asoke',
    ])
  })
})

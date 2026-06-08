import { describe, expect, it } from 'vitest'
import {
  filterPosSalesStoreOptionsForManagement,
  filterPosTerminalStoreOptions,
  isPosSalesTestOfficeStoreCode,
  isSandboxStoreCode,
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

describe('isSandboxStoreCode', () => {
  it('flags test and hq only, not CM Office', () => {
    expect(isSandboxStoreCode('test')).toBe(true)
    expect(isSandboxStoreCode('HQ')).toBe(true)
    expect(isSandboxStoreCode('CM Office')).toBe(false)
    expect(isSandboxStoreCode('CM Asoke')).toBe(false)
  })
})

describe('management vs terminal filters', () => {
  it('management filter excludes head office, test, and hq; terminal filter keeps office', () => {
    expect(isPosSalesTestOfficeStoreCode('CM Office')).toBe(true)
    expect(isPosSalesTestOfficeStoreCode('test')).toBe(true)
    expect(isPosSalesTestOfficeStoreCode('HQ')).toBe(true)
    expect(filterPosSalesStoreOptionsForManagement(['CM Office', 'test', 'HQ', 'CM Asoke'])).toEqual([
      'CM Asoke',
    ])
    expect(filterPosTerminalStoreOptions(['CM Office', 'CM Asoke'])).toEqual([
      'CM Office',
      'CM Asoke',
    ])
  })
})

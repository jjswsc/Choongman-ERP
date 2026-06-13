import { describe, expect, it } from 'vitest'
import {
  buildPosTerminalStoreCodes,
  filterPosSalesStoreOptionsForManagement,
  filterPosTerminalStoreOptions,
  isPosSalesTestOfficeStoreCode,
  isSandboxStoreCode,
  isLoginExcludedStoreKey,
} from './pos-sales-test-office'

describe('buildPosTerminalStoreCodes', () => {
  it('adds CM Office from storeLabels when operational list omitted it', () => {
    expect(
      buildPosTerminalStoreCodes(['CM Asoke', 'CM Silom'], {
        'CM Office': 'CM Office',
        'CM Asoke': 'CM Asoke',
      })
    ).toEqual(['CM Asoke', 'CM Office', 'CM Silom'])
  })
})

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

describe('isLoginExcludedStoreKey', () => {
  it('excludes test only — SaaS HQ 본사 코드는 로그인 목록 허용', () => {
    expect(isLoginExcludedStoreKey('test')).toBe(true)
    expect(isLoginExcludedStoreKey('HQ')).toBe(false)
    expect(isLoginExcludedStoreKey('본사')).toBe(false)
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

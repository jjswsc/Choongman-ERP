/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  getOrCreatePosDeviceToken,
  isUsablePosDeviceToken,
  POS_DEVICE_TOKEN_COOKIE,
  POS_DEVICE_TOKEN_STORAGE_KEY,
  readPosDeviceTokenFromCookie,
} from '@/lib/pos-device-token-storage'

function clearTokenCookie() {
  document.cookie = `${POS_DEVICE_TOKEN_COOKIE}=; Path=/; Max-Age=0`
}

afterEach(() => {
  localStorage.clear()
  clearTokenCookie()
})

describe('pos-device-token-storage', () => {
  it('validates tokens', () => {
    expect(isUsablePosDeviceToken('1791596-abcdefghij')).toBe(true)
    expect(isUsablePosDeviceToken('short')).toBe(false)
    expect(isUsablePosDeviceToken('has space here x')).toBe(false)
    expect(isUsablePosDeviceToken(null)).toBe(false)
  })

  it('reads the token cookie among others', () => {
    expect(readPosDeviceTokenFromCookie(`a=1; ${POS_DEVICE_TOKEN_COOKIE}=1791596-abcdefghij; b=2`)).toBe(
      '1791596-abcdefghij'
    )
    expect(readPosDeviceTokenFromCookie('a=1')).toBe('')
  })

  it('restores the same token from cookie after localStorage is wiped', () => {
    const first = getOrCreatePosDeviceToken()
    expect(isUsablePosDeviceToken(first)).toBe(true)
    localStorage.clear()
    expect(getOrCreatePosDeviceToken()).toBe(first)
    expect(localStorage.getItem(POS_DEVICE_TOKEN_STORAGE_KEY)).toBe(first)
  })

  it('keeps existing localStorage token and backs it up to cookie', () => {
    localStorage.setItem(POS_DEVICE_TOKEN_STORAGE_KEY, '1775550000-existing01')
    expect(getOrCreatePosDeviceToken()).toBe('1775550000-existing01')
    expect(readPosDeviceTokenFromCookie(document.cookie)).toBe('1775550000-existing01')
  })
})

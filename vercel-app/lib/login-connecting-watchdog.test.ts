import { describe, expect, it } from 'vitest'
import {
  LOGIN_CONNECTING_REPLACES_FORM,
  LOGIN_CONNECTING_WATCHDOG_MS,
  LOGIN_LIST_FETCH_TIMEOUT_KIOSK_MS,
  LOGIN_SESSION_REDIRECT_BOUNCE_MS,
  isLoginSessionRedirectBounce,
  loginListFetchTimeoutMs,
  resolveLoginBootPhase,
  shouldHardNavigateLoginSessionRedirect,
} from './login-connecting-watchdog'

describe('LOGIN_CONNECTING_REPLACES_FORM', () => {
  it('never hides the login form behind a spinner-only screen', () => {
    expect(LOGIN_CONNECTING_REPLACES_FORM).toBe(false)
  })
})

describe('resolveLoginBootPhase', () => {
  it('waits until auth storage has been read', () => {
    expect(
      resolveLoginBootPhase({ authInitialized: false, hasSession: true, stayOnLoginForm: false })
    ).toBe('wait_auth')
  })

  it('redirects an existing session after init', () => {
    expect(
      resolveLoginBootPhase({ authInitialized: true, hasSession: true, stayOnLoginForm: false })
    ).toBe('redirect_session')
  })

  it('loads the store list when there is no session', () => {
    expect(
      resolveLoginBootPhase({ authInitialized: true, hasSession: false, stayOnLoginForm: false })
    ).toBe('load_list')
  })

  it('stays on the form after a bounce instead of redirecting again', () => {
    expect(
      resolveLoginBootPhase({ authInitialized: true, hasSession: true, stayOnLoginForm: true })
    ).toBe('load_list')
  })
})

describe('isLoginSessionRedirectBounce', () => {
  it('detects a return to login shortly after a session redirect', () => {
    const start = 1_000_000
    expect(isLoginSessionRedirectBounce(String(start), start + 1_000)).toBe(true)
    expect(isLoginSessionRedirectBounce(String(start), start + LOGIN_SESSION_REDIRECT_BOUNCE_MS + 1)).toBe(
      false
    )
    expect(isLoginSessionRedirectBounce(null, start)).toBe(false)
  })
})

describe('shouldHardNavigateLoginSessionRedirect', () => {
  it('uses hard navigation on Android tablets and installed PWA', () => {
    expect(
      shouldHardNavigateLoginSessionRedirect({
        isHybridShell: false,
        isStandaloneDisplay: false,
        userAgent: 'Mozilla/5.0 (Linux; Android 12; BAH3-W59) AppleWebKit/537.36',
      })
    ).toBe(true)
    expect(
      shouldHardNavigateLoginSessionRedirect({
        isHybridShell: false,
        isStandaloneDisplay: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      })
    ).toBe(true)
    expect(
      shouldHardNavigateLoginSessionRedirect({
        isHybridShell: true,
        isStandaloneDisplay: false,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      })
    ).toBe(true)
  })

  it('keeps client navigation on desktop browser tabs', () => {
    expect(
      shouldHardNavigateLoginSessionRedirect({
        isHybridShell: false,
        isStandaloneDisplay: false,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126',
      })
    ).toBe(false)
  })
})

describe('loginListFetchTimeoutMs', () => {
  it('fails fast on kiosk tablets so the form is usable', () => {
    expect(
      loginListFetchTimeoutMs({ hybridOfflineFastPath: false, kioskClient: true })
    ).toBe(LOGIN_LIST_FETCH_TIMEOUT_KIOSK_MS)
    expect(LOGIN_LIST_FETCH_TIMEOUT_KIOSK_MS).toBeLessThan(LOGIN_CONNECTING_WATCHDOG_MS * 2)
  })

  it('keeps a longer desktop timeout and a 3s hybrid offline path', () => {
    expect(loginListFetchTimeoutMs({ hybridOfflineFastPath: true, kioskClient: true })).toBe(3_000)
    expect(loginListFetchTimeoutMs({ hybridOfflineFastPath: false, kioskClient: false })).toBe(60_000)
  })
})

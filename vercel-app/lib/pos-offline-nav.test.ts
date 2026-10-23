import { describe, expect, it } from 'vitest'
import {
  canSoftNavigateWithinPos,
  isPosLoginPathname,
  shouldHardNavigatePos,
} from '@/lib/pos-offline-nav'

describe('isPosLoginPathname', () => {
  it('matches /pos/login with optional trailing slash or query', () => {
    expect(isPosLoginPathname('/pos/login')).toBe(true)
    expect(isPosLoginPathname('/pos/login/')).toBe(true)
    expect(isPosLoginPathname('/pos/login?x=1')).toBe(true)
    expect(isPosLoginPathname('/pos')).toBe(false)
    expect(isPosLoginPathname('/pos/terminal')).toBe(false)
  })
})

describe('shouldHardNavigatePos', () => {
  it('always hard-navigates when leaving the POS login screen', () => {
    expect(
      shouldHardNavigatePos({
        path: '/pos',
        currentPathname: '/pos/login',
        browserOnline: true,
        sessionPreferHardNav: false,
      })
    ).toBe(true)
    expect(
      shouldHardNavigatePos({
        path: '/pos/terminal',
        currentPathname: '/pos/login/',
        browserOnline: true,
        sessionPreferHardNav: false,
      })
    ).toBe(true)
  })

  it('uses soft path when already inside POS and online without session flag', () => {
    expect(
      shouldHardNavigatePos({
        path: '/pos/terminal',
        currentPathname: '/pos',
        browserOnline: true,
        sessionPreferHardNav: false,
      })
    ).toBe(false)
  })

  it('hard-navigates when offline or session prefers hard nav', () => {
    expect(
      shouldHardNavigatePos({
        path: '/pos/terminal',
        currentPathname: '/pos',
        browserOnline: false,
        sessionPreferHardNav: false,
      })
    ).toBe(true)
    expect(
      shouldHardNavigatePos({
        path: '/pos/terminal',
        currentPathname: '/pos',
        browserOnline: true,
        sessionPreferHardNav: true,
      })
    ).toBe(true)
  })
})

describe('canSoftNavigateWithinPos', () => {
  it('forbids soft nav away from login (prevents white screen after PIN)', () => {
    expect(
      canSoftNavigateWithinPos({
        currentPathname: '/pos/login',
        currentFull: '/pos/login',
        targetPath: '/pos/terminal',
      })
    ).toBe(false)
  })

  it('allows soft nav between POS sub-routes when already in shell', () => {
    expect(
      canSoftNavigateWithinPos({
        currentPathname: '/pos',
        currentFull: '/pos',
        targetPath: '/pos/terminal',
      })
    ).toBe(true)
  })
})

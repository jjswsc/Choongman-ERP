import { describe, expect, it } from 'vitest'
import {
  shouldReloadMemberPortalAfterSwUnregister,
  shouldReloadMemberPortalForNewBuild,
} from '@/lib/member-portal-shell-refresh'

describe('shouldReloadMemberPortalAfterSwUnregister', () => {
  it('reloads once when a service worker was controlling the page', () => {
    expect(shouldReloadMemberPortalAfterSwUnregister({ hadController: true, alreadyReloaded: false })).toBe(true)
    expect(shouldReloadMemberPortalAfterSwUnregister({ hadController: true, alreadyReloaded: true })).toBe(false)
    expect(shouldReloadMemberPortalAfterSwUnregister({ hadController: false, alreadyReloaded: false })).toBe(false)
  })
})

describe('shouldReloadMemberPortalForNewBuild', () => {
  it('reloads when the live /m HTML points at a newer webpack chunk', () => {
    expect(
      shouldReloadMemberPortalForNewBuild({
        currentStamp: '/_next/static/chunks/webpack-old.js',
        networkHtml: '<script src="/_next/static/chunks/webpack-new.js"></script>',
        alreadyReloaded: false,
      })
    ).toBe(true)
  })

  it('does not loop after one reload', () => {
    expect(
      shouldReloadMemberPortalForNewBuild({
        currentStamp: '/_next/static/chunks/webpack-old.js',
        networkHtml: '<script src="/_next/static/chunks/webpack-new.js"></script>',
        alreadyReloaded: true,
      })
    ).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  MEMBER_PORTAL_SHELL_RELOAD_KEY,
  isMemberPortalStaleCacheName,
  memberPortalShellBootstrapInlineScript,
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

describe('isMemberPortalStaleCacheName', () => {
  it('matches serwist / member-portal document caches', () => {
    expect(isMemberPortalStaleCacheName('serwist-precache-v2')).toBe(true)
    expect(isMemberPortalStaleCacheName('member-portal-document')).toBe(true)
    expect(isMemberPortalStaleCacheName('workbox-runtime')).toBe(true)
    expect(isMemberPortalStaleCacheName('unrelated-images')).toBe(false)
  })
})

describe('memberPortalShellBootstrapInlineScript', () => {
  it('embeds the v2 reload key and does not reference React', () => {
    const src = memberPortalShellBootstrapInlineScript()
    expect(src).toContain(MEMBER_PORTAL_SHELL_RELOAD_KEY)
    expect(src).toContain('serviceWorker')
    expect(src).toContain('unregister')
    expect(src).not.toContain('React')
  })
})

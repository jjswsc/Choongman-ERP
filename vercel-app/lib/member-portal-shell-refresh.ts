import {
  extractSharedNextBuildStamp,
  shouldReloadForNewWebBuild,
} from '@/lib/web-build-stamp'

export const MEMBER_PORTAL_SHELL_RELOAD_KEY = 'cm_member_shell_reload'

export function shouldReloadMemberPortalAfterSwUnregister(opts: {
  hadController: boolean
  alreadyReloaded: boolean
}): boolean {
  return opts.hadController && !opts.alreadyReloaded
}

export function shouldReloadMemberPortalForNewBuild(opts: {
  currentStamp: string
  networkHtml: string
  alreadyReloaded: boolean
}): boolean {
  if (opts.alreadyReloaded) return false
  return shouldReloadForNewWebBuild(opts.currentStamp, extractSharedNextBuildStamp(opts.networkHtml))
}

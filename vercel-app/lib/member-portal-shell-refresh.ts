import {
  extractSharedNextBuildStamp,
  shouldReloadForNewWebBuild,
} from '@/lib/web-build-stamp'

/** v2: 이전 복구 키가 남아 재시도가 막히던 경우 한 번 더 돌리기 */
export const MEMBER_PORTAL_SHELL_RELOAD_KEY = 'cm_member_shell_reload_v2'

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

/** SW/Cache Storage 이름 — 회원앱 깨진 HTML·옛 프리캐시 제거용 */
export function isMemberPortalStaleCacheName(cacheName: string): boolean {
  return /serwist|workbox|precache|member-portal|next-static|start-url/i.test(String(cacheName || ''))
}

/**
 * React 청크가 깨져도 동작해야 하므로 layout에 인라인으로 넣는다.
 * SW가 /m 을 제어 중이면 등록 해제·관련 캐시 삭제 후 1회 새로고침.
 */
export function memberPortalShellBootstrapInlineScript(): string {
  const key = MEMBER_PORTAL_SHELL_RELOAD_KEY
  return `(function(){try{var k=${JSON.stringify(key)};if(sessionStorage.getItem(k)==="1")return;var sw=navigator.serviceWorker;if(!sw||!sw.controller)return;sessionStorage.setItem(k,"1");var done=function(){location.reload()};var wipe=function(){if(!self.caches||!caches.keys)return Promise.resolve();return caches.keys().then(function(keys){return Promise.all(keys.filter(function(n){return /serwist|workbox|precache|member-portal|next-static|start-url/i.test(n)}).map(function(n){return caches.delete(n)}))})};sw.getRegistrations().then(function(regs){return Promise.all(regs.map(function(r){return r.unregister()}))}).then(wipe).then(done).catch(done)}catch(e){}})();`
}

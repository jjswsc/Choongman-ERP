/** 다른 메뉴에 있다가 캐시된 화면으로 돌아올 때 기존 React 트리를 재사용할지 판단 */
export function shouldReuseKeepAliveCacheEntry(
  previousCacheHref: string | null,
  cacheHref: string,
  hasCachedEntry: boolean
): boolean {
  return (
    previousCacheHref !== null &&
    previousCacheHref !== cacheHref &&
    hasCachedEntry
  )
}

/** 캐시된 React 트리를 재사용할지 판단 — stamp가 맞고 엔트리가 있으면 항상 재사용 */
export function shouldReuseKeepAliveCacheEntry(
  _previousCacheHref: string | null,
  _cacheHref: string,
  hasMatchingCachedEntry: boolean
): boolean {
  // 같은 경로 재렌더·쿼리만 바뀐 경우에도 검색/필터 state를 지키려면
  // 「다른 메뉴에서 복귀」뿐 아니라 stamp가 유효한 캐시가 있으면 재사용한다.
  // (탭 새로고침은 remount stamp를 올려 hasMatchingCachedEntry=false로 만듦)
  void _previousCacheHref
  void _cacheHref
  return hasMatchingCachedEntry
}

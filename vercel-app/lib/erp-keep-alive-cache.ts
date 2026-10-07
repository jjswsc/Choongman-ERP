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

export function queryOfErpHref(href: string): string {
  const i = href.indexOf("?")
  return i >= 0 ? href.slice(i + 1) : ""
}

/**
 * 다른 메뉴에서 쿼리 없는 주소로 돌아오면, 조회에 쓰던 쿼리를 유지한다.
 * 사이드바 링크는 pathname만 있어서 그대로 따르면 탭·기간·매장이 풀리고 목록이 지워진다.
 * 이 화면에 머무른 채 쿼리가 생기면(필터·딥링크) 그 주소를 따른다.
 */
export function advanceKeepAliveSlotUrl(input: {
  storedFullHref: string
  liveHref: string
  holdStoredQuery: boolean
  returningFromOtherPage: boolean
}): { fullHref: string; holdStoredQuery: boolean } {
  const storedQ = queryOfErpHref(input.storedFullHref)
  const liveQ = queryOfErpHref(input.liveHref)
  if (input.returningFromOtherPage && storedQ && !liveQ) {
    return { fullHref: input.storedFullHref, holdStoredQuery: true }
  }
  if (input.holdStoredQuery && !liveQ) {
    return { fullHref: input.storedFullHref, holdStoredQuery: true }
  }
  return { fullHref: input.liveHref, holdStoredQuery: false }
}

/**
 * 숨긴 슬롯은 마지막으로 보던 주소(쿼리 포함)를 유지한다.
 * 활성 슬롯은 holdStoredQuery가 켜져 있으면 저장된 조회 주소를 그대로 쓴다.
 */
export function resolveKeepAliveSlotFullHref(input: {
  storedFullHref: string | undefined
  liveHref: string
  slotIsLive: boolean
  holdStoredQuery?: boolean
}): string {
  const stored = (input.storedFullHref || "").trim()
  if (!input.slotIsLive) return stored || input.liveHref
  if (input.holdStoredQuery && stored) return stored
  return input.liveHref
}

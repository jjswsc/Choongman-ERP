"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  consumeErpBackEvictHref,
  normalizeErpHref,
  useErpNavigationOptional,
} from "@/lib/erp-navigation"
import {
  isErpKeepAliveExcluded,
  resolveErpKeepAliveCacheHref,
} from "@/lib/erp-keep-alive-config"
import {
  advanceKeepAliveSlotUrl,
  resolveKeepAliveSlotFullHref,
  shouldReuseKeepAliveCacheEntry,
} from "@/lib/erp-keep-alive-cache"
import { ErpKeepAliveRouterScope } from "@/lib/erp-keep-alive-router-scope"
import {
  getErpKeepAliveRemountStamp,
  subscribeErpKeepAliveRemount,
} from "@/lib/erp-keep-alive-remount"
import { reportErpKeepAliveCacheKeys } from "@/lib/erp-keep-alive-registry"
import { ErpPageVisibilityProvider } from "@/lib/erp-page-visibility"
import {
  getErpWorkspaceTabHrefs,
  subscribeErpWorkspaceTabs,
} from "@/lib/erp-workspace-tabs"

/** 워크스페이스 탭 상한과 동일 */
const MAX_CACHED_PAGES = 12

type CacheEntry = {
  node: React.ReactNode
  lastSeen: number
  stamp: number
  /** 이 슬롯이 마지막으로 활성일 때의 pathname+search. 숨김 중 URL 고정에 사용 */
  fullHref: string
  /** 다른 메뉴에서 쿼리 없는 주소로 돌아온 뒤, 조회 쿼리를 유지 */
  holdStoredQuery: boolean
}

/**
 * 캐시된 children 참조가 같으면 Next layout router를 다시 실행하지 않는다.
 * 부모 리렌더마다 InnerLayoutRouter가 돌면 숨긴 페이지 state가 비워진다.
 */
const KeepAliveFrozenTree = React.memo(function KeepAliveFrozenTree({
  node,
}: {
  node: React.ReactNode
}) {
  return <>{node}</>
})

/** 워크스페이스 탭 ∪ 현재·표시 경로에 없는 캐시만 제거 */
function syncCacheWithWorkspaceTabs(
  cache: Map<string, CacheEntry>,
  currentHref: string,
  displayHref?: string
) {
  const allowed = new Set(getErpWorkspaceTabHrefs())
  allowed.add(currentHref)
  if (displayHref) allowed.add(displayHref)
  for (const key of cache.keys()) {
    if (!allowed.has(key)) {
      cache.delete(key)
    }
  }
}

/**
 * 관리자 메뉴 이동 시 페이지를 unmount하지 않고 숨김 보관.
 * softDisplayHref가 있으면 라우터 pathname과 달라도 해당 캐시 슬롯을 표시한다.
 *
 * 숨긴 슬롯은 ErpKeepAliveRouterScope로 마지막 조회 주소에 고정한다.
 * 전역 usePathname을 그대로 쓰면 다른 메뉴 쿼리가 조회 결과를 지운다.
 */
export function AdminPageKeepAlive({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const erpNav = useErpNavigationOptional()
  const cacheRef = React.useRef(new Map<string, CacheEntry>())
  const prevCacheHrefRef = React.useRef<string | null>(null)
  const [, bump] = React.useReducer((n: number) => n + 1, 0)

  const href = React.useMemo(() => {
    const qs = searchParams.toString()
    return normalizeErpHref(pathname || "", qs ? `?${qs}` : "")
  }, [pathname, searchParams])

  /** Next 라우터 기준 — children이 속한 슬롯 */
  const cacheHref = React.useMemo(() => resolveErpKeepAliveCacheHref(href), [href])
  /**
   * 표시 슬롯 = 라우터만 따른다.
   * softDisplayHref로 바꾸면 라우터는 옛 페이지인데 슬롯만 바꾸려다 miss 시
   * 조회 화면에 고정되는 핑퐁이 난다. 조회 유지는 스냅샷·fiber 재사용으로 한다.
   */
  const displayHref = cacheHref

  const remountStamp = getErpKeepAliveRemountStamp(cacheHref)
  const keepAliveCurrent = !isErpKeepAliveExcluded(href)

  const prevCacheHref = prevCacheHrefRef.current
  const existing = cacheRef.current.get(cacheHref)
  const stampMatches = existing != null && existing.stamp === remountStamp
  // stamp가 같으면 같은 경로 재렌더·다른 탭 복귀 모두 기존 트리 유지(검색·필터 보존)
  const reactivating = shouldReuseKeepAliveCacheEntry(
    prevCacheHref,
    cacheHref,
    stampMatches
  )

  if (keepAliveCurrent) {
    if (existing && reactivating) {
      existing.lastSeen = Date.now()
      const nextUrl = advanceKeepAliveSlotUrl({
        storedFullHref: existing.fullHref || href,
        liveHref: href,
        holdStoredQuery: existing.holdStoredQuery === true,
        returningFromOtherPage: prevCacheHref != null && prevCacheHref !== cacheHref,
      })
      existing.fullHref = nextUrl.fullHref
      existing.holdStoredQuery = nextUrl.holdStoredQuery
    } else {
      cacheRef.current.set(cacheHref, {
        node: children,
        lastSeen: Date.now(),
        stamp: remountStamp,
        fullHref: href,
        holdStoredQuery: false,
      })
    }
  }

  prevCacheHrefRef.current = cacheHref

  // soft 탭 전환이 useEffect 전에 캐시를 보도록 동기 보고
  reportErpKeepAliveCacheKeys(cacheRef.current.keys())

  const publishKeys = React.useCallback(() => {
    reportErpKeepAliveCacheKeys(cacheRef.current.keys())
  }, [])

  const clearAll = React.useCallback(() => {
    if (cacheRef.current.size === 0) return
    cacheRef.current.clear()
    publishKeys()
    bump()
  }, [publishKeys])

  React.useEffect(() => {
    if (!erpNav) return
    return erpNav.registerPageClearListener(clearAll)
  }, [erpNav, clearAll])

  React.useEffect(() => {
    const evictHref = consumeErpBackEvictHref()
    if (evictHref && cacheRef.current.delete(resolveErpKeepAliveCacheHref(evictHref))) bump()
    syncCacheWithWorkspaceTabs(cacheRef.current, cacheHref, displayHref)
    publishKeys()
    if (erpNav) erpNav.notifyKeepAliveCount(cacheRef.current.size)
  }, [cacheHref, displayHref, erpNav, publishKeys])

  React.useEffect(() => {
    return subscribeErpWorkspaceTabs(() => {
      syncCacheWithWorkspaceTabs(cacheRef.current, cacheHref, displayHref)
      publishKeys()
      bump()
      if (erpNav) erpNav.notifyKeepAliveCount(cacheRef.current.size)
    })
  }, [cacheHref, displayHref, erpNav, publishKeys])

  React.useEffect(() => {
    return subscribeErpKeepAliveRemount((remountHref) => {
      if (cacheRef.current.delete(remountHref)) bump()
      else bump()
      publishKeys()
    })
  }, [publishKeys])

  React.useEffect(() => {
    const entries = cacheRef.current
    if (entries.size <= MAX_CACHED_PAGES) return

    const sorted = Array.from(entries.entries())
      .filter(([key]) => key !== cacheHref && key !== displayHref)
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen)

    const excess = entries.size - MAX_CACHED_PAGES
    for (let i = 0; i < excess && i < sorted.length; i++) {
      entries.delete(sorted[i][0])
    }
    publishKeys()
    bump()
  }, [cacheHref, displayHref, publishKeys])

  // soft 전환 시 표시 슬롯만 바뀌므로 리렌더
  React.useEffect(() => {
    bump()
  }, [displayHref])

  const entries = Array.from(cacheRef.current.entries())
  const effectiveDisplayHref = displayHref

  // 잔여 soft가 있으면 해제(표시는 라우터만 사용)
  React.useEffect(() => {
    if (!erpNav?.softDisplayHref) return
    erpNav.clearSoftDisplayHref()
  }, [erpNav, erpNav?.softDisplayHref])

  const hiddenSlotClass =
    "pointer-events-none invisible absolute inset-0 -z-10 overflow-hidden opacity-0"
  const activeSlotClass = "flex min-h-0 flex-1 flex-col"

  const renderCachedSlot = (key: string, entry: CacheEntry, active: boolean) => {
    const slotFullHref = resolveKeepAliveSlotFullHref({
      storedFullHref: entry.fullHref,
      liveHref: href,
      slotIsLive: active && keepAliveCurrent,
      holdStoredQuery: entry.holdStoredQuery === true,
    })
    return (
      <ErpPageVisibilityProvider key={key} active={active}>
        <ErpKeepAliveRouterScope fullHref={slotFullHref}>
          <div
            className={active ? activeSlotClass : hiddenSlotClass}
            hidden={!active}
            aria-hidden={!active}
            data-erp-keep-alive={key}
          >
            <KeepAliveFrozenTree node={entry.node} />
          </div>
        </ErpKeepAliveRouterScope>
      </ErpPageVisibilityProvider>
    )
  }

  /**
   * 제외 경로(실시간 매출 등)는 캐시에 넣지 않지만,
   * 이미 열어 둔 keep-alive 탭 트리는 unmount하면 안 된다(상태 증발).
   * 숨긴 슬롯은 자기 fullHref로 pathname/search를 고정한다.
   */
  if (!keepAliveCurrent) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        {entries.map(([key, entry]) => renderCachedSlot(key, entry, false))}
        <ErpPageVisibilityProvider active={true}>
          <div className={activeSlotClass} data-erp-keep-alive-live={cacheHref}>
            {children}
          </div>
        </ErpPageVisibilityProvider>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <ErpPageVisibilityProvider active={true}>
        <div className={activeSlotClass}>{children}</div>
      </ErpPageVisibilityProvider>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {entries.map(([key, entry]) => renderCachedSlot(key, entry, key === effectiveDisplayHref))}
    </div>
  )
}

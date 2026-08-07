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
import { shouldReuseKeepAliveCacheEntry } from "@/lib/erp-keep-alive-cache"
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
}

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
  /** 실제 화면에 보여줄 슬롯 (soft 탭 전환 포함) */
  const displayHref = React.useMemo(() => {
    if (erpNav?.softDisplayHref) return resolveErpKeepAliveCacheHref(erpNav.softDisplayHref)
    return cacheHref
  }, [erpNav?.softDisplayHref, cacheHref])

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
    } else {
      cacheRef.current.set(cacheHref, {
        node: children,
        lastSeen: Date.now(),
        stamp: remountStamp,
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
  const hasDisplaySlot = entries.some(([key]) => key === displayHref)
  const effectiveDisplayHref = hasDisplaySlot || entries.length === 0 ? displayHref : cacheHref

  React.useEffect(() => {
    if (!erpNav?.softDisplayHref) return
    if (hasDisplaySlot || entries.length === 0) return
    erpNav.clearSoftDisplayHref()
  }, [erpNav, hasDisplaySlot, entries.length, displayHref])

  const hiddenSlotClass =
    "pointer-events-none invisible absolute inset-0 -z-10 overflow-hidden opacity-0"
  const activeSlotClass = "flex min-h-0 flex-1 flex-col"

  /**
   * 제외 경로(급여·재고 등)는 캐시에 넣지 않지만,
   * 이미 열어 둔 keep-alive 탭 트리는 unmount하면 안 된다(상태 증발).
   * soft로 keep-alive 탭을 보여주는 중이면 아래 일반 분기로 캐시 슬롯을 표시한다.
   */
  if (!keepAliveCurrent && !erpNav?.softDisplayHref) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        {entries.map(([key, { node }]) => (
          <ErpPageVisibilityProvider key={key} active={false}>
            <div
              className={hiddenSlotClass}
              hidden
              aria-hidden
              data-erp-keep-alive={key}
            >
              {node}
            </div>
          </ErpPageVisibilityProvider>
        ))}
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
      {entries.map(([key, { node }]) => {
        const active = key === effectiveDisplayHref
        return (
          <ErpPageVisibilityProvider key={key} active={active}>
            <div
              className={active ? activeSlotClass : hiddenSlotClass}
              hidden={!active}
              aria-hidden={!active}
              data-erp-keep-alive={key}
            >
              {node}
            </div>
          </ErpPageVisibilityProvider>
        )
      })}
    </div>
  )
}

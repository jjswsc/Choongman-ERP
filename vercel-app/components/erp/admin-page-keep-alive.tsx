"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  consumeErpBackEvictHref,
  getErpNavigationStack,
  normalizeErpHref,
  useErpNavigationOptional,
} from "@/lib/erp-navigation"
import {
  isErpKeepAliveExcluded,
  resolveErpKeepAliveCacheHref,
} from "@/lib/erp-keep-alive-config"
import { shouldReuseKeepAliveCacheEntry } from "@/lib/erp-keep-alive-cache"
import { ErpPageVisibilityProvider } from "@/lib/erp-page-visibility"

const MAX_CACHED_PAGES = 16

type CacheEntry = {
  node: React.ReactNode
  lastSeen: number
}

function syncCacheWithNavigationStack(
  cache: Map<string, CacheEntry>,
  currentHref: string
) {
  const stack = getErpNavigationStack()
  for (const key of cache.keys()) {
    if (key !== currentHref && !stack.includes(key)) {
      cache.delete(key)
    }
  }
}

/**
 * 관리자 메뉴 이동 시 페이지를 unmount하지 않고 숨김 보관.
 * 다른 메뉴에 있다가 돌아올 때(사이드바·헤더 뒤로가기) 캐시된 인스턴스를 재사용한다.
 * 화면 닫기·스택 밖·캐시 한도 초과 시에만 제거한다.
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

  const cacheHref = React.useMemo(() => resolveErpKeepAliveCacheHref(href), [href])

  const keepAliveCurrent = !isErpKeepAliveExcluded(href)

  const prevCacheHref = prevCacheHrefRef.current
  const reactivating = shouldReuseKeepAliveCacheEntry(
    prevCacheHref,
    cacheHref,
    cacheRef.current.has(cacheHref)
  )

  if (keepAliveCurrent) {
    const existing = cacheRef.current.get(cacheHref)
    if (existing && reactivating) {
      existing.lastSeen = Date.now()
    } else {
      cacheRef.current.set(cacheHref, { node: children, lastSeen: Date.now() })
    }
  }

  prevCacheHrefRef.current = cacheHref

  const clearAll = React.useCallback(() => {
    if (cacheRef.current.size === 0) return
    cacheRef.current.clear()
    bump()
  }, [])

  React.useEffect(() => {
    if (!erpNav) return
    return erpNav.registerPageClearListener(clearAll)
  }, [erpNav, clearAll])

  React.useEffect(() => {
    const evictHref = consumeErpBackEvictHref()
    if (evictHref && cacheRef.current.delete(evictHref)) bump()
    syncCacheWithNavigationStack(cacheRef.current, cacheHref)
    if (erpNav) erpNav.notifyKeepAliveCount(cacheRef.current.size)
  }, [cacheHref, erpNav])

  React.useEffect(() => {
    const entries = cacheRef.current
    if (entries.size <= MAX_CACHED_PAGES) return

    const sorted = Array.from(entries.entries())
      .filter(([key]) => key !== cacheHref)
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen)

    const excess = entries.size - MAX_CACHED_PAGES
    for (let i = 0; i < excess && i < sorted.length; i++) {
      entries.delete(sorted[i][0])
    }
    bump()
  }, [cacheHref])

  if (!keepAliveCurrent) {
    return (
      <ErpPageVisibilityProvider active={true}>
        <div className="min-h-0 flex-1 flex flex-col">{children}</div>
      </ErpPageVisibilityProvider>
    )
  }

  const entries = Array.from(cacheRef.current.entries())

  if (entries.length === 0) {
    return (
      <ErpPageVisibilityProvider active={true}>
        <div className="min-h-0 flex-1 flex flex-col">{children}</div>
      </ErpPageVisibilityProvider>
    )
  }

  return (
    <div className="relative min-h-0 flex-1">
      {entries.map(([key, { node }]) => {
        const active = key === cacheHref
        return (
          <ErpPageVisibilityProvider key={key} active={active}>
            <div
              className={
                active
                  ? "min-h-0 flex-1 flex flex-col"
                  : "pointer-events-none invisible absolute inset-0 -z-10 overflow-hidden opacity-0"
              }
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

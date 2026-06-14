"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  consumeErpBackEvictHref,
  getErpNavigationStack,
  normalizeErpHref,
  useErpNavigationOptional,
} from "@/lib/erp-navigation"
import { isErpKeepAliveExcluded } from "@/lib/erp-keep-alive-config"
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
 * 뒤로가기·화면 닫기·브라우저 뒤로가기 시 스택 밖 캐시는 제거한다.
 */
export function AdminPageKeepAlive({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const erpNav = useErpNavigationOptional()
  const cacheRef = React.useRef(new Map<string, CacheEntry>())
  const [, bump] = React.useReducer((n: number) => n + 1, 0)

  const href = React.useMemo(() => {
    const qs = searchParams.toString()
    return normalizeErpHref(pathname || "", qs ? `?${qs}` : "")
  }, [pathname, searchParams])

  const keepAliveCurrent = !isErpKeepAliveExcluded(href)

  if (keepAliveCurrent) {
    cacheRef.current.set(href, { node: children, lastSeen: Date.now() })
  }

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
    syncCacheWithNavigationStack(cacheRef.current, href)
    if (erpNav) erpNav.notifyKeepAliveCount(cacheRef.current.size)
  }, [href, erpNav])

  React.useEffect(() => {
    const entries = cacheRef.current
    if (entries.size <= MAX_CACHED_PAGES) return

    const sorted = Array.from(entries.entries())
      .filter(([key]) => key !== href)
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen)

    const excess = entries.size - MAX_CACHED_PAGES
    for (let i = 0; i < excess && i < sorted.length; i++) {
      entries.delete(sorted[i][0])
    }
    bump()
  }, [href])

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
        const active = key === href
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

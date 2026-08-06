/**
 * keep-alive 캐시 키 레지스트리 — 워크스페이스 탭 soft navigate(캐시 hit) 판정용.
 */

import { resolveErpKeepAliveCacheHref } from "@/lib/erp-keep-alive-config"

let cachedKeys = new Set<string>()

export function reportErpKeepAliveCacheKeys(hrefs: Iterable<string>): void {
  cachedKeys = new Set(
    Array.from(hrefs, (h) => resolveErpKeepAliveCacheHref(h)).filter(Boolean)
  )
}

export function hasErpKeepAliveCache(href: string): boolean {
  return cachedKeys.has(resolveErpKeepAliveCacheHref(href))
}

export function clearErpKeepAliveCacheRegistry(): void {
  cachedKeys = new Set()
}

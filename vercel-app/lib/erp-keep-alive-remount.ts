/**
 * keep-alive 슬롯 강제 리마운트(탭 새로고침).
 * 캐시 키는 그대로 두고 stamp만 올려 해당 슬롯을 다시 채운다.
 */

import { resolveErpKeepAliveCacheHref } from "@/lib/erp-keep-alive-config"

const REMOUNT_KEY = "erp_keep_alive_remount_v1"
export const ERP_KEEP_ALIVE_REMOUNT_EVENT = "erp-keep-alive-remount"

type RemountMap = Record<string, number>

function readMap(): RemountMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = sessionStorage.getItem(REMOUNT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as RemountMap
  } catch {
    return {}
  }
}

function writeMap(map: RemountMap) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(REMOUNT_KEY, JSON.stringify(map))
}

export function getErpKeepAliveRemountStamp(href: string): number {
  const key = resolveErpKeepAliveCacheHref(href)
  return Number(readMap()[key]) || 0
}

export function bumpErpKeepAliveRemount(href: string): number {
  if (typeof window === "undefined") return 0
  const key = resolveErpKeepAliveCacheHref(href)
  const map = readMap()
  const next = (Number(map[key]) || 0) + 1
  map[key] = next
  writeMap(map)
  window.dispatchEvent(new CustomEvent(ERP_KEEP_ALIVE_REMOUNT_EVENT, { detail: key }))
  return next
}

export function clearErpKeepAliveRemountStamps(): void {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(REMOUNT_KEY)
}

export function subscribeErpKeepAliveRemount(listener: (href: string) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const onEvent = (e: Event) => {
    const href = (e as CustomEvent<string>).detail
    if (typeof href === "string" && href) listener(href)
  }
  window.addEventListener(ERP_KEEP_ALIVE_REMOUNT_EVENT, onEvent)
  return () => window.removeEventListener(ERP_KEEP_ALIVE_REMOUNT_EVENT, onEvent)
}

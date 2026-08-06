/**
 * ERP 상단 워크스페이스 탭 — 히스토리 스택과 별도로 열린 메뉴를 유지한다.
 * keep-alive 캐시 키와 맞추기 위해 resolveErpKeepAliveCacheHref를 사용한다.
 */

import {
  normalizeErpPathOnly,
  resolveErpKeepAliveCacheHref,
} from "@/lib/erp-keep-alive-config"
import { buildErpNavItemByHrefMap } from "@/lib/erp-nav-registry"

/** `admin-help-mode-toggle`의 ERP_HELP_PARAM과 동일 — client 모듈 의존 방지 */
const ERP_HELP_PARAM = "erp_help"

export const ERP_WORKSPACE_TABS_KEY = "erp_workspace_tabs_v1"
export const ERP_WORKSPACE_FULL_HREF_KEY = "erp_workspace_tab_full_href_v1"
export const ERP_WORKSPACE_DASHBOARD_HREF = "/admin"
/** 메모리·백그라운드 부담 완화 — keep-alive MAX_CACHED_PAGES와 맞춤 */
export const MAX_ERP_WORKSPACE_TABS = 12

export const ERP_WORKSPACE_TABS_EVICTED_EVENT = "erp-workspace-tabs-evicted"

export type ErpWorkspaceTab = {
  href: string
  titleKey?: string
  lastSeen: number
}

const listeners = new Set<() => void>()

function notifyListeners() {
  for (const listener of listeners) listener()
}

export function subscribeErpWorkspaceTabs(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function stripErpHelpParam(href: string): string {
  const raw = (href || "").trim()
  if (!raw) return ""
  const q = raw.indexOf("?")
  if (q < 0) return raw
  const path = raw.slice(0, q)
  const params = new URLSearchParams(raw.slice(q + 1))
  if (!params.has(ERP_HELP_PARAM)) return raw
  params.delete(ERP_HELP_PARAM)
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** 탭·keep-alive 공통 키 (도움말 쿼리 제거 + query-agnostic pathname) */
export function resolveErpWorkspaceTabHref(href: string): string {
  return resolveErpKeepAliveCacheHref(stripErpHelpParam(href))
}

export function isErpWorkspaceDashboardHref(href: string): boolean {
  const path = normalizeErpPathOnly(href)
  return path === ERP_WORKSPACE_DASHBOARD_HREF
}

export function resolveErpNavTitleKeyForHref(href: string): string | undefined {
  const path = normalizeErpPathOnly(href)
  if (!path) return undefined
  const map = buildErpNavItemByHrefMap()
  const exact = map.get(path)
  if (exact) return exact.titleKey

  let best: { len: number; titleKey: string } | null = null
  for (const item of map.values()) {
    const h = normalizeErpPathOnly(item.href)
    if (!h || h === ERP_WORKSPACE_DASHBOARD_HREF) continue
    if (path === h || path.startsWith(`${h}/`)) {
      if (!best || h.length > best.len) best = { len: h.length, titleKey: item.titleKey }
    }
  }
  return best?.titleKey
}

function readTabs(): ErpWorkspaceTab[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(ERP_WORKSPACE_TABS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: ErpWorkspaceTab[] = []
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue
      const href = typeof (row as ErpWorkspaceTab).href === "string" ? (row as ErpWorkspaceTab).href : ""
      if (!href.startsWith("/admin") || href.startsWith("/admin/login")) continue
      const titleKey =
        typeof (row as ErpWorkspaceTab).titleKey === "string"
          ? (row as ErpWorkspaceTab).titleKey
          : undefined
      const lastSeen =
        typeof (row as ErpWorkspaceTab).lastSeen === "number"
          ? (row as ErpWorkspaceTab).lastSeen
          : Date.now()
      out.push({ href: resolveErpWorkspaceTabHref(href), titleKey, lastSeen })
    }
    return out
  } catch {
    return []
  }
}

function writeTabs(tabs: ErpWorkspaceTab[]) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(ERP_WORKSPACE_TABS_KEY, JSON.stringify(tabs))
  notifyListeners()
}

function readFullHrefMap(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const raw = sessionStorage.getItem(ERP_WORKSPACE_FULL_HREF_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

/** soft navigate 시 쿼리(?tab=)를 살리기 위해 마지막 full href 기억 */
export function rememberErpWorkspaceTabFullHref(fullHref: string): void {
  if (typeof window === "undefined") return
  const key = resolveErpWorkspaceTabHref(fullHref)
  if (!key || key.startsWith("/admin/login")) return
  const map = readFullHrefMap()
  map[key] = stripErpHelpParam(fullHref) || key
  sessionStorage.setItem(ERP_WORKSPACE_FULL_HREF_KEY, JSON.stringify(map))
}

export function getErpWorkspaceTabFullHref(tabKeyOrHref: string): string {
  const key = resolveErpWorkspaceTabHref(tabKeyOrHref)
  const mapped = readFullHrefMap()[key]
  return mapped || key
}

function ensureDashboardFirst(tabs: ErpWorkspaceTab[]): ErpWorkspaceTab[] {
  const dash = tabs.find((t) => isErpWorkspaceDashboardHref(t.href))
  const rest = tabs.filter((t) => !isErpWorkspaceDashboardHref(t.href))
  const dashboard: ErpWorkspaceTab = dash ?? {
    href: ERP_WORKSPACE_DASHBOARD_HREF,
    titleKey: "adminDashboard",
    lastSeen: Date.now(),
  }
  return [dashboard, ...rest]
}

function trimToMax(
  tabs: ErpWorkspaceTab[],
  protectHref: string
): { tabs: ErpWorkspaceTab[]; evicted: ErpWorkspaceTab[] } {
  if (tabs.length <= MAX_ERP_WORKSPACE_TABS) return { tabs, evicted: [] }
  const protect = resolveErpWorkspaceTabHref(protectHref)
  const removable = tabs
    .filter((t) => !isErpWorkspaceDashboardHref(t.href) && t.href !== protect)
    .sort((a, b) => a.lastSeen - b.lastSeen)
  const keep = new Set(tabs.map((t) => t.href))
  const evicted: ErpWorkspaceTab[] = []
  let excess = tabs.length - MAX_ERP_WORKSPACE_TABS
  for (const tab of removable) {
    if (excess <= 0) break
    keep.delete(tab.href)
    evicted.push(tab)
    excess -= 1
  }
  return { tabs: tabs.filter((t) => keep.has(t.href)), evicted }
}

function emitEvicted(evicted: ErpWorkspaceTab[]) {
  if (typeof window === "undefined" || evicted.length === 0) return
  window.dispatchEvent(
    new CustomEvent(ERP_WORKSPACE_TABS_EVICTED_EVENT, {
      detail: evicted.map((t) => ({
        href: t.href,
        titleKey: t.titleKey,
      })),
    })
  )
}

export function getErpWorkspaceTabs(): ErpWorkspaceTab[] {
  return ensureDashboardFirst(readTabs())
}

/** keep-alive 동기화용 — 이미 resolve된 탭 href 목록 */
export function getErpWorkspaceTabHrefs(): string[] {
  return getErpWorkspaceTabs().map((t) => t.href)
}

export function clearErpWorkspaceTabs(): void {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(ERP_WORKSPACE_TABS_KEY)
  sessionStorage.removeItem(ERP_WORKSPACE_FULL_HREF_KEY)
  notifyListeners()
}

/**
 * 현재 경로를 탭에 등록(이미 있으면 lastSeen·href 갱신).
 * 대시보드는 항상 첫 탭으로 유지. 상한 초과 시 LRU로 비활성 탭 제거.
 * @returns LRU로 닫힌 탭 목록
 */
export function ensureErpWorkspaceTab(href: string): ErpWorkspaceTab[] {
  if (typeof window === "undefined") return []
  if (!href.startsWith("/admin") || href.startsWith("/admin/login")) return []

  rememberErpWorkspaceTabFullHref(href)
  const tabHref = resolveErpWorkspaceTabHref(href)
  const now = Date.now()
  let tabs = ensureDashboardFirst(readTabs())
  const idx = tabs.findIndex((t) => t.href === tabHref)

  if (idx >= 0) {
    tabs = tabs.map((t, i) =>
      i === idx
        ? {
            ...t,
            href: tabHref,
            lastSeen: now,
            titleKey: t.titleKey || resolveErpNavTitleKeyForHref(tabHref),
          }
        : t
    )
  } else if (isErpWorkspaceDashboardHref(tabHref)) {
    tabs = tabs.map((t, i) =>
      i === 0 ? { ...t, href: ERP_WORKSPACE_DASHBOARD_HREF, lastSeen: now, titleKey: "adminDashboard" } : t
    )
  } else {
    tabs = [
      ...tabs,
      {
        href: tabHref,
        titleKey: resolveErpNavTitleKeyForHref(tabHref),
        lastSeen: now,
      },
    ]
  }

  const trimmed = trimToMax(tabs, tabHref)
  tabs = ensureDashboardFirst(trimmed.tabs)
  writeTabs(tabs)
  emitEvicted(trimmed.evicted)
  return trimmed.evicted
}

export function removeErpWorkspaceTab(href: string): ErpWorkspaceTab[] {
  const tabHref = resolveErpWorkspaceTabHref(href)
  if (isErpWorkspaceDashboardHref(tabHref)) {
    return getErpWorkspaceTabs()
  }
  const next = ensureDashboardFirst(readTabs().filter((t) => t.href !== tabHref))
  writeTabs(next)
  return next
}

/** 대시보드·keepHref만 남기고 나머지 탭 제거. 제거된 href 목록 반환 */
export function closeOtherErpWorkspaceTabs(keepHref: string): string[] {
  const keep = resolveErpWorkspaceTabHref(keepHref)
  const before = ensureDashboardFirst(readTabs())
  const removed = before
    .filter((t) => !isErpWorkspaceDashboardHref(t.href) && t.href !== keep)
    .map((t) => t.href)
  const next = before.filter((t) => isErpWorkspaceDashboardHref(t.href) || t.href === keep)
  writeTabs(ensureDashboardFirst(next))
  return removed
}

/**
 * 대시보드(첫 탭)는 고정. 그 외 탭끼리 순서 변경.
 * fromHref를 toHref 위치로 이동.
 */
export function reorderErpWorkspaceTabs(fromHref: string, toHref: string): void {
  const from = resolveErpWorkspaceTabHref(fromHref)
  const to = resolveErpWorkspaceTabHref(toHref)
  if (from === to) return
  if (isErpWorkspaceDashboardHref(from) || isErpWorkspaceDashboardHref(to)) return

  const tabs = ensureDashboardFirst(readTabs())
  const dash = tabs[0]!
  const rest = tabs.slice(1)
  const fromIdx = rest.findIndex((t) => t.href === from)
  const toIdx = rest.findIndex((t) => t.href === to)
  if (fromIdx < 0 || toIdx < 0) return
  const nextRest = [...rest]
  const [item] = nextRest.splice(fromIdx, 1)
  if (!item) return
  nextRest.splice(toIdx, 0, item)
  writeTabs([dash, ...nextRest])
}

/** 닫힌 탭 기준 이웃(오른쪽 → 왼쪽 → 대시보드) */
export function findNeighborWorkspaceTabHref(
  closedHref: string,
  tabsBeforeClose: ErpWorkspaceTab[]
): string {
  const closed = resolveErpWorkspaceTabHref(closedHref)
  const idx = tabsBeforeClose.findIndex((t) => t.href === closed)
  if (idx < 0) return ERP_WORKSPACE_DASHBOARD_HREF
  const right = tabsBeforeClose[idx + 1]
  if (right) return right.href
  const left = tabsBeforeClose[idx - 1]
  if (left) return left.href
  return ERP_WORKSPACE_DASHBOARD_HREF
}

export function subscribeErpWorkspaceTabsEvicted(
  listener: (evicted: { href: string; titleKey?: string }[]) => void
): () => void {
  if (typeof window === "undefined") return () => {}
  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent<{ href: string; titleKey?: string }[]>).detail
    if (Array.isArray(detail) && detail.length) listener(detail)
  }
  window.addEventListener(ERP_WORKSPACE_TABS_EVICTED_EVENT, onEvent)
  return () => window.removeEventListener(ERP_WORKSPACE_TABS_EVICTED_EVENT, onEvent)
}

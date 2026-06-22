import {
  getErpNavItemsForHelp,
  type ErpNavHelpItem,
} from "@/lib/erp-nav-registry"
import { isAccountingRole, isOfficeRole } from "@/lib/permissions"

export type AdminHelpEmbedded = "inbound" | "payroll"

/** 본사(Officer/디렉터 등) vs 가맹·매장(매니저/가맹점주·기타) 도움말 분기 */
export type AdminHelpAudience = "office" | "franchise"

/**
 * 로그인 `role`만으로 본사/가맹 관점을 나눈다. (회계=본사 업무에 가깝다고 보고 office)
 * 가맹점주·매장 매니저·기타 = franchise
 */
export function getAdminHelpAudienceFromRole(role: string | null | undefined): AdminHelpAudience {
  const r = String(role || "")
  if (isOfficeRole(r) || isAccountingRole(r)) return "office"
  return "franchise"
}

/**
 * `hrefToHelpSummaryKey` 결과(예: helpSum_admin_employees)에 `_office` / `_franchise` 접미사를 붙인 키
 */
export function helpSummaryKeyForAudience(baseKey: string, aud: AdminHelpAudience): string {
  return `${baseKey}_${aud}`
}

/**
 * 먼저 audience 전용 키를, 없으면 기본 `helpSum_*`를, 둘 다 없으면 adminHelpNoSummary
 */
export function resolveHelpSummary(
  t: (k: string) => string,
  baseKey: string,
  audience: AdminHelpAudience
): string {
  const spec = helpSummaryKeyForAudience(baseKey, audience)
  let s = t(spec)
  if (s !== spec) return s
  s = t(baseKey)
  if (s !== baseKey) return s
  return t("adminHelpNoSummary")
}

/** 도움말 센터 상단 문구 — `adminHelpCenterSub_office` / `adminHelpCenterSub_franchise`가 있으면 쓰고, 없으면 `adminHelpCenterSub` */
export function resolveHelpCenterSub(
  t: (k: string) => string,
  audience: AdminHelpAudience
): string {
  const spec = `adminHelpCenterSub_${audience}`
  const s = t(spec)
  if (s !== spec) return s
  return t("adminHelpCenterSub")
}

function normalizePathname(pathname: string): string {
  if (!pathname) return "/admin"
  const p = pathname.split("?")[0] || "/admin"
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1) || "/admin"
  return p
}

/**
 * /admin, /admin/foo/bar 등을 i18n 키 `helpSum_admin`, `helpSum_admin_foo_bar` 로 변환
 */
export function hrefToHelpSummaryKey(href: string): string {
  const h = normalizePathname(href)
  if (h === "/admin") return "helpSum_admin"
  if (h === "/pos") return "helpSum_pos"
  if (h.startsWith("/admin/")) {
    const slug = h.slice("/admin/".length).replace(/\//g, "_").replace(/-/g, "_")
    return `helpSum_admin_${slug}`
  }
  return `helpSum_${h
    .replace(/^\//, "")
    .replace(/\//g, "_")
    .replace(/-/g, "_")}`
}

/** `helpSum_*` → 같은 경로의 `helpHow_*` (사용 방법) */
export function helpHowKeyFromHelpSumKey(helpSumKey: string): string {
  return helpSumKey.replace(/^helpSum_/, "helpHow_")
}

export function hrefToHelpHowKey(href: string): string {
  return helpHowKeyFromHelpSumKey(hrefToHelpSummaryKey(href))
}

/**
 * `helpHow_*_office` / `helpHow_*_franchise` 먼저, 없으면 `helpHow_*`, 없으면 `adminHelpNoHow`
 */
export function resolveHelpHow(
  t: (k: string) => string,
  helpSumKey: string,
  audience: AdminHelpAudience
): string {
  const base = helpHowKeyFromHelpSumKey(helpSumKey)
  const spec = helpSummaryKeyForAudience(base, audience)
  let s = t(spec)
  if (s !== spec) return s
  s = t(base)
  if (s !== base) return s
  return t("adminHelpNoHow")
}

/** `helpSum_*` → `helpLongWhat_*` (도움말 탭·상세 본문) */
export function helpLongWhatKeyFromHelpSumKey(helpSumKey: string): string {
  return helpSumKey.replace(/^helpSum_/, "helpLongWhat_")
}

export function helpLongHowKeyFromHelpSumKey(helpSumKey: string): string {
  return helpSumKey.replace(/^helpSum_/, "helpLongHow_")
}

/** `helpLongWhat_*_office` / `*_franchise` 먼저, 없으면 `helpLongWhat_*`, 없으면 `resolveHelpSummary` */
export function resolveHelpLongWhat(
  t: (k: string) => string,
  helpSumKey: string,
  audience: AdminHelpAudience
): string {
  const base = helpLongWhatKeyFromHelpSumKey(helpSumKey)
  const spec = helpSummaryKeyForAudience(base, audience)
  let s = t(spec)
  if (s !== spec) return s
  s = t(base)
  if (s !== base) return s
  return resolveHelpSummary(t, helpSumKey, audience)
}

/** `helpLongHow_*` + 없으면 `resolveHelpHow` */
export function resolveHelpLongHow(
  t: (k: string) => string,
  helpSumKey: string,
  audience: AdminHelpAudience
): string {
  const base = helpLongHowKeyFromHelpSumKey(helpSumKey)
  const spec = helpSummaryKeyForAudience(base, audience)
  let s = t(spec)
  if (s !== spec) return s
  s = t(base)
  if (s !== base) return s
  return resolveHelpHow(t, helpSumKey, audience)
}

const EMBEDDED_BY_HREF: Partial<Record<string, AdminHelpEmbedded>> = {
  "/admin/inbound": "inbound",
  "/admin/payroll": "payroll",
}

export function getAllHelpNavItems(): ErpNavHelpItem[] {
  return getErpNavItemsForHelp()
}

/**
 * 현재 경로에 맞는 사이드바 메뉴 href(가장 긴 prefix 일치)를 돌려준다.
 */
export function matchErpNavHrefForHelp(pathname: string): string | null {
  const p = normalizePathname(pathname)
  const hrefs = getAllHelpNavItems()
    .map((x) => x.href)
    .sort((a, b) => b.length - a.length)
  if (hrefs.includes(p)) return p
  for (const h of hrefs) {
    if (p.startsWith(h + "/")) return h
  }
  return null
}

export function getEmbeddedForHref(href: string): AdminHelpEmbedded | undefined {
  return EMBEDDED_BY_HREF[normalizePathname(href)]
}

export function getHelpItemByHref(href: string): ErpNavHelpItem | undefined {
  const n = normalizePathname(href)
  return getAllHelpNavItems().find((x) => x.href === n)
}

/**
 * `AdminContentHelpTabShell`·`AdminHelpModeToggle`에서 동일하게 쓰는 제외 목록
 * (전역 도움말 탭과 화면내 전용 가이드가 겹치지 않게)
 */
export const ADMIN_HELP_CONTENT_SHELL_EXCLUDED_MATCHED = new Set<string>([
  "/admin",
  "/admin/payroll",
  "/admin/inbound",
  "/admin/login",
])

/** 현재 URL 기준으로 전역「도움말」/「화면으로 돌아가기」토글·셸을 쓸지 */
export function shouldShowAdminHelpModeToggle(pathname: string | null | undefined): boolean {
  const matched = matchErpNavHrefForHelp(pathname || "")
  if (!matched || ADMIN_HELP_CONTENT_SHELL_EXCLUDED_MATCHED.has(matched)) return false
  return !!hrefToHelpSummaryKey(matched)
}

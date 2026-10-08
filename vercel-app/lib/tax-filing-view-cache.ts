/**
 * 세무회계(บัญชีภาษี) 조회 스냅샷.
 * keep-alive remount로 fiber state가 비어도 탭·법인·기간·장부 결과를 복구한다.
 * remount 직후 빈 초기값으로 결과를 지우지 말 것.
 */

import { createErpQueryViewCache } from "@/lib/erp-query-view-cache"
import type { TaxBookEntriesResponse, TaxManagementBridgeResponse } from "@/lib/api-client/tax-book"
import type { TaxBookLedgerScope, TaxDayBookFilter } from "@/lib/tax-book"
import { TAX_FILING_TABS, type TaxFilingTabKey, resolveTaxFilingTab } from "@/lib/tax-filing-tabs"

export const TAX_BOOKS_VIEWS = [
  "bridge",
  "vouchers",
  "ledger",
  "trial",
  "taxIncome",
  "taxBalance",
  "closing",
] as const

export type TaxBooksView = (typeof TAX_BOOKS_VIEWS)[number]

export type TaxBooksQuerySnapshot = {
  from: string
  to: string
  scope: string
  tick: number
}

export type TaxFilingScopeMonth = {
  yearMonth: string
  scope: string
}

export type TaxBooksResultSnapshot = {
  view: TaxBooksView
  query: TaxBooksQuerySnapshot
  bridge: TaxManagementBridgeResponse | null
  entries: TaxBookEntriesResponse | null
  ledgerDraft: TaxBookLedgerScope
  ledgerApplied: TaxBookLedgerScope
  dayBook: TaxDayBookFilter
  voucherDateQuery: string
  voucherDocQuery: string
}

export type TaxFilingViewSnapshot = {
  tab?: TaxFilingTabKey
  booksFromMonth?: string
  booksToMonth?: string
  booksScope?: string
  booksSearchTick?: number
  purchaseFromMonth?: string
  purchaseToMonth?: string
  purchaseScope?: string
  purchaseSearchTick?: number
  ssoYearMonth?: string
  ssoScope?: string
  ssoSearchTick?: number
  pp30?: TaxFilingScopeMonth
  pp36?: TaxFilingScopeMonth
  pnd1?: TaxFilingScopeMonth
  pnd91?: TaxFilingScopeMonth
  pnd3?: TaxFilingScopeMonth
  pnd5051?: TaxFilingScopeMonth
  pnd53?: TaxFilingScopeMonth
  pnd54?: TaxFilingScopeMonth
  storeProfilesStore?: string
  booksResult?: TaxBooksResultSnapshot | null
}

const taxFilingViewCache = createErpQueryViewCache<TaxFilingViewSnapshot>()

function omitUndefined<T extends Record<string, unknown>>(partial: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(partial) as (keyof T)[]) {
    if (partial[key] !== undefined) out[key] = partial[key]
  }
  return out
}

export function patchTaxFilingViewCache(partial: TaxFilingViewSnapshot): void {
  const prev = taxFilingViewCache.read() || {}
  taxFilingViewCache.save({ ...prev, ...omitUndefined(partial) })
}

export function readTaxFilingViewCache(): TaxFilingViewSnapshot | null {
  return taxFilingViewCache.read()
}

export function clearTaxFilingViewCache(): void {
  taxFilingViewCache.clear()
}

const YEAR_MONTH = /^\d{4}-\d{2}$/

export function taxFilingYearMonthOr(value: string | undefined, fallback: string): string {
  return value && YEAR_MONTH.test(value) ? value : fallback
}

export function taxFilingScopeOr(value: string | undefined, fallback: string): string {
  const v = String(value || "").trim()
  return v || fallback
}

export function taxFilingSearchTickOr(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function resolveTaxFilingCachedTab(tab: string | null | undefined): TaxFilingTabKey | null {
  const resolved = resolveTaxFilingTab(tab)
  if (!resolved) return null
  return (TAX_FILING_TABS as readonly string[]).includes(resolved) ? resolved : null
}

export function isTaxBooksView(value: string | null | undefined): value is TaxBooksView {
  return Boolean(value && (TAX_BOOKS_VIEWS as readonly string[]).includes(value))
}

export function readTaxBooksResultCache(): TaxBooksResultSnapshot | null {
  const snap = taxFilingViewCache.read()?.booksResult
  if (!snap?.query) return null
  if (!isTaxBooksView(snap.view)) return null
  if (taxFilingSearchTickOr(snap.query.tick) < 1) return null
  if (!YEAR_MONTH.test(snap.query.from) || !YEAR_MONTH.test(snap.query.to)) return null
  if (!snap.bridge && !snap.entries) return null
  return snap
}

/** remount 시 같은 검색 틱이면 장부를 다시 받지 않고 스냅샷을 유지 */
export function shouldReuseRestoredTaxBooksSearch(
  restoredTick: number | null | undefined,
  searchTick: number
): boolean {
  return taxFilingSearchTickOr(restoredTick ?? undefined) >= 1 && restoredTick === searchTick
}

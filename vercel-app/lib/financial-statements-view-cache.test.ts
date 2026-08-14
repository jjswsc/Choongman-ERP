import { describe, expect, it } from "vitest"
import {
  buildBalanceSheetCacheKey,
  buildIncomeStatementCacheKey,
  financialStatementsPageViewCache,
  incomeStatementViewCache,
} from "./financial-statements-view-cache"

describe("financial-statements-view-cache", () => {
  it("builds stable income/balance cache keys", () => {
    expect(buildIncomeStatementCacheKey("2026-01", "2026-03", "All", false)).toBe(
      "2026-01|2026-03|All|exp:0"
    )
    expect(buildIncomeStatementCacheKey("2026-01", "2026-03", "S1", true)).toBe(
      "2026-01|2026-03|S1|exp:1"
    )
    expect(buildBalanceSheetCacheKey("2026-01", "2026-03", "All")).toBe("2026-01|2026-03|All")
  })

  it("round-trips page snapshot without clearing on empty read", () => {
    financialStatementsPageViewCache.clear()
    expect(financialStatementsPageViewCache.read()).toBeNull()
    financialStatementsPageViewCache.save({
      yearMonthStart: "2026-07",
      yearMonthEnd: "2026-08",
      storeFilter: "All",
      queryToken: 2,
      tab: "income",
    })
    expect(financialStatementsPageViewCache.read()?.queryToken).toBe(2)
    incomeStatementViewCache.clear()
    incomeStatementViewCache.save({
      cacheKey: "2026-07|2026-08|All|exp:0",
      data: null,
      compareIncomeRows: [],
      compareFetchError: null,
    })
    expect(incomeStatementViewCache.read()?.cacheKey).toBe("2026-07|2026-08|All|exp:0")
  })
})

import { describe, expect, it, beforeEach } from "vitest"
import {
  clearBankQueryViewCache,
  readBankQueryViewCache,
  saveBankQueryViewCache,
  type BankQueryViewCache,
} from "./bank-query-view-cache"

const sample = (overrides?: Partial<BankQueryViewCache>): BankQueryViewCache => ({
  accountId: "12",
  startStr: "2026-08-10",
  endStr: "2026-08-10",
  actualBalance: "",
  activeBankTab: "query",
  filterTransType: "",
  filterCategory: "",
  filterVendorCode: "",
  filterAccountSubjectId: "",
  filterAccountSubjectEmpty: false,
  filterPlExpenseOnly: false,
  filterNeedsAttention: false,
  filterInvoiceNotReceived: false,
  filterAmount: "",
  filterKeyword: "",
  queryRowEdits: {},
  list: [{ transDate: "2026-08-10", transType: "deposit", amount: 100, memo: "test" }],
  summary: {
    openingBalance: 0,
    beginningBalance: 0,
    periodDeposits: 100,
    periodWithdrawals: 0,
    calculatedBalance: 100,
  },
  hasSearched: true,
  ...overrides,
})

describe("bank-query-view-cache", () => {
  beforeEach(() => clearBankQueryViewCache())

  it("saves and reads snapshot", () => {
    saveBankQueryViewCache(sample())
    expect(readBankQueryViewCache()?.list[0]?.amount).toBe(100)
    expect(readBankQueryViewCache()?.accountId).toBe("12")
  })

  it("clears snapshot", () => {
    saveBankQueryViewCache(sample())
    clearBankQueryViewCache()
    expect(readBankQueryViewCache()).toBeNull()
  })
})

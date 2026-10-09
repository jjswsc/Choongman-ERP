import { describe, expect, it } from "vitest"
import type { AccountSubjectItem } from "@/lib/api-client"
import {
  accountSubjectDisplayName,
  bankRowSettleDate,
  formatBankBaht,
  formatBankLedgerDepositCell,
  formatBankLedgerWithdrawCell,
  normalizePurchaseVendorOptions,
} from "./bank-transactions-tab-utils"

describe("formatBankBaht", () => {
  it("prefixes baht and groups thousands", () => {
    expect(formatBankBaht(1234567)).toBe(`฿${(1234567).toLocaleString()}`)
    expect(formatBankBaht(0)).toBe("฿0")
  })

  it("treats null-ish as 0", () => {
    expect(formatBankBaht(undefined as unknown as number)).toBe("฿0")
  })
})

describe("accountSubjectDisplayName", () => {
  const subject = { id: 1, name: "광고선전비", nameEn: "Advertising" } as AccountSubjectItem

  it("uses Korean name for ko", () => {
    expect(accountSubjectDisplayName(subject, "ko")).toBe("광고선전비")
  })

  it("uses English name for other languages, falling back to name", () => {
    expect(accountSubjectDisplayName(subject, "th")).toBe("Advertising")
    expect(accountSubjectDisplayName({ ...subject, nameEn: "" }, "en")).toBe("광고선전비")
  })
})

describe("normalizePurchaseVendorOptions", () => {
  it("returns [] for non-array input", () => {
    expect(normalizePurchaseVendorOptions(null)).toEqual([])
    expect(normalizePurchaseVendorOptions({ code: "V1" })).toEqual([])
  })

  it("trims, drops empty codes and keeps the first of duplicate codes", () => {
    const rows = normalizePurchaseVendorOptions([
      { code: " V1 ", name: " Alpha " },
      { code: "", name: "No code" },
      { code: "V1", name: "Alpha duplicate" },
      { code: "V2", name: "Beta" },
    ])
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.code === "V1")?.name).toBe("Alpha")
    expect(rows.map((r) => r.code).sort()).toEqual(["V1", "V2"])
  })
})

describe("ledger cells", () => {
  it("shows deposit amount only for deposits", () => {
    expect(formatBankLedgerDepositCell("deposit", -1500)).toBe((1500).toLocaleString())
    expect(formatBankLedgerDepositCell("withdraw", 1500)).toBe("—")
    expect(formatBankLedgerDepositCell("deposit", 0)).toBe("—")
  })

  it("shows withdraw amount only for withdrawals", () => {
    expect(formatBankLedgerWithdrawCell("withdraw", 200)).toBe((200).toLocaleString())
    expect(formatBankLedgerWithdrawCell("deposit", 200)).toBe("—")
  })
})

describe("bankRowSettleDate", () => {
  it("prefers explicit sales date", () => {
    expect(bankRowSettleDate({ transDate: "2026-10-09 10:00", salesDate: "2026-10-05T00:00:00" })).toBe("2026-10-05")
  })

  it("falls back to the day before the transaction date", () => {
    expect(bankRowSettleDate({ transDate: "2026-10-09" })).toBe("2026-10-08")
  })
})

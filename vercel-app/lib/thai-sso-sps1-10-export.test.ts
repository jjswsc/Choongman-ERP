import { describe, expect, it } from "vitest"
import {
  beYearFromGregorianYm,
  computeSps110Part2Totals,
  formatCitizenIdSpaced,
  formatSps110DisplayName,
  mapPayrollRowToSps110Part2Row,
  thaiMonthNameFromYm,
} from "./thai-sso-sps1-10-export"

describe("thaiMonthNameFromYm", () => {
  it("returns Thai month for April 2026", () => {
    expect(thaiMonthNameFromYm("2026-04")).toBe("เมษายน")
    expect(beYearFromGregorianYm("2026-04")).toBe(2569)
  })
})

describe("formatCitizenIdSpaced", () => {
  it("spaces 13 digits", () => {
    expect(formatCitizenIdSpaced("1001010162161")).toBe("1 0 0 1 0 1 0 1 6 2 1 6 1")
  })
})

describe("formatSps110DisplayName", () => {
  it("prefixes title with space", () => {
    expect(formatSps110DisplayName("ชัยพัทธ์ ศักดิ์ศรีเจริญยิ่ง", "นาย")).toBe(
      "นาย ชัยพัทธ์ ศักดิ์ศรีเจริญยิ่ง"
    )
  })
})

describe("mapPayrollRowToSps110Part2Row", () => {
  it("matches PDF-style wage and contribution columns", () => {
    const row = mapPayrollRowToSps110Part2Row(
      {
        name: "ณฐนนท ยุ่นแก้ว",
        nameTitle: "นางสาว",
        idNumber: "110290057130",
        ssoContributableWage: 17000,
        sso: 850,
      },
      3
    )
    expect(row[0]).toBe(3)
    expect(row[2]).toBe("นางสาว ณฐนนท ยุ่นแก้ว")
    expect(row[3]).toBe(17000)
    expect(row[4]).toBe("00")
    expect(row[5]).toBe(850)
    expect(row[6]).toBe("00")
  })
})

describe("computeSps110Part2Totals", () => {
  it("sums wage base and employee SSO", () => {
    const t = computeSps110Part2Totals([
      { ssoContributableWage: 15000, sso: 750 },
      { ssoContributableWage: 17000, sso: 850 },
    ])
    expect(t.totalWageBaht).toBe(32000)
    expect(t.totalEmployeeContribBaht).toBe(1600)
    expect(t.rowCount).toBe(2)
  })
})

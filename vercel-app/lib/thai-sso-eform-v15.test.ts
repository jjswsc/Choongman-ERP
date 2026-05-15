import { describe, expect, it } from "vitest"
import {
  dateYmMatchesBangkok,
  formatDateDdMmYyyy,
  mapPayrollCalcRowToSsoEformV15DataRow,
  splitEmployeeNameForThaiSsoEform,
} from "./thai-sso-eform-v15"

describe("splitEmployeeNameForThaiSsoEform", () => {
  it("strips title prefix and splits last token as surname", () => {
    expect(splitEmployeeNameForThaiSsoEform("สมชาย ใจดี", "นาย")).toEqual({ first: "สมชาย", last: "ใจดี" })
    expect(splitEmployeeNameForThaiSsoEform("นายสมชาย ใจดี", "นาย")).toEqual({ first: "สมชาย", last: "ใจดี" })
  })
  it("returns single token as first when no split", () => {
    expect(splitEmployeeNameForThaiSsoEform("Cherprang", "")).toEqual({ first: "Cherprang", last: "" })
  })
})

describe("dateYmMatchesBangkok", () => {
  it("matches prefix of YYYY-MM", () => {
    expect(dateYmMatchesBangkok("2026-05-01", "2026-05")).toBe(true)
    expect(dateYmMatchesBangkok("2026-04-30", "2026-05")).toBe(false)
  })
})

describe("formatDateDdMmYyyy", () => {
  it("formats ISO to DD/MM/YYYY", () => {
    expect(formatDateDdMmYyyy("2026-05-14")).toBe("14/05/2026")
  })
})

describe("mapPayrollCalcRowToSsoEformV15DataRow", () => {
  it("fills BE year, month, J resign when resign in filing month", () => {
    const row = mapPayrollCalcRowToSsoEformV15DataRow(
      {
        name: "นายทดสอบ ระบบ",
        nameTitle: "นาย",
        idNumber: "1234567890123",
        ssoMemberNo: "12 345 678 90",
        joinDate: "2024-01-01",
        resignDate: "2026-05-10",
        ssoBase: 15000.7,
      },
      3,
      "2026-05"
    )
    expect(row[0]).toBe(3)
    expect(row[1]).toBe(5)
    expect(row[2]).toBe(2569)
    expect(row[3]).toBe("1234567890123")
    expect(row[4]).toBe("นาย")
    expect(row[5]).toBe("ทดสอบ")
    expect(row[6]).toBe("ระบบ")
    expect(row[7]).toBe(15000)
    expect(row[8]).toBe("1234567890")
    expect(row[9]).toBe("10/05/2026")
    expect(row[10]).toBe("")
    expect(row[11]).toBe("")
  })

  it("uses join date in J when join in filing month and no resign that month", () => {
    const row = mapPayrollCalcRowToSsoEformV15DataRow(
      {
        name: "สมหญิง รักงาน",
        nameTitle: "นางสาว",
        idNumber: "9876543210987",
        joinDate: "2026-05-02",
        resignDate: "",
        ssoBase: 17000,
      },
      1,
      "2026-05"
    )
    expect(row[9]).toBe("02/05/2026")
  })
})

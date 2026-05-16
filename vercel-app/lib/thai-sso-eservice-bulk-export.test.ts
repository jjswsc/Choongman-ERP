import { describe, expect, it } from "vitest"
import {
  SSO_ESERVICE_BULK_HEADERS_TH,
  mapPayrollRowToEserviceBulkRow,
} from "./thai-sso-eservice-bulk-export"

describe("mapPayrollRowToEserviceBulkRow", () => {
  it("uses 13-digit ID without spaces for e-Service import", () => {
    const row = mapPayrollRowToEserviceBulkRow(
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
    expect(row[1]).toBe("110290057130")
    expect(String(row[1])).not.toContain(" ")
    expect(row[2]).toBe("นางสาว ณฐนนท ยุ่นแก้ว")
    expect(row[3]).toBe(17000)
    expect(row[5]).toBe(850)
  })

  it("has seven columns matching SSO_ESERVICE_BULK_HEADERS_TH", () => {
    expect(SSO_ESERVICE_BULK_HEADERS_TH).toHaveLength(7)
    const row = mapPayrollRowToEserviceBulkRow({ name: "A", ssoBase: 100, sso: 5 }, 1)
    expect(row).toHaveLength(7)
  })
})

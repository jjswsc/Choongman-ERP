import { describe, expect, it } from "vitest"
import {
  SSO_OFFICIAL_UPLOAD_HEADERS_TH,
  formatOfficialUploadPreviewCell,
  mapPayrollRowToOfficialUploadRow,
  normalizeSsoOfficialSheetName,
  officialUploadCitizenIdText,
} from "./thai-sso-official-upload-export"

describe("normalizeSsoOfficialSheetName", () => {
  it("pads branch sequence to 6 digits", () => {
    expect(normalizeSsoOfficialSheetName("")).toBe("000000")
    expect(normalizeSsoOfficialSheetName("123")).toBe("000123")
    expect(normalizeSsoOfficialSheetName("000000")).toBe("000000")
  })
})

describe("officialUploadCitizenIdText", () => {
  it("keeps 13 digits with no separators and preserves a leading zero", () => {
    expect(officialUploadCitizenIdText("1,400,600,186,754")).toBe("1400600186754")
    expect(officialUploadCitizenIdText("0991017501183")).toBe("0991017501183")
    expect(officialUploadCitizenIdText(1400600186754)).toBe("1400600186754")
  })
})

describe("formatOfficialUploadPreviewCell", () => {
  it("renders citizen ID as consecutive digits", () => {
    expect(formatOfficialUploadPreviewCell(1400600186754, 0)).toBe("1400600186754")
    expect(formatOfficialUploadPreviewCell("1,400,600,186,754", 0)).toBe("1400600186754")
    expect(formatOfficialUploadPreviewCell("1400600186754", 0)).not.toMatch(/[,\s-]/)
  })
})

describe("mapPayrollRowToOfficialUploadRow", () => {
  it("matches SampleExcel.xlsx six-column layout", () => {
    const row = mapPayrollRowToOfficialUploadRow(
      {
        name: "ณัฐ ประกันสังคม",
        nameTitle: "นาย",
        idNumber: "3100400442138",
        ssoContributableWage: 17000,
        sso: 750,
      },
      "contributable"
    )
    expect(row).toHaveLength(6)
    expect(row[0]).toBe("3100400442138")
    expect(row[1]).toBe("นาย")
    expect(row[2]).toBe("ณัฐ")
    expect(row[3]).toBe("ประกันสังคม")
    expect(row[4]).toBe(17000)
    expect(row[5]).toBe(750)
  })

  it("defaults ค่าจ้าง to actual gross pay, not the 17500 ceiling", () => {
    const row = mapPayrollRowToOfficialUploadRow({
      name: "ณัฐ ประกันสังคม",
      nameTitle: "นาย",
      idNumber: "0991017501183",
      ssoBase: 15000,
      ssoGrossWage: 22100,
      ssoContributableWage: 17500,
      sso: 875,
    })
    expect(row[0]).toBe("0991017501183")
    expect(row[4]).toBe(22100)
    expect(row[5]).toBe(875)
  })

  it("headers are six Thai columns from official template", () => {
    expect(SSO_OFFICIAL_UPLOAD_HEADERS_TH).toHaveLength(6)
    expect(SSO_OFFICIAL_UPLOAD_HEADERS_TH[0]).toBe("เลขประจำตัวประชาชน")
    expect(SSO_OFFICIAL_UPLOAD_HEADERS_TH[5]).toBe("จำนวนเงินสมทบ")
  })
})

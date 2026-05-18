/**
 * SSO e-Service bulk upload workbook (สปส.1-10 ส่วนที่ 2 style).
 * Primary sheet: header row + employee data only (no totals) for portal import.
 * Compare row 1 with the latest template from www.sso.go.th/eservices before upload.
 */
import * as XLSX from "xlsx"
import {
  type SsoFilingWageMode,
  resolveSsoFilingWageBaht,
} from "@/lib/payroll-utils"
import {
  type Sps110EmployerInfo,
  beYearFromGregorianYm,
  citizenDigits13Only,
  computeSps110Part2Totals,
  formatSps110DisplayName,
  thaiMonthNameFromYm,
} from "@/lib/thai-sso-sps1-10-export"

const SHEET_UPLOAD = "นำส่งเงินสมทบ"
const SHEET_EMPLOYER = "ข้อมูลนายจ้าง"
const SHEET_README = "README"

/** สปส.1-10 ส่วนที่ 2 — e-Service 일괄 업로드 열 (공식 양식 기준) */
export const SSO_ESERVICE_BULK_HEADERS_TH = [
  "ลำดับที่",
  "เลขประจำตัวประชาชน",
  "คำนำหน้านาม-ชื่อ-ชื่อสกุล",
  "ค่าจ้างที่จ่ายจริง (บาท)",
  "ค่าจ้าง (สต.)",
  "เงินสมทบผู้ประกันตน (บาท)",
  "เงินสมทบผู้ประกันตน (สต.)",
] as const

/** UI 열 안내 — `SSO_ESERVICE_BULK_HEADERS_TH` 순서와 동일 */
export const SSO_ESERVICE_BULK_COLUMN_HELP: { labelTh: string; labelEn: string }[] = [
  { labelTh: SSO_ESERVICE_BULK_HEADERS_TH[0], labelEn: "Line number" },
  { labelTh: SSO_ESERVICE_BULK_HEADERS_TH[1], labelEn: "National ID (13 digits, text)" },
  { labelTh: SSO_ESERVICE_BULK_HEADERS_TH[2], labelEn: "Title + full name" },
  { labelTh: SSO_ESERVICE_BULK_HEADERS_TH[3], labelEn: "Wage paid (baht)" },
  { labelTh: SSO_ESERVICE_BULK_HEADERS_TH[4], labelEn: "Wage (satang)" },
  { labelTh: SSO_ESERVICE_BULK_HEADERS_TH[5], labelEn: "Employee contribution (baht)" },
  { labelTh: SSO_ESERVICE_BULK_HEADERS_TH[6], labelEn: "Employee contribution (satang)" },
]

function splitBahtSatang(amount: number): { baht: number; satang: string } {
  const n = Math.max(0, Math.round(amount))
  return { baht: n, satang: "00" }
}

/** e-Service: citizen ID as 13 digits (no spaces) for import parsers */
export function mapPayrollRowToEserviceBulkRow(
  r: Record<string, unknown>,
  seq: number,
  filingWageMode: SsoFilingWageMode = "contributable"
): (string | number)[] {
  const idDigits = citizenDigits13Only(r.idNumber)
  const displayName = formatSps110DisplayName(String(r.name || ""), String(r.nameTitle || ""))
  const wage = resolveSsoFilingWageBaht(r, filingWageMode)
  const empContrib = Math.max(0, Math.floor(Number(r.sso) || 0))
  const w = splitBahtSatang(wage)
  const c = splitBahtSatang(empContrib)
  return [seq, idDigits, displayName, w.baht, w.satang, c.baht, c.satang]
}

function readmeRows(ym: string): (string | number)[][] {
  return [
    ["SSO e-Service bulk upload — CM ERP"],
    [""],
    [`Sheet 1 «${SHEET_UPLOAD}»: e-Service import (row 1 = headers, row 2+ = employees). Upload this file or select this sheet on the portal.`],
    ["Do not include total/summary rows on the upload sheet."],
    [`Sheet 2 «${SHEET_EMPLOYER}»: employer account/address from store profile (verify before filing).`],
    [`Sheet 3 «${SHEET_README}»: this guide.`],
    [""],
    ["Before upload: download the latest bulk template from www.sso.go.th/eservices and compare column titles in row 1."],
    [
      "Wage column mode: contributable (1,650·ceiling applied) | gross (total pay) | basic (sal_amt only).",
    ],
    ["Contribution = employee 5% with 50-satang rounding from getPayrollCalc."],
    [`ERP period: ${ym}`],
  ]
}

function buildEmployerSheet(
  ym: string,
  employer: Sps110EmployerInfo,
  totals: ReturnType<typeof computeSps110Part2Totals>
): (string | number)[][] {
  const er = employer || {}
  const thaiMonth = thaiMonthNameFromYm(ym)
  const beYear = beYearFromGregorianYm(ym)
  const employerContrib = totals.totalEmployeeContribBaht
  return [
    ["ข้อมูลนายจ้าง (e-Service / สปส.1-10)"],
    [""],
    ["เลขที่บัญชี", er.ssoAccountNo || ""],
    ["ชื่อสถานประกอบการ", er.companyName || ""],
    ["ชื่อสาขา (ถ้ามี)", er.branchName || ""],
    ["ลำดับที่สาขา", er.branchCode || ""],
    ["ที่ตั้งสำนักงานใหญ่ / สาขา", er.officeAddress || ""],
    ["รหัสไปรษณีย์", er.postcode || ""],
    ["โทรศัพท์", er.phone || ""],
    ["โทรสาร", er.fax || ""],
    ["อีเมล", er.email || ""],
    ["เดือนที่นำส่ง", thaiMonth, "พ.ศ.", beYear],
    ["จำนวนผู้ประกันตน", totals.rowCount],
    ["รวมค่าจ้าง (บาท)", totals.totalWageBaht],
    ["รวมเงินสมทบผู้ประกันตน (บาท)", totals.totalEmployeeContribBaht],
    ["รวมเงินสมทบนายจ้าง (บาท)", employerContrib],
    ["ERP YYYY-MM", ym],
  ]
}

function buildUploadSheet(
  rows: Record<string, unknown>[],
  filingWageMode: SsoFilingWageMode
): (string | number)[][] {
  const lines = rows.map((r, i) => mapPayrollRowToEserviceBulkRow(r, i + 1, filingWageMode))
  return [[...SSO_ESERVICE_BULK_HEADERS_TH], ...lines]
}

/** Force ID column cells to string (avoid scientific notation on 13-digit IDs) */
function applyCitizenIdTextFormat(ws: XLSX.WorkSheet, rowCount: number): void {
  for (let r = 2; r <= rowCount + 1; r++) {
    const addr = XLSX.utils.encode_cell({ r: r - 1, c: 1 })
    const cell = ws[addr]
    if (!cell) continue
    if (cell.v != null && cell.v !== "") {
      cell.t = "s"
      cell.v = String(cell.v)
      cell.z = "@"
    }
  }
}

function storeSlugFromEmployer(employer?: Sps110EmployerInfo): string {
  return String(employer?.branchCode || employer?.branchName || "store")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .slice(0, 24)
}

function buildUploadWorksheet(
  rows: Record<string, unknown>[],
  filingWageMode: SsoFilingWageMode
): XLSX.WorkSheet {
  const uploadAoa = buildUploadSheet(rows, filingWageMode)
  const wsUpload = XLSX.utils.aoa_to_sheet(uploadAoa)
  wsUpload["!cols"] = [
    { wch: 8 },
    { wch: 16 },
    { wch: 36 },
    { wch: 14 },
    { wch: 8 },
    { wch: 14 },
    { wch: 8 },
  ]
  applyCitizenIdTextFormat(wsUpload, rows.length)
  return wsUpload
}

/** e-Service 통합본 — 업로드 시트(1)·사업장(2)·README(3) */
export function downloadThaiSsoEserviceBulkFromPayrollXlsx(params: {
  yearMonth: string
  payrollRows: Record<string, unknown>[]
  employer?: Sps110EmployerInfo
  filingWageMode?: SsoFilingWageMode
}): void {
  const ym = (params.yearMonth || "").trim().slice(0, 7) || "YYYY-MM"
  const rows = params.payrollRows || []
  const totals = computeSps110Part2Totals(rows)
  const wb = XLSX.utils.book_new()
  const filingWageMode = params.filingWageMode || "contributable"

  // Upload sheet first — some e-Service imports read the first worksheet only.
  XLSX.utils.book_append_sheet(wb, buildUploadWorksheet(rows, filingWageMode), SHEET_UPLOAD)

  const employerAoa = buildEmployerSheet(ym, params.employer || {}, totals)
  const wsEmployer = XLSX.utils.aoa_to_sheet(employerAoa)
  wsEmployer["!cols"] = [{ wch: 28 }, { wch: 48 }]
  XLSX.utils.book_append_sheet(wb, wsEmployer, SHEET_EMPLOYER)

  const wsReadme = XLSX.utils.aoa_to_sheet(readmeRows(ym))
  wsReadme["!cols"] = [{ wch: 92 }]
  XLSX.utils.book_append_sheet(wb, wsReadme, SHEET_README)

  const safeYm = ym.replace(/[/\\?%*:|"<>]/g, "-")
  const storeSlug = storeSlugFromEmployer(params.employer)
  XLSX.writeFile(wb, `thai-sso-eservice-bulk-${storeSlug}-${safeYm}.xlsx`)
}

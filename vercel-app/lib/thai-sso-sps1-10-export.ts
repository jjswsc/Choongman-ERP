/**
 * สปส.1-10 (SSO contribution form) — Parts 1 & 2 as Excel for review / re-keying.
 * Layout follows official สปส.1-10 PDF (cover summary + employee detail list).
 * Not a government-signed file; compare with www.sso.go.th before filing.
 */
import * as XLSX from "xlsx"
import { writeErpXlsxWorkbook } from "@/lib/erp-excel-export"
import { type SsoFilingWageMode, resolveSsoFilingWageBaht } from "@/lib/payroll-utils"

const SHEET_PART1 = "สปส1-10_ส่วนที่1"
const SHEET_PART2 = "สปส1-10_ส่วนที่2"
const SHEET_README = "README"

const THAI_MONTHS = [
  "",
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const

export type Sps110EmployerInfo = {
  companyName?: string
  branchName?: string
  ssoAccountNo?: string
  branchCode?: string
  officeAddress?: string
  postcode?: string
  phone?: string
  fax?: string
  email?: string
  contributionRatePercent?: string
}

/** Part 2 column headers (สปส.1-10 ส่วนที่ 2) */
export const SPS110_PART2_HEADERS_TH = [
  "ลำดับที่",
  "เลขประจำตัวประชาชน",
  "คำนำหน้า-ชื่อ-นามสกุล",
  "ค่าจ้างที่จ่ายจริง (บาท)",
  "ค่าจ้าง (สต.)",
  "เงินสมทบผู้ประกันตน (บาท)",
  "เงินสมทบผู้ประกันตน (สต.)",
] as const

export function parseYearMonthYm(ym: string): { y: number; m: number } | null {
  const s = (ym || "").trim().slice(0, 7)
  const match = /^(\d{4})-(\d{2})$/.exec(s)
  if (!match) return null
  const y = Number(match[1])
  const mo = Number(match[2])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null
  return { y, m: mo }
}

export function thaiMonthNameFromYm(ym: string): string {
  const p = parseYearMonthYm(ym)
  if (!p) return ""
  return THAI_MONTHS[p.m] || ""
}

export function beYearFromGregorianYm(ym: string): number | "" {
  const p = parseYearMonthYm(ym)
  return p ? p.y + 543 : ""
}

export function citizenDigits13Only(raw: unknown): string {
  const digits = raw != null ? String(raw).replace(/\D/g, "") : ""
  return digits.length === 13 ? digits : digits
}

function citizenDigits13(raw: unknown): string {
  return citizenDigits13Only(raw)
}

/** Official PDF often shows ID as single digits separated by spaces */
export function formatCitizenIdSpaced(digits13: string): string {
  const d = digits13.replace(/\D/g, "")
  if (d.length !== 13) return d
  return d.split("").join(" ")
}

/** Title + full name as on สปส.1-10 part 2 (e.g. นาย ชัยพัทธ์ ศักดิ์...) */
export function formatSps110DisplayName(fullName: string, nameTitle: string): string {
  const t = String(nameTitle || "").trim()
  const n = String(fullName || "").trim()
  if (!n) return t
  if (t && n.startsWith(t)) return n
  if (t) return `${t} ${n}`.replace(/\s+/g, " ").trim()
  return n
}

function splitBahtSatang(amount: number): { baht: number; satang: number } {
  const n = Math.max(0, Math.round(amount))
  return { baht: n, satang: 0 }
}

export type Sps110Part2Totals = {
  totalWageBaht: number
  totalWageSatang: number
  totalEmployeeContribBaht: number
  totalEmployeeContribSatang: number
  rowCount: number
}

export function mapPayrollRowToSps110Part2Row(
  r: Record<string, unknown>,
  seq: number,
  filingWageMode: SsoFilingWageMode = "contributable"
): (string | number)[] {
  const idDigits = citizenDigits13(r.idNumber)
  const displayName = formatSps110DisplayName(String(r.name || ""), String(r.nameTitle || ""))
  const wage = resolveSsoFilingWageBaht(r, filingWageMode)
  const empContrib = Math.max(0, Math.floor(Number(r.sso) || 0))
  const w = splitBahtSatang(wage)
  const c = splitBahtSatang(empContrib)
  return [
    seq,
    formatCitizenIdSpaced(idDigits),
    displayName,
    w.baht,
    String(w.satang).padStart(2, "0"),
    c.baht,
    String(c.satang).padStart(2, "0"),
  ]
}

export function computeSps110Part2Totals(
  rows: Record<string, unknown>[],
  filingWageMode: SsoFilingWageMode = "contributable"
): Sps110Part2Totals {
  let totalWageBaht = 0
  let totalEmployeeContribBaht = 0
  for (const r of rows) {
    totalWageBaht += resolveSsoFilingWageBaht(r, filingWageMode)
    totalEmployeeContribBaht += Math.max(0, Math.floor(Number(r.sso) || 0))
  }
  return {
    totalWageBaht,
    totalWageSatang: 0,
    totalEmployeeContribBaht,
    totalEmployeeContribSatang: 0,
    rowCount: rows.length,
  }
}

function readmeRows(ym: string): (string | number)[][] {
  return [
    ["สปส.1-10 — CM ERP export (from payroll snapshot)"],
    [""],
    ["Sheet สปส1-10_ส่วนที่1: cover summary (สปส.1-10 part 1). Fill empty employer fields if needed."],
    ["Sheet สปส1-10_ส่วนที่2: employee lines (สปส.1-10 part 2). Wage = SSO base; contribution = employee 5%."],
    [""],
    ["Reference: SSO e-Service / printed สปส.1-10. Submit via SSO portal or your SSO_eForm .xlsm after review."],
    [`ERP period: ${ym}`],
  ]
}

function buildPart1Sheet(
  ym: string,
  employer: Sps110EmployerInfo,
  totals: Sps110Part2Totals
): (string | number)[][] {
  const thaiMonth = thaiMonthNameFromYm(ym)
  const beYear = beYearFromGregorianYm(ym)
  const er = employer || {}
  const rate = er.contributionRatePercent?.trim() || "5.00"
  const employerContrib = totals.totalEmployeeContribBaht
  const grandTotal = totals.totalEmployeeContribBaht + employerContrib

  return [
    ["สปส.1-10 ส่วนที่ 1", "", "", "แบบรายการแสดงการส่งเงินสมทบ"],
    [""],
    ["ชื่อสถานประกอบการ", er.companyName || "", "", "เลขที่บัญชี", er.ssoAccountNo || ""],
    ["ชื่อสาขา (ถ้ามี)", er.branchName || "", "", "ลำดับที่สาขา", er.branchCode || ""],
    ["ที่ตั้งสำนักงานใหญ่ / สาขา", er.officeAddress || ""],
    ["รหัสไปรษณีย์", er.postcode || "", "โทรศัพท์", er.phone || "", "โทรสาร", er.fax || ""],
    ["อีเมล", er.email || ""],
    [
      "การนำส่งเงินสมทบสำหรับค่าจ้างเดือน",
      thaiMonth,
      "พ.ศ.",
      beYear,
      "อัตราเงินสมทบร้อยละ",
      rate,
    ],
    [""],
    ["รายการ", "จำนวนเงิน (บาท)", "สต.", ""],
    ["1. เงินค่าจ้างทั้งสิ้น", totals.totalWageBaht, totals.totalWageSatang],
    ["2. เงินสมทบผู้ประกันตน", totals.totalEmployeeContribBaht, totals.totalEmployeeContribSatang],
    ["3. เงินสมทบนายจ้าง", employerContrib, 0],
    ["4. รวมเงินสมทบที่นำส่งทั้งสิ้น", grandTotal, 0],
    ["5. จำนวนผู้ประกันตนที่ส่งเงินสมทบ", totals.rowCount, "คน"],
    [""],
    ["หมายเหตุ", "ทำรายการ สปส.1-10 ส่วนที่ 2 ผ่าน e-Service (www.sso.go.th/eservices)"],
    ["ERP export month (YYYY-MM)", ym],
  ]
}

function buildPart2Sheet(
  rows: Record<string, unknown>[],
  ym: string,
  filingWageMode: SsoFilingWageMode
): (string | number)[][] {
  const thaiMonth = thaiMonthNameFromYm(ym)
  const beYear = beYearFromGregorianYm(ym)
  const lines = rows.map((r, i) => mapPayrollRowToSps110Part2Row(r, i + 1, filingWageMode))
  const totals = computeSps110Part2Totals(rows, filingWageMode)

  const headerBlock: (string | number)[][] = [
    ["สปส.1-10 ส่วนที่ 2", "", "รายละเอียดการนำส่งเงินสมทบ"],
    [
      "สำหรับค่าจ้างเดือน",
      thaiMonth,
      "พ.ศ.",
      String(beYear),
      "แผ่นที่",
      "1",
      "ในจำนวน",
      "1",
      "แผ่น",
    ],
    [""],
    [...SPS110_PART2_HEADERS_TH],
  ]

  const totalRow: (string | number)[] = [
    "รวม",
    "",
    "",
    totals.totalWageBaht,
    String(totals.totalWageSatang).padStart(2, "0"),
    totals.totalEmployeeContribBaht,
    String(totals.totalEmployeeContribSatang).padStart(2, "0"),
  ]

  return [...headerBlock, ...lines, [""], totalRow]
}

export async function downloadThaiSsoSps110FromPayrollXlsx(params: {
  yearMonth: string
  payrollRows: Record<string, unknown>[]
  employer?: Sps110EmployerInfo
  filingWageMode?: SsoFilingWageMode
}): Promise<void> {
  const ym = (params.yearMonth || "").trim().slice(0, 7) || "YYYY-MM"
  const rows = params.payrollRows || []
  const filingWageMode = params.filingWageMode || "contributable"
  const totals = computeSps110Part2Totals(rows, filingWageMode)
  const wb = XLSX.utils.book_new()

  const wsReadme = XLSX.utils.aoa_to_sheet(readmeRows(ym))
  wsReadme["!cols"] = [{ wch: 88 }]
  XLSX.utils.book_append_sheet(wb, wsReadme, SHEET_README)

  const part1 = buildPart1Sheet(ym, params.employer || {}, totals)
  const ws1 = XLSX.utils.aoa_to_sheet(part1)
  ws1["!cols"] = [{ wch: 28 }, { wch: 36 }, { wch: 12 }, { wch: 28 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws1, SHEET_PART1)

  const part2 = buildPart2Sheet(rows, ym, filingWageMode)
  const ws2 = XLSX.utils.aoa_to_sheet(part2)
  ws2["!cols"] = [
    { wch: 8 },
    { wch: 22 },
    { wch: 32 },
    { wch: 14 },
    { wch: 8 },
    { wch: 14 },
    { wch: 8 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, SHEET_PART2)

  const safeYm = ym.replace(/[/\\?%*:|"<>]/g, "-")
  await writeErpXlsxWorkbook(wb, `thai-sso-sps1-10-${safeYm}.xlsx`)
}

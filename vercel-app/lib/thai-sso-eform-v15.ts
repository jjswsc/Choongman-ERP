/**
 * 태국 사회보험용 서드파티 엑셀 **SSO_eForm Ver.1.5**류(ExcelforHR 등)의 **Data** 시트에
 * 붙여넣기 쉽도록 12열(A–L) 한 블록으로 보냅니다.
 *
 * 공식 매뉴얼 원본(.xlsm)의 1행 헤더와 완전히 동일하지 않을 수 있으므로,
 * 다운로드 후 **원본 파일 1행과 열 제목·순서를 한 번 대조**한 뒤 사용하세요.
 * (안내 시트 `README_SSO_eForm` 참고)
 */
import * as XLSX from "xlsx"
import { writeErpXlsxWorkbook } from "@/lib/erp-excel-export"
import { type SsoFilingWageMode, resolveSsoFilingWageBaht } from "@/lib/payroll-utils"

/** A–L 헤더(태국어) — SSO_eForm 안내(คอลัมน์ J/K/L)와 열 위치를 맞춤 */
export const THAI_SSO_EFORM_V15_DATA_HEADERS_TH = [
  "ลำดับ",
  "เดือน (1-12)",
  "ปี พ.ศ.",
  "เลขบัตรประชาชน (13 หลัก)",
  "คำนำหน้า",
  "ชื่อ",
  "นามสกุล",
  "ค่าจ้างที่ใช้คำนวณเงินสมทบ (บาท)",
  "เลขประจำตัวผู้ประกันตน (ถ้ามี)",
  "วันที่เริ่มงานใหม่ / วันที่พ้นสภาพ (DD/MM/YYYY)",
  "ชื่อสถานประกอบการเดิม (ถ้ามี)",
  "รหัสเหตุผลสิ้นสุดความเป็นผู้ประกันตน (ถ้ามี)",
] as const

const SHEET_DATA = "Data"
const SHEET_README = "README_SSO_eForm"

export function splitEmployeeNameForThaiSsoEform(fullName: string, nameTitle: string): { first: string; last: string } {
  let rest = String(fullName || "").trim()
  const tt = String(nameTitle || "").trim()
  if (tt && rest.startsWith(tt)) {
    rest = rest.slice(tt.length).trim()
  }
  const parts = rest.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1]! }
  }
  return { first: rest, last: "" }
}

function parseYearMonth(ym: string): { y: number; m: number } | null {
  const s = (ym || "").trim().slice(0, 7)
  const m = /^(\d{4})-(\d{2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null
  return { y, m: mo }
}

/** 방콕 달력 기준: 해당 YYYY-MM 안에 날짜(YYYY-MM-DD)가 속하는지 */
export function dateYmMatchesBangkok(dateStr: string, yearMonth: string): boolean {
  const d = String(dateStr || "").trim().slice(0, 10)
  const ym = (yearMonth || "").trim().slice(0, 7)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}$/.test(ym)) return false
  return d.startsWith(ym)
}

/** DD/MM/YYYY (태국 업무에서 흔한 표기) */
export function formatDateDdMmYyyy(isoYmd: string): string {
  const d = String(isoYmd || "").trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) return ""
  return `${m[3]}/${m[2]}/${m[1]}`
}

function citizenDigits13(raw: unknown): string {
  const s = raw != null ? String(raw).trim() : ""
  const digits = s.replace(/\D/g, "")
  if (digits.length === 13) return digits
  return digits
}

/**
 * getPayrollCalc list 행 → SSO_eForm Data 한 줄 (값만, 헤더는 별도)
 */
export function mapPayrollCalcRowToSsoEformV15DataRow(
  r: Record<string, unknown>,
  seq: number,
  yearMonth: string,
  filingWageMode: SsoFilingWageMode = "contributable"
): (string | number)[] {
  const parsed = parseYearMonth(yearMonth)
  const monthNum = parsed?.m ?? ""
  const beYear = parsed ? parsed.y + 543 : ""

  const name = String(r.name || "").trim()
  const nameTitle = r.nameTitle != null ? String(r.nameTitle).trim() : ""
  const { first, last } = splitEmployeeNameForThaiSsoEform(name, nameTitle)

  const idDigits = citizenDigits13(r.idNumber)
  const ssoMem = r.ssoMemberNo != null ? String(r.ssoMemberNo).replace(/\s/g, "").trim() : ""

  const join = String(r.joinDate || "").slice(0, 10)
  const resign = String(r.resignDate || "").slice(0, 10)

  let jCell = ""
  if (dateYmMatchesBangkok(resign, yearMonth)) {
    jCell = formatDateDdMmYyyy(resign)
  } else if (dateYmMatchesBangkok(join, yearMonth)) {
    jCell = formatDateDdMmYyyy(join)
  }

  const ssoBase = resolveSsoFilingWageBaht(r, filingWageMode)

  return [
    seq,
    monthNum,
    beYear,
    idDigits,
    nameTitle,
    first,
    last,
    ssoBase,
    ssoMem,
    jCell,
    "",
    "",
  ]
}

function readmeRows(ym: string): string[][] {
  return [
    ["SSO_eForm Ver.1.5 style — CM ERP export"],
    [""],
    [
      "This workbook is NOT the original .xlsm. Use sheet “Data”: copy the block (header + rows) into your SSO_eForm “Data” sheet,",
    ],
    ["or paste values only if your template already has identical headers in row 1."],
    [""],
    [
      "Columns A–L follow common ExcelforHR instructions: J = hire or resign date in the filing month, K = previous employer, L = termination reason code.",
    ],
    ["ERP fills K/L only when you add fields later; K/L are left blank by default."],
    [""],
    ["Wage column (H) = SSO contribution base from getPayrollCalc (ssoBase), same as the in-house ERP template."],
    [""],
    [`ERP period: ${ym}`],
    ["Always verify column order against YOUR downloaded SSO_eForm file before uploading to SSO."],
  ]
}

export async function downloadThaiSsoEformV15FromPayrollXlsx(params: {
  yearMonth: string
  payrollRows: Record<string, unknown>[]
  filingWageMode?: SsoFilingWageMode
}): Promise<void> {
  const ym = (params.yearMonth || "").trim().slice(0, 7) || "YYYY-MM"
  const filingWageMode = params.filingWageMode || "contributable"
  const wb = XLSX.utils.book_new()

  const wsReadme = XLSX.utils.aoa_to_sheet(readmeRows(ym))
  wsReadme["!cols"] = [{ wch: 100 }]
  XLSX.utils.book_append_sheet(wb, wsReadme, SHEET_README)

  const lines = (params.payrollRows || []).map((r, i) =>
    mapPayrollCalcRowToSsoEformV15DataRow(r, i + 1, ym, filingWageMode)
  )
  const aoa: (string | number)[][] = [[...THAI_SSO_EFORM_V15_DATA_HEADERS_TH], ...lines]
  if (lines.length === 0) {
    aoa.push(THAI_SSO_EFORM_V15_DATA_HEADERS_TH.map(() => ""))
  }
  const wsData = XLSX.utils.aoa_to_sheet(aoa)
  wsData["!cols"] = THAI_SSO_EFORM_V15_DATA_HEADERS_TH.map(() => ({ wch: 22 }))
  XLSX.utils.book_append_sheet(wb, wsData, SHEET_DATA)

  const safeYm = ym.replace(/[/\\?%*:|"<>]/g, "-")
  await writeErpXlsxWorkbook(wb, `thai-sso-eform-v15-data-${safeYm}.xlsx`)
}

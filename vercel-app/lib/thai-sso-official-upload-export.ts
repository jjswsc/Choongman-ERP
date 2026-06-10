/**
 * 태국 SSO e-Service 공식 일괄 업로드 엑셀 (SampleExcel.xlsx 기준).
 * 시트 1장 · 6열(A–F) · 시트 이름 = 사회보험청 지정 지점 순번 6자리(ลำดับที่สาขา).
 */
import * as XLSX from "xlsx"
import { splitEmployeeNameForThaiSsoEform } from "@/lib/thai-sso-eform-v15"
import { type SsoFilingWageMode, resolveSsoFilingWageBaht } from "@/lib/payroll-utils"
import { citizenDigits13Only } from "@/lib/thai-sso-sps1-10-export"

/** 공식 업로드 1행 헤더 — www.sso.go.th/eservices SampleExcel.xlsx 와 동일 */
export const SSO_OFFICIAL_UPLOAD_HEADERS_TH = [
  "เลขประจำตัวประชาชน",
  "คำนำหน้าชื่อ",
  "ชื่อผู้ประกันตน",
  "นามสกุลผู้ประกันตน",
  "ค่าจ้าง",
  "จำนวนเงินสมทบ",
] as const

export type SsoOfficialUploadColumnHelp = {
  labelTh: string
  labelEn: string
  labelKo: string
}

export const SSO_OFFICIAL_UPLOAD_COLUMN_HELP: SsoOfficialUploadColumnHelp[] = [
  {
    labelTh: SSO_OFFICIAL_UPLOAD_HEADERS_TH[0],
    labelEn: "National ID (13 digits)",
    labelKo: "주민번호 (13자리)",
  },
  {
    labelTh: SSO_OFFICIAL_UPLOAD_HEADERS_TH[1],
    labelEn: "Title (นาย/นาง/นางสาว)",
    labelKo: "호칭 (นาย/นาง/นางสาว)",
  },
  {
    labelTh: SSO_OFFICIAL_UPLOAD_HEADERS_TH[2],
    labelEn: "Insured first name",
    labelKo: "피부양자 이름",
  },
  {
    labelTh: SSO_OFFICIAL_UPLOAD_HEADERS_TH[3],
    labelEn: "Insured last name",
    labelKo: "피부양자 성",
  },
  {
    labelTh: SSO_OFFICIAL_UPLOAD_HEADERS_TH[4],
    labelEn: "Wage (THB)",
    labelKo: "임금 (THB)",
  },
  {
    labelTh: SSO_OFFICIAL_UPLOAD_HEADERS_TH[5],
    labelEn: "Employee contribution (THB)",
    labelKo: "근로자 부담금 (THB)",
  },
]

export function resolveSsoOfficialUploadColumnLabel(col: SsoOfficialUploadColumnHelp, lang: string): string {
  if (lang === "th") return col.labelTh
  if (lang === "ko") return col.labelKo
  return col.labelEn
}

export type SsoOfficialUploadSheet = {
  /** ลำดับที่สาขา — Excel 시트 탭 이름(6자리) */
  branchCode: string
  rows: Record<string, unknown>[]
}

/** 사회보험청 지점 순번 → Excel 시트 이름 (6자리, 미입력 시 000000) */
export function normalizeSsoOfficialSheetName(branchCode: string): string {
  const digits = String(branchCode || "")
    .replace(/\D/g, "")
    .trim()
  if (!digits) return "000000"
  return digits.padStart(6, "0").slice(-6)
}

function citizenIdCellValue(raw: unknown): number | string {
  const digits = citizenDigits13Only(raw)
  if (digits.length === 13) {
    const n = Number(digits)
    if (Number.isSafeInteger(n)) return n
  }
  return digits
}

export function mapPayrollRowToOfficialUploadRow(
  r: Record<string, unknown>,
  filingWageMode: SsoFilingWageMode = "contributable"
): (string | number)[] {
  const nameTitle = r.nameTitle != null ? String(r.nameTitle).trim() : ""
  const { first, last } = splitEmployeeNameForThaiSsoEform(String(r.name || ""), nameTitle)
  const wage = resolveSsoFilingWageBaht(r, filingWageMode)
  const contribution = Math.max(0, Math.floor(Number(r.sso) || 0))
  return [citizenIdCellValue(r.idNumber), nameTitle, first, last, wage, contribution]
}

function buildOfficialUploadWorksheet(
  rows: Record<string, unknown>[],
  filingWageMode: SsoFilingWageMode
): XLSX.WorkSheet {
  const lines = rows.map((r) => mapPayrollRowToOfficialUploadRow(r, filingWageMode))
  const aoa: (string | number)[][] = [[...SSO_OFFICIAL_UPLOAD_HEADERS_TH], ...lines]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 14 }]
  return ws
}

function sanitizeWorkbookSheetName(name: string): string {
  return name.replace(/[/\\?*:[\]]/g, "-").slice(0, 31) || "000000"
}

function uniqueSheetName(base: string, used: Set<string>): string {
  const name = sanitizeWorkbookSheetName(base)
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  for (let i = 2; i < 100; i++) {
    const candidate = sanitizeWorkbookSheetName(`${base.slice(0, 28)}_${i}`)
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
  const fallback = sanitizeWorkbookSheetName(`${base}_${Date.now()}`)
  used.add(fallback)
  return fallback
}

/** 공식 6열 업로드 파일 — 지점별 시트(탭 이름 = 6자리 ลำดับที่สาขา) */
export function downloadThaiSsoOfficialUploadFromPayrollXlsx(params: {
  yearMonth: string
  sheets: SsoOfficialUploadSheet[]
  filingWageMode?: SsoFilingWageMode
}): void {
  const ym = (params.yearMonth || "").trim().slice(0, 7) || "YYYY-MM"
  const filingWageMode = params.filingWageMode || "contributable"
  const wb = XLSX.utils.book_new()
  const usedNames = new Set<string>()
  const nonEmpty = (params.sheets || []).filter((s) => (s.rows || []).length > 0)

  for (const sheet of nonEmpty) {
    const tabName = uniqueSheetName(normalizeSsoOfficialSheetName(sheet.branchCode), usedNames)
    const ws = buildOfficialUploadWorksheet(sheet.rows, filingWageMode)
    XLSX.utils.book_append_sheet(wb, ws, tabName)
  }

  if (nonEmpty.length === 0) {
    const ws = buildOfficialUploadWorksheet([], filingWageMode)
    XLSX.utils.book_append_sheet(wb, ws, "000000")
  }

  const primaryBranch = normalizeSsoOfficialSheetName(nonEmpty[0]?.branchCode || "000000")
  const safeYm = ym.replace(/[/\\?%*:|"<>]/g, "-")
  XLSX.writeFile(wb, `thai-sso-official-upload-${primaryBranch}-${safeYm}.xlsx`)
}

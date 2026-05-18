/**
 * 태국 사회보험(ประกันสังคม) 납부·신고용 엑셀 템플릿.
 * SSO 온라인 일괄 업로드 형식은 시점·버전별로 달라질 수 있으므로,
 * 이 파일은 ERP 내부 집계·수작업 정리용 표준 열을 제공하고, 제출 전 공식 양식과 대조하도록 안내한다.
 * 서드파티 **SSO_eForm v1.5**류(Data 시트 12열)는 `thai-sso-eform-v15.ts`를 사용한다.
 */
import * as XLSX from "xlsx"
import { type SsoFilingWageMode, resolveSsoFilingWageBaht } from "@/lib/payroll-utils"

/** UI 표·문서용 — 열 설명 (공식 สปส.1-10·e-Service 일괄파일과 1:1이 아닐 수 있음) */
export const THAI_SSO_TEMPLATE_COLUMN_HELP: {
  field: string
  labelTh: string
  labelEn: string
}[] = [
  { field: "contribution_month", labelTh: "งวดเดือนนำส่ง (YYYY-MM)", labelEn: "Contribution month (YYYY-MM)" },
  { field: "employer_sso_account_no", labelTh: "เลขที่บัญชีนายจ้าง (สปส.)", labelEn: "Employer SSO account no." },
  { field: "branch_no", labelTh: "รหัสสาขา (ถ้ามี)", labelEn: "Branch code (optional)" },
  { field: "seq", labelTh: "ลำดับ", labelEn: "Line no." },
  { field: "name_title_th", labelTh: "คำนำหน้า", labelEn: "Title (e.g. นาย/นาง/นางสาว)" },
  { field: "citizen_id_13", labelTh: "เลขบัตรประชาชน 13 หลัก", labelEn: "National ID (13 digits)" },
  {
    field: "sso_insured_member_no",
    labelTh: "เลขประจำตัวผู้ประกันตน (บัตรประกันสังคม)",
    labelEn: "SSO insured person / card no. (HR sso_number)",
  },
  { field: "full_name_th", labelTh: "ชื่อ–สกุล", labelEn: "Full name" },
  { field: "date_of_birth", labelTh: "วันเกิด (YYYY-MM-DD)", labelEn: "Date of birth" },
  { field: "join_date", labelTh: "วันเริ่มงาน (YYYY-MM-DD)", labelEn: "Join date" },
  { field: "resign_date", labelTh: "วันสิ้นสุด (YYYY-MM-DD)", labelEn: "Resign date (if any)" },
  { field: "wage_base_thb", labelTh: "ค่าจ้างฐานคำนวณ (บาท)", labelEn: "Wage base for SSO (THB)" },
  { field: "employee_contribution_thb", labelTh: "เงินสมทบผู้ประกันตน (บาท)", labelEn: "Employee contribution (THB)" },
  { field: "employer_contribution_thb", labelTh: "เงินสมทบนายจ้าง (บาท)", labelEn: "Employer contribution (THB)" },
  { field: "exempt_y_n", labelTh: "ได้รับการยกเว้น (Y/N)", labelEn: "Exempt (Y/N)" },
  { field: "memo", labelTh: "หมายเหตุ", labelEn: "Remarks" },
]

const SHEET_INSTRUCTIONS = "instructions"
const SHEET_DATA = "contributions"

const COL_WIDTHS = [
  { wch: 18 },
  { wch: 22 },
  { wch: 12 },
  { wch: 6 },
  { wch: 10 },
  { wch: 16 },
  { wch: 20 },
  { wch: 26 },
  { wch: 14 },
  { wch: 14 },
  { wch: 14 },
  { wch: 14 },
  { wch: 16 },
  { wch: 16 },
  { wch: 10 },
  { wch: 24 },
]

function instructionRows(ym: string, source: "blank" | "payroll"): string[][] {
  const payrollNote =
    source === "payroll"
      ? [
          "Data rows: CM ERP getPayrollCalc. employer_sso_account_no / branch_no empty unless you fill — match official template.",
        ]
      : []
  return [
    ["Thailand SSO (สำนักงานประกันสังคม) — ERP template"],
    [""],
    [
      "สำคัญ / Important: แบบฟอร์มอัปโหลดจริงของ www.sso.go.th อาจมีคอลัมน์หรือลำดับต่างจากไฟล์นี้",
    ],
    [
      "Before submitting, compare this file with the latest bulk Excel from the SSO e-service and align columns.",
    ],
    [""],
    ["Fields ERP may NOT cover (check official file / สปส.):"],
    ["• Company-level employer registration / branch codes, insured-type codes (ม.33/39 etc.), passport for foreign workers."],
    ["• Split ชื่อ/นามสกุล if the portal requires separate columns — ERP exports combined name + optional title."],
    [""],
    ["Suggested workflow:"],
    ["• Prefer «e-Service upload» export from ERP (thai-sso-eservice-bulk-export.ts)."],
    ["• This legacy sheet is for internal review only if you still use it."],
    ...payrollNote.map((line) => [line]),
    [""],
    [`Selected period (ERP): ${ym}`],
  ]
}

function appendSheets(wb: XLSX.WorkBook, ym: string, source: "blank" | "payroll", dataRows: (string | number)[][]) {
  const instr = instructionRows(ym, source)
  const wsInstr = XLSX.utils.aoa_to_sheet(instr)
  wsInstr["!cols"] = [{ wch: 92 }]
  XLSX.utils.book_append_sheet(wb, wsInstr, SHEET_INSTRUCTIONS)

  const headerEn = THAI_SSO_TEMPLATE_COLUMN_HELP.map((c) => c.field)
  const headerTh = THAI_SSO_TEMPLATE_COLUMN_HELP.map((c) => c.labelTh)
  const aoa: (string | number)[][] = [headerEn, headerTh, ...dataRows]
  const wsData = XLSX.utils.aoa_to_sheet(aoa)
  wsData["!cols"] = COL_WIDTHS
  XLSX.utils.book_append_sheet(wb, wsData, SHEET_DATA)
}

/** getPayrollCalc API list 항목 한 줄 */
export function mapPayrollCalcRowToSsoDataRow(
  r: Record<string, unknown>,
  seq: number,
  yearMonth: string,
  filingWageMode: SsoFilingWageMode = "contributable"
): (string | number)[] {
  const ym = (yearMonth || "").trim().slice(0, 7)
  const ssoExempt = r.ssoExempt === true
  const name = String(r.name || "").trim()
  const store = String(r.store || "").trim()
  const idRaw = r.idNumber != null ? String(r.idNumber).trim() : ""
  const nameTitle = r.nameTitle != null ? String(r.nameTitle).trim() : ""
  const ssoMem = r.ssoMemberNo != null ? String(r.ssoMemberNo).trim() : ""
  const dob = String(r.dateOfBirth || "").slice(0, 10)
  const jd = String(r.joinDate || "").slice(0, 10)
  const rd = String(r.resignDate || "").slice(0, 10)
  const ssoBase = resolveSsoFilingWageBaht(r, filingWageMode)
  const empSso = Math.max(0, Math.floor(Number(r.sso) || 0))
  const erSso = Math.max(0, Math.floor(Number(r.employerSso ?? r.sso) || 0))
  const memo = store ? `ERP store: ${store}` : "ERP payroll export"
  return [
    ym,
    "",
    "",
    seq,
    nameTitle,
    idRaw,
    ssoMem,
    name,
    dob,
    jd,
    rd,
    ssoBase,
    empSso,
    erSso,
    ssoExempt ? "Y" : "N",
    memo,
  ]
}

export function downloadThaiSsoFilingFromPayrollXlsx(params: {
  yearMonth: string
  payrollRows: Record<string, unknown>[]
  filingWageMode?: SsoFilingWageMode
}): void {
  const ym = (params.yearMonth || "").trim().slice(0, 7) || "YYYY-MM"
  const filingWageMode = params.filingWageMode || "contributable"
  const wb = XLSX.utils.book_new()
  const lines = (params.payrollRows || []).map((r, i) =>
    mapPayrollCalcRowToSsoDataRow(r, i + 1, ym, filingWageMode)
  )
  appendSheets(wb, ym, "payroll", lines.length ? lines : [THAI_SSO_TEMPLATE_COLUMN_HELP.map(() => "")])
  const safeYm = ym.replace(/[/\\?%*:|"<>]/g, "-")
  XLSX.writeFile(wb, `thai-sso-from-payroll-${safeYm}.xlsx`)
}

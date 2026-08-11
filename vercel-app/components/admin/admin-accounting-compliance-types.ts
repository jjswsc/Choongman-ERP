export type VatDraft = {
  id?: number
  doc_date: string
  tax_month: string
  direction: "output" | "input"
  counterparty_name: string
  counterparty_tax_id: string
  invoice_number: string
  net_amount: string
  vat_amount: string
  total_amount: string
  vat_status: string
  invoice_evidence_status: "required_pending" | "received" | "not_required" | "unobtainable"
  invoice_evidence_reason_code: string
  filing_status: "draft" | "submitted"
  submitted_at: string
  submitted_by: string
  memo: string
  store_name: string
}

export type WhtDraft = {
  id?: number
  payment_date: string
  tax_month: string
  payee_name: string
  payee_tax_id: string
  income_type: string
  gross_amount: string
  wht_rate: string
  wht_amount: string
  form_hint: string
  certificate_no: string
  filing_status: "draft" | "submitted"
  submitted_at: string
  submitted_by: string
  memo: string
  store_name: string
  direction: "inbound" | "outbound"
  source_type: string
}

export type Pp36Draft = {
  id?: number
  doc_date: string
  tax_month: string
  supplier_name: string
  supplier_country: string
  supplier_tax_id: string
  service_desc: string
  taxable_amount: string
  vat_rate: string
  vat_amount: string
  filing_status: "draft" | "submitted"
  submitted_at: string
  submitted_by: string
  memo: string
  store_name: string
}

export type Pnd54Draft = {
  id?: number
  payment_date: string
  tax_month: string
  payee_name: string
  payee_country: string
  payee_tax_id: string
  income_type: string
  gross_amount: string
  wht_rate: string
  wht_amount: string
  filing_status: "draft" | "submitted"
  submitted_at: string
  submitted_by: string
  memo: string
  store_name: string
}

export type Pnd1IssueCode =
  | "missing_payee_name"
  | "missing_payee_tax_id"
  | "invalid_payee_tax_id_length"
  | "missing_payment_date"
  | "invalid_payment_date"
  | "missing_income_type"
  | "non_positive_withheld_amount"

export const PND1_ISSUE_CODES: Pnd1IssueCode[] = [
  "missing_payee_name",
  "missing_payee_tax_id",
  "invalid_payee_tax_id_length",
  "missing_payment_date",
  "invalid_payment_date",
  "missing_income_type",
  "non_positive_withheld_amount",
]

export type Kt20kSummaryResponse = {
  year: number
  storeFilter: string
  rows: {
    month: string
    employeeCount: number
    salaryAmount: number
    dailyWageAmount: number
    otherCompAmount: number
    totalWage: number
    excessOver20000: number
    netWageToReport: number
  }[]
  annual: {
    employeeCountPeak: number
    salaryAmount: number
    dailyWageAmount: number
    otherCompAmount: number
    totalWage: number
    excessOver20000: number
    netWageToReport: number
  }
  reconciliation: {
    monthly: {
      month: string
      kt20kTotalWage: number
      kt20kNetWage: number
      pnd1aLedgerGross: number
      diffTotalVsPnd1a: number
      diffNetVsPnd1a: number
    }[]
    employeeTopDiff: {
      employeeKey: string
      name: string
      store: string
      kt20kTotalWage: number
      pnd1aLedgerGross: number
      diff: number
      reasonTags: string[]
    }[]
    annual: {
      kt20kTotalWage: number
      kt20kNetWage: number
      pnd1aLedgerGross: number
      diffTotalVsPnd1a: number
      diffNetVsPnd1a: number
    }
  }
  warnings: string[]
}

export type Kt20kReasonTag =
  | "missing_in_pnd1a"
  | "missing_in_kt20k"
  | "amount_mismatch"
  | "possible_store_mismatch"
  | "possible_name_mismatch"

export const KT20K_REASON_TAGS: Kt20kReasonTag[] = [
  "missing_in_pnd1a",
  "missing_in_kt20k",
  "amount_mismatch",
  "possible_store_mismatch",
  "possible_name_mismatch",
]

export const KT20K_TAGS_QUERY_KEY = "kt20k_tags"
export const KT20K_TOL_QUERY_KEY = "kt20k_tol"
export const KT20K_YEAR_QUERY_KEY = "kt20k_year"
export const KT20K_STORE_QUERY_KEY = "kt20k_store"
export const KT20K_TAB_QUERY_KEY = "kt20k_tab"
export const PP30_FETCH_TIMEOUT_MS = 120000

export type SsoPayrollPreview = {
  rowCount: number
  storeCount: number
  totalEmployeeSso: number
  totalEmployerSso: number
  totalContribution: number
  missingCitizenIdCount: number
  missingSsoMemberNoCount: number
}

export type SsoSubmissionMeta = {
  summaryLine?: string
  memo: string
  attachmentUrls: string[]
  submittedAt?: string
  submittedBy?: string
}

export type EtaxTimestampMeta = {
  taxId: string
  branchCode: string
  rdContactEmail: string
  senderGmail: string
  activateCodeRef: string
  memo: string
  attachmentUrls: string[]
  applySubmitted: boolean
  ko01Printed: boolean
  docsUploaded: boolean
  emailConfirmed: boolean
  activateCodeReceived: boolean
  passwordSet: boolean
  senderEmailRegistered: boolean
  pilotIssued: boolean
  stepAudit?: Partial<Record<EtaxStepKey, { doneAt: string; doneBy: string }>>
  updatedAt?: string
  updatedBy?: string
}

export type EtaxStepKey =
  | "applySubmitted"
  | "ko01Printed"
  | "docsUploaded"
  | "emailConfirmed"
  | "activateCodeReceived"
  | "passwordSet"
  | "senderEmailRegistered"
  | "pilotIssued"

export const SSO_WORKFLOW_NOTE_PREFIX = "SSO_SUBMISSION::"
export const ETAX_TIMESTAMP_NOTE_PREFIX = "ETAX_TIMESTAMP::"

export type AdminAccountingComplianceProps = {
  initialTab?: string
  hideTabBar?: boolean
  initialPp30SubView?: "output" | "input" | "settlement" | "wht"
  /** PP30 영역 표시 모드: all(통합) / vat_only(매출·매입만) / wht_only(원천만) */
  pp30Mode?: "all" | "vat_only" | "wht_only"
  /** 원천징수 영역 포커스 모드 — 세무신고 탭별 단일 서식 분리 포함 */
  whtFocusMode?:
    | "all"
    | "pnd1391"
    | "pnd5354"
    | "pp36"
    | "pnd1"
    | "pnd91"
    | "pnd3"
    | "pnd53"
    | "pnd54"
  /** 원천징수 제출형 기본값 */
  initialWhtSubmissionFormHint?: "PND3" | "PND53" | "ALL"
  /** 세무 신고 셸과 동기화 시 본문의 중복 년·매장 입력 숨김 */
  filingYearMonth?: string
  onFilingYearMonthChange?: (v: string) => void
  filingStoreFilter?: string
  onFilingStoreFilterChange?: (v: string) => void
  /** PP30 화면에서 매장 납세자 정보 탭으로 이동 */
  onOpenStoreProfiles?: () => void
  /** 세무 신고 셸 SSO·PP30 필터 카드 검색 버튼 틱 */
  filingSearchTick?: number
  /** 세무 신고 셸 PP30 검색 시 PP36 등 하위 섹션 동기 조회 */
  onFilingSearch?: () => void
  /** P.P30/P.P36 탭 하단 PP36 임베드 전용 — P.N.D 탭 등 다른 wht_only 화면과 구분 */
  embeddedPp36Section?: boolean
  /** 세무 신고 P.N.D.50/51 탭 — 반기·연간 신고 주기 전용 필터 */
  citFilingShell?: boolean
}

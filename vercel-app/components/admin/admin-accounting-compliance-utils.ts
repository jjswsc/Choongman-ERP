import type {
  VatDraft,
  WhtDraft,
  Pp36Draft,
  Pnd54Draft,
  SsoPayrollPreview,
  SsoSubmissionMeta,
  EtaxTimestampMeta,
  EtaxStepKey,
} from "./admin-accounting-compliance-types"
import { SSO_WORKFLOW_NOTE_PREFIX, ETAX_TIMESTAMP_NOTE_PREFIX } from "./admin-accounting-compliance-types"
import { isPosAutoVatOutputRow } from "@/lib/vat-ledger-pos"

export function ymNow(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
}

export function emptyVat(taxMonth: string, defaultStoreName = ""): VatDraft {
  return {
    doc_date: `${taxMonth}-01`,
    tax_month: taxMonth,
    direction: "output",
    counterparty_name: "",
    counterparty_tax_id: "",
    invoice_number: "",
    net_amount: "",
    vat_amount: "",
    total_amount: "",
    vat_status: "",
    invoice_evidence_status: "required_pending",
    invoice_evidence_reason_code: "",
    filing_status: "draft",
    submitted_at: "",
    submitted_by: "",
    memo: "",
    store_name: defaultStoreName,
  }
}

export function withheldFromGrossAndRate(grossRaw: string, rateRaw: string): string | null {
  const grossText = String(grossRaw ?? "").replace(/,/g, "").trim()
  const rateText = String(rateRaw ?? "").replace(/,/g, "").trim()
  if (!grossText || !rateText) return null
  const gross = Number(grossText)
  const rate = Number(rateText)
  if (!Number.isFinite(gross) || !Number.isFinite(rate)) return null
  return String(Math.round(((gross * rate) / 100) * 100) / 100)
}

export function mergeWhtAmountPatch<T extends { gross_amount: string; wht_rate: string; wht_amount: string }>(
  row: T,
  patch: Partial<Pick<T, "gross_amount" | "wht_rate" | "wht_amount">> & Partial<T>
): T {
  const next = { ...row, ...patch }
  if ("gross_amount" in patch || "wht_rate" in patch) {
    const withheld = withheldFromGrossAndRate(next.gross_amount, next.wht_rate)
    if (withheld != null) next.wht_amount = withheld as T["wht_amount"]
  }
  return next
}

export function emptyWht(taxMonth: string, defaultStoreName: string): WhtDraft {
  return {
    payment_date: `${taxMonth}-01`,
    tax_month: taxMonth,
    payee_name: "",
    payee_tax_id: "",
    income_type: "",
    gross_amount: "",
    wht_rate: "",
    wht_amount: "",
    form_hint: "",
    certificate_no: "",
    filing_status: "draft",
    submitted_at: "",
    submitted_by: "",
    memo: "",
    store_name: defaultStoreName,
    direction: "outbound",
    source_type: "manual",
    source_id: 0,
  }
}

export function emptyPp36(taxMonth: string, defaultStoreName: string): Pp36Draft {
  return {
    doc_date: `${taxMonth}-01`,
    tax_month: taxMonth,
    supplier_name: "",
    supplier_country: "",
    supplier_tax_id: "",
    service_desc: "",
    taxable_amount: "",
    vat_rate: "7",
    vat_amount: "",
    filing_status: "draft",
    submitted_at: "",
    submitted_by: "",
    memo: "",
    store_name: defaultStoreName,
  }
}

export function emptyPnd54(taxMonth: string, defaultStoreName: string): Pnd54Draft {
  return {
    payment_date: `${taxMonth}-01`,
    tax_month: taxMonth,
    payee_name: "",
    payee_country: "",
    payee_tax_id: "",
    income_type: "",
    gross_amount: "",
    wht_rate: "",
    wht_amount: "",
    filing_status: "draft",
    submitted_at: "",
    submitted_by: "",
    memo: "",
    store_name: defaultStoreName,
  }
}

export function normalizeLedgerFilingStatus(v: unknown): "draft" | "submitted" {
  return String(v || "").trim().toLowerCase() === "submitted" ? "submitted" : "draft"
}

export function mapVatEntries(entries: Record<string, unknown>[], taxMonth: string): VatDraft[] {
  return entries.map((r) => ({
    id: r.id != null ? Number(r.id) : undefined,
    doc_date: String(r.doc_date || "").slice(0, 10),
    tax_month: String(r.tax_month || taxMonth).slice(0, 7),
    direction: String(r.direction || "").trim().toLowerCase() === "input" ? "input" : "output",
    counterparty_name: String(r.counterparty_name || ""),
    counterparty_tax_id: String(r.counterparty_tax_id || ""),
    invoice_number: String(r.invoice_number || ""),
    net_amount: String(r.net_amount ?? ""),
    vat_amount: String(r.vat_amount ?? ""),
    total_amount: String(r.total_amount ?? ""),
    vat_status: String(r.vat_status || ""),
    invoice_evidence_status:
      r.invoice_evidence_status === "received" ||
      r.invoice_evidence_status === "not_required" ||
      r.invoice_evidence_status === "unobtainable"
        ? (r.invoice_evidence_status as "received" | "not_required" | "unobtainable")
        : "required_pending",
    invoice_evidence_reason_code: String(r.invoice_evidence_reason_code || ""),
    filing_status: normalizeLedgerFilingStatus(r.filing_status),
    submitted_at: String(r.submitted_at || ""),
    submitted_by: String(r.submitted_by || ""),
    memo: String(r.memo || ""),
    store_name: String(r.store_name || ""),
  }))
}

export function mapWhtEntries(entries: Record<string, unknown>[], taxMonth: string): WhtDraft[] {
  return entries.map((r) => ({
    id: r.id != null ? Number(r.id) : undefined,
    payment_date: String(r.payment_date || "").slice(0, 10),
    tax_month: String(r.tax_month || taxMonth).slice(0, 7),
    payee_name: String(r.payee_name || ""),
    payee_tax_id: String(r.payee_tax_id || ""),
    income_type: String(r.income_type || ""),
    gross_amount: String(r.gross_amount ?? ""),
    wht_rate: String(r.wht_rate ?? ""),
    wht_amount: String(r.wht_amount ?? ""),
    form_hint: String(r.form_hint || ""),
    certificate_no: String(r.certificate_no || ""),
    filing_status: normalizeLedgerFilingStatus(r.filing_status),
    submitted_at: String(r.submitted_at || ""),
    submitted_by: String(r.submitted_by || ""),
    memo: String(r.memo || ""),
    store_name: String(r.store_name || ""),
    direction: String(r.direction || "").toLowerCase() === "inbound" ? "inbound" : "outbound",
    source_type: String(r.source_type || ""),
    source_id: r.source_id != null ? Number(r.source_id) || 0 : 0,
  }))
}

export function mapPp36Entries(entries: Record<string, unknown>[], taxMonth: string): Pp36Draft[] {
  return entries.map((r) => ({
    id: r.id != null ? Number(r.id) : undefined,
    doc_date: String(r.doc_date || "").slice(0, 10),
    tax_month: String(r.tax_month || taxMonth).slice(0, 7),
    supplier_name: String(r.supplier_name || ""),
    supplier_country: String(r.supplier_country || ""),
    supplier_tax_id: String(r.supplier_tax_id || ""),
    service_desc: String(r.service_desc || ""),
    taxable_amount: String(r.taxable_amount ?? ""),
    vat_rate: String(r.vat_rate ?? "7"),
    vat_amount: String(r.vat_amount ?? ""),
    filing_status: normalizeLedgerFilingStatus(r.filing_status),
    submitted_at: String(r.submitted_at || ""),
    submitted_by: String(r.submitted_by || ""),
    memo: String(r.memo || ""),
    store_name: String(r.store_name || ""),
  }))
}

export function mapPnd54Entries(entries: Record<string, unknown>[], taxMonth: string): Pnd54Draft[] {
  return entries.map((r) => ({
    id: r.id != null ? Number(r.id) : undefined,
    payment_date: String(r.payment_date || "").slice(0, 10),
    tax_month: String(r.tax_month || taxMonth).slice(0, 7),
    payee_name: String(r.payee_name || ""),
    payee_country: String(r.payee_country || ""),
    payee_tax_id: String(r.payee_tax_id || ""),
    income_type: String(r.income_type || ""),
    gross_amount: String(r.gross_amount ?? ""),
    wht_rate: String(r.wht_rate ?? ""),
    wht_amount: String(r.wht_amount ?? ""),
    filing_status: normalizeLedgerFilingStatus(r.filing_status),
    submitted_at: String(r.submitted_at || ""),
    submitted_by: String(r.submitted_by || ""),
    memo: String(r.memo || ""),
    store_name: String(r.store_name || ""),
  }))
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export type VatInputClaimable = {
  claimableVat: number
  claimableNet: number
  pendingVat: number
  unobtainableVat: number
  claimableCount: number
  pendingCount: number
  unobtainableCount: number
}

/** 매입 VAT 중 증빙 수령·불요 건만 공제 가능, 대기·불가는 따로 집계 */
export function computeVatInputClaimable(inputRows: VatDraft[]): VatInputClaimable {
  const claimableRows = inputRows.filter(
    (r) => r.invoice_evidence_status === "received" || r.invoice_evidence_status === "not_required"
  )
  const pendingRows = inputRows.filter((r) => r.invoice_evidence_status === "required_pending")
  const unobtainableRows = inputRows.filter((r) => r.invoice_evidence_status === "unobtainable")
  return {
    claimableVat: round2(claimableRows.reduce((sum, r) => sum + (Number(r.vat_amount) || 0), 0)),
    claimableNet: round2(claimableRows.reduce((sum, r) => sum + (Number(r.net_amount) || 0), 0)),
    pendingVat: round2(pendingRows.reduce((sum, r) => sum + (Number(r.vat_amount) || 0), 0)),
    unobtainableVat: round2(unobtainableRows.reduce((sum, r) => sum + (Number(r.vat_amount) || 0), 0)),
    claimableCount: claimableRows.length,
    pendingCount: pendingRows.length,
    unobtainableCount: unobtainableRows.length,
  }
}

export function computeVatSettlement(
  outputRows: VatDraft[],
  inputRows: VatDraft[],
  claimable: VatInputClaimable,
  summaryPayableVat: number | null | undefined
) {
  const outputNet = round2(outputRows.reduce((sum, row) => sum + Number(row.net_amount || 0), 0))
  const outputVat = round2(outputRows.reduce((sum, row) => sum + Number(row.vat_amount || 0), 0))
  const outputTotal = round2(outputRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0))
  const inputNet = round2(inputRows.reduce((sum, row) => sum + Number(row.net_amount || 0), 0))
  const inputVat = round2(inputRows.reduce((sum, row) => sum + Number(row.vat_amount || 0), 0))
  const inputTotal = round2(inputRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0))
  let posOutputVat = 0
  let posOutputNet = 0
  let posOutputCount = 0
  let otherOutputVat = 0
  let otherOutputNet = 0
  let otherOutputCount = 0
  for (const row of outputRows) {
    const vat = Number(row.vat_amount || 0)
    const net = Number(row.net_amount || 0)
    if (isPosAutoVatOutputRow(row)) {
      posOutputVat += vat
      posOutputNet += net
      posOutputCount += 1
    } else {
      otherOutputVat += vat
      otherOutputNet += net
      otherOutputCount += 1
    }
  }
  // 신고 예상액: 증빙 공제 가능한 매입 VAT만 차감 (대기·불가 제외)
  const claimableInputVat = claimable.claimableVat
  const payableVat = round2(outputVat - claimableInputVat)
  return {
    outputNet,
    outputVat,
    outputTotal,
    inputNet,
    inputVat,
    inputTotal,
    claimableInputVat,
    claimableInputNet: claimable.claimableNet,
    claimableInputCount: claimable.claimableCount,
    payableVat,
    dueVat: payableVat > 0 ? payableVat : 0,
    creditVat: payableVat < 0 ? Math.abs(payableVat) : 0,
    outputCount: outputRows.length,
    inputCount: inputRows.length,
    posOutputVat: round2(posOutputVat),
    posOutputNet: round2(posOutputNet),
    posOutputCount,
    otherOutputVat: round2(otherOutputVat),
    otherOutputNet: round2(otherOutputNet),
    otherOutputCount,
    summaryPayableVat: Number(summaryPayableVat || 0),
  }
}

export function formatBangkokDateTime(v: string): string {
  const s = String(v || "").trim()
  if (!s) return "-"
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

export function daysFromNow(v: string | null | undefined): number | null {
  const s = String(v || "").trim()
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const ms = Date.now() - d.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

export async function withClientTimeout<T>(promise: Promise<T>, timeoutMs = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("CLIENT_TIMEOUT")), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function asNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function buildSsoPayrollPreview(rows: Record<string, unknown>[]): SsoPayrollPreview {
  const stores = new Set<string>()
  let totalEmployeeSso = 0
  let totalEmployerSso = 0
  let missingCitizenIdCount = 0
  let missingSsoMemberNoCount = 0
  for (const row of rows) {
    const store = String(row.store || "").trim()
    if (store) stores.add(store)
    totalEmployeeSso += asNum(row.sso)
    totalEmployerSso += asNum(row.employerSso)
    if (!String(row.idNumber || "").trim()) missingCitizenIdCount += 1
    if (!String(row.ssoMemberNo || "").trim()) missingSsoMemberNoCount += 1
  }
  return {
    rowCount: rows.length,
    storeCount: stores.size,
    totalEmployeeSso,
    totalEmployerSso,
    totalContribution: totalEmployeeSso + totalEmployerSso,
    missingCitizenIdCount,
    missingSsoMemberNoCount,
  }
}

export function parseAttachmentUrlsFromInput(raw: string): string[] {
  const uniq = new Set<string>()
  for (const token of String(raw || "").split(/[\n,]/g)) {
    const v = token.trim()
    if (!v) continue
    uniq.add(v)
  }
  return Array.from(uniq)
}

export function displayNameFromUrl(url: string): string {
  const raw = String(url || "").trim()
  if (!raw) return "-"
  try {
    const u = new URL(raw)
    const seg = u.pathname.split("/").filter(Boolean)
    const last = seg[seg.length - 1] || raw
    return decodeURIComponent(last)
  } catch {
    const seg = raw.split("/").filter(Boolean)
    return seg[seg.length - 1] || raw
  }
}

export function parseSsoWorkflowNote(note: string | null | undefined): SsoSubmissionMeta | null {
  const s = String(note || "").trim()
  if (!s.startsWith(SSO_WORKFLOW_NOTE_PREFIX)) return null
  const payload = s.slice(SSO_WORKFLOW_NOTE_PREFIX.length).trim()
  if (!payload) return null
  try {
    const parsed = JSON.parse(payload) as {
      summaryLine?: unknown
      memo?: unknown
      attachmentUrls?: unknown
      submittedAt?: unknown
      submittedBy?: unknown
    }
    const summaryLine = String(parsed.summaryLine || "").trim() || undefined
    const memo = String(parsed.memo || "").trim()
    const attachmentUrls = Array.isArray(parsed.attachmentUrls)
      ? parsed.attachmentUrls.map((x) => String(x || "").trim()).filter(Boolean)
      : []
    const submittedAt = String(parsed.submittedAt || "").trim() || undefined
    const submittedBy = String(parsed.submittedBy || "").trim() || undefined
    return { summaryLine, memo, attachmentUrls, submittedAt, submittedBy }
  } catch {
    return null
  }
}

export function buildSsoWorkflowNote(meta: SsoSubmissionMeta & { summaryLine: string }): string {
  return `${SSO_WORKFLOW_NOTE_PREFIX}${JSON.stringify({
    summaryLine: meta.summaryLine,
    memo: meta.memo,
    attachmentUrls: meta.attachmentUrls,
    submittedAt: meta.submittedAt || "",
    submittedBy: meta.submittedBy || "",
  })}`
}

export function parseEtaxTimestampWorkflowNote(note: string | null | undefined): EtaxTimestampMeta | null {
  const s = String(note || "").trim()
  if (!s.startsWith(ETAX_TIMESTAMP_NOTE_PREFIX)) return null
  const payload = s.slice(ETAX_TIMESTAMP_NOTE_PREFIX.length).trim()
  if (!payload) return null
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>
    const bool = (k: string) => Boolean(parsed[k])
    const parsedStepAudit =
      parsed.stepAudit && typeof parsed.stepAudit === "object"
        ? (parsed.stepAudit as Record<string, unknown>)
        : {}
    const readStep = (k: EtaxStepKey): { doneAt: string; doneBy: string } | undefined => {
      const v = parsedStepAudit[k]
      if (!v || typeof v !== "object") return undefined
      const o = v as Record<string, unknown>
      const doneAt = String(o.doneAt || "").trim()
      const doneBy = String(o.doneBy || "").trim()
      if (!doneAt || !doneBy) return undefined
      return { doneAt, doneBy }
    }
    const stepAudit: Partial<Record<EtaxStepKey, { doneAt: string; doneBy: string }>> = {}
    ;(
      [
        "applySubmitted",
        "ko01Printed",
        "docsUploaded",
        "emailConfirmed",
        "activateCodeReceived",
        "passwordSet",
        "senderEmailRegistered",
        "pilotIssued",
      ] as EtaxStepKey[]
    ).forEach((k) => {
      const one = readStep(k)
      if (one) stepAudit[k] = one
    })
    return {
      taxId: String(parsed.taxId || "").trim(),
      branchCode: String(parsed.branchCode || "").trim(),
      rdContactEmail: String(parsed.rdContactEmail || "").trim(),
      senderGmail: String(parsed.senderGmail || "").trim(),
      activateCodeRef: String(parsed.activateCodeRef || "").trim(),
      memo: String(parsed.memo || "").trim(),
      attachmentUrls: Array.isArray(parsed.attachmentUrls)
        ? parsed.attachmentUrls.map((x) => String(x || "").trim()).filter(Boolean)
        : [],
      applySubmitted: bool("applySubmitted"),
      ko01Printed: bool("ko01Printed"),
      docsUploaded: bool("docsUploaded"),
      emailConfirmed: bool("emailConfirmed"),
      activateCodeReceived: bool("activateCodeReceived"),
      passwordSet: bool("passwordSet"),
      senderEmailRegistered: bool("senderEmailRegistered"),
      pilotIssued: bool("pilotIssued"),
      stepAudit,
      updatedAt: String(parsed.updatedAt || "").trim() || undefined,
      updatedBy: String(parsed.updatedBy || "").trim() || undefined,
    }
  } catch {
    return null
  }
}

export function buildEtaxTimestampWorkflowNote(meta: EtaxTimestampMeta): string {
  return `${ETAX_TIMESTAMP_NOTE_PREFIX}${JSON.stringify(meta)}`
}

export function pickPayrollApiMsg(data: { msg?: unknown; message?: unknown }): string {
  const raw = data.msg ?? data.message
  if (raw == null || raw === "") return ""
  return String(raw).trim()
}

export function csvCell(v: unknown): string {
  const s = String(v ?? "")
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** 세무 신고 필터 행에 ภ.ง.ด.3/53 RD Prep TXT 버튼을 둘지 */
export function shouldShowPnd353RdPrepTxtDownload(params: {
  pp30Mode: string
  showPnd1Area: boolean
  showPnd353Tools: boolean
  whtFocusMode?: string
  isPnd5354CompactList: boolean
  pnd5354SubView: "pnd53" | "pnd54"
}): boolean {
  if (params.pp30Mode !== "wht_only") return false
  if (params.showPnd1Area) return false
  if (!params.showPnd353Tools) return false
  if (params.whtFocusMode === "pnd3" || params.whtFocusMode === "pnd53") return true
  return params.isPnd5354CompactList && params.pnd5354SubView === "pnd53"
}

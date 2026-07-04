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

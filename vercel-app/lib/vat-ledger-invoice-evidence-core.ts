export type InvoiceEvidenceStatus = 'required_pending' | 'received' | 'not_required' | 'unobtainable'

const VALID_STATUSES = new Set<InvoiceEvidenceStatus>([
  'required_pending',
  'received',
  'not_required',
  'unobtainable',
])

/** memo 끝에 저장 — DB 컬럼 미배포 환경에서도 증빙·차단·UI 동작 */
const IE_MEMO_TAG_RE =
  /\[IE:(required_pending|received|not_required|unobtainable)(?::([a-z0-9_]+))?\]/gi

export function normalizeInvoiceEvidenceStatus(v: unknown): InvoiceEvidenceStatus {
  const raw = String(v || '').trim().toLowerCase()
  if (VALID_STATUSES.has(raw as InvoiceEvidenceStatus)) return raw as InvoiceEvidenceStatus
  return 'required_pending'
}

export function isMissingEvidenceColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('invoice_evidence_status') || msg.includes('invoice_evidence_reason_code')
}

export function parseEvidenceFromMemo(memo: string): {
  status: InvoiceEvidenceStatus
  reasonCode: string | null
} | null {
  const src = String(memo || '')
  const re = new RegExp(IE_MEMO_TAG_RE.source, 'i')
  const m = re.exec(src)
  if (!m?.[1]) return null
  const status = normalizeInvoiceEvidenceStatus(m[1])
  const reasonCode = m[2] ? String(m[2]).trim().slice(0, 64) : null
  return { status, reasonCode }
}

export function stripMemoEvidenceTag(memo: string): string {
  return String(memo || '')
    .replace(IE_MEMO_TAG_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function setMemoEvidenceTag(
  memo: string,
  status: InvoiceEvidenceStatus,
  reasonCode?: string | null
): string {
  const base = stripMemoEvidenceTag(memo)
  const reason = String(reasonCode || '').trim().slice(0, 64)
  const tag = reason ? `[IE:${status}:${reason}]` : `[IE:${status}]`
  if (!base) return tag
  return `${base} ${tag}`.trim().slice(0, 2000)
}

export function resolveEvidenceFromRow(row: Record<string, unknown>): {
  status: InvoiceEvidenceStatus
  reasonCode: string | null
} {
  const colRaw = String(row.invoice_evidence_status ?? '').trim().toLowerCase()
  const colReason =
    row.invoice_evidence_reason_code != null && String(row.invoice_evidence_reason_code).trim() !== ''
      ? String(row.invoice_evidence_reason_code).trim().slice(0, 64)
      : null
  const fromMemo = parseEvidenceFromMemo(String(row.memo || ''))

  if (fromMemo) {
    if (!VALID_STATUSES.has(colRaw as InvoiceEvidenceStatus)) return fromMemo
    if (colRaw === 'required_pending' && fromMemo.status !== 'required_pending') return fromMemo
  }
  if (VALID_STATUSES.has(colRaw as InvoiceEvidenceStatus)) {
    return {
      status: colRaw as InvoiceEvidenceStatus,
      reasonCode: colReason ?? fromMemo?.reasonCode ?? null,
    }
  }
  return { status: 'required_pending', reasonCode: null }
}

export function enrichVatLedgerEntryRow<T extends Record<string, unknown>>(row: T): T {
  const { status, reasonCode } = resolveEvidenceFromRow(row)
  return {
    ...row,
    invoice_evidence_status: status,
    invoice_evidence_reason_code: reasonCode,
  }
}

export function enrichVatLedgerEntries<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((r) => enrichVatLedgerEntryRow(r))
}

export function mergeEvidenceIntoVatLedgerRow<T extends Record<string, unknown>>(
  row: T,
  status: InvoiceEvidenceStatus,
  reasonCode: string | null,
  useColumns: boolean
): T {
  const memo = String((row as { memo?: unknown }).memo ?? '')
  if (useColumns) {
    return {
      ...row,
      invoice_evidence_status: status,
      invoice_evidence_reason_code: reasonCode,
      memo: stripMemoEvidenceTag(memo),
    }
  }
  const next: Record<string, unknown> = { ...row }
  delete next.invoice_evidence_status
  delete next.invoice_evidence_reason_code
  next.memo = setMemoEvidenceTag(memo, status, reasonCode)
  return next as T
}

export function stripEvidenceFields<T extends Record<string, unknown>>(row: T): T {
  const next: Record<string, unknown> = { ...row }
  delete next.invoice_evidence_status
  delete next.invoice_evidence_reason_code
  return next as T
}

export function isInvoiceEvidencePending(row: Record<string, unknown>): boolean {
  return resolveEvidenceFromRow(row).status === 'required_pending'
}

export function isInvoiceEvidenceReportable(row: Record<string, unknown>): boolean {
  const s = resolveEvidenceFromRow(row).status
  return s === 'received' || s === 'not_required'
}

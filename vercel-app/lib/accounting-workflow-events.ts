import { supabaseInsert } from '@/lib/supabase-server'

const SSO_WORKFLOW_NOTE_PREFIX = 'SSO_SUBMISSION::'
const ETAX_TIMESTAMP_NOTE_PREFIX = 'ETAX_TIMESTAMP::'

type WorkflowEventInput = {
  yearMonth: string
  periodType: 'monthly' | 'half_year' | 'annual'
  periodKey: string
  storeScope: string
  filingType: string
  status: string
  actor?: string | null
  sourceWorkflowStatusId?: number | null
  note?: string | null
  fallbackUsed?: boolean
}

function isMissingWorkflowEventsTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('accounting_workflow_events') || msg.includes('42p01')
}

function parseStructuredNote(prefix: string, note: string | null | undefined): Record<string, unknown> {
  const s = String(note || '').trim()
  if (!s.startsWith(prefix)) return {}
  const payload = s.slice(prefix.length).trim()
  if (!payload) return {}
  try {
    const parsed = JSON.parse(payload)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function buildEventPayload(input: WorkflowEventInput): Record<string, unknown> {
  if (input.filingType === 'etax_timestamp') {
    const meta = parseStructuredNote(ETAX_TIMESTAMP_NOTE_PREFIX, input.note)
    return {
      source: 'workflow_note_etax_timestamp',
      fallbackUsed: Boolean(input.fallbackUsed),
      status: input.status,
      yearMonth: input.yearMonth,
      periodType: input.periodType,
      periodKey: input.periodKey,
      storeScope: input.storeScope,
      taxId: String(meta.taxId || '').trim(),
      branchCode: String(meta.branchCode || '').trim(),
      rdContactEmail: String(meta.rdContactEmail || '').trim(),
      senderGmail: String(meta.senderGmail || '').trim(),
      activateCodeRef: String(meta.activateCodeRef || '').trim(),
      memo: String(meta.memo || '').trim(),
      attachmentUrls: Array.isArray(meta.attachmentUrls) ? meta.attachmentUrls : [],
      applySubmitted: Boolean(meta.applySubmitted),
      ko01Printed: Boolean(meta.ko01Printed),
      docsUploaded: Boolean(meta.docsUploaded),
      emailConfirmed: Boolean(meta.emailConfirmed),
      activateCodeReceived: Boolean(meta.activateCodeReceived),
      passwordSet: Boolean(meta.passwordSet),
      senderEmailRegistered: Boolean(meta.senderEmailRegistered),
      pilotIssued: Boolean(meta.pilotIssued),
      stepAudit: meta.stepAudit && typeof meta.stepAudit === 'object' ? meta.stepAudit : {},
      noteRaw: String(input.note || ''),
    }
  }

  if (input.filingType === 'sso') {
    const meta = parseStructuredNote(SSO_WORKFLOW_NOTE_PREFIX, input.note)
    return {
      source: 'workflow_note_sso_submission',
      fallbackUsed: Boolean(input.fallbackUsed),
      status: input.status,
      yearMonth: input.yearMonth,
      periodType: input.periodType,
      periodKey: input.periodKey,
      storeScope: input.storeScope,
      summaryLine: String(meta.summaryLine || '').trim(),
      memo: String(meta.memo || '').trim(),
      submittedAt: String(meta.submittedAt || '').trim(),
      submittedBy: String(meta.submittedBy || '').trim(),
      attachmentUrls: Array.isArray(meta.attachmentUrls) ? meta.attachmentUrls : [],
      noteRaw: String(input.note || ''),
    }
  }

  return {
    source: 'workflow_status_generic',
    fallbackUsed: Boolean(input.fallbackUsed),
    status: input.status,
    yearMonth: input.yearMonth,
    periodType: input.periodType,
    periodKey: input.periodKey,
    storeScope: input.storeScope,
    noteRaw: String(input.note || ''),
  }
}

export async function writeAccountingWorkflowEvent(input: WorkflowEventInput): Promise<void> {
  const payload = buildEventPayload(input)
  const eventType =
    input.filingType === 'etax_timestamp'
      ? 'etax_snapshot_saved'
      : input.filingType === 'sso'
        ? 'sso_snapshot_saved'
        : 'workflow_status_saved'

  const row = {
    year_month: input.yearMonth,
    period_type: input.periodType,
    period_key: input.periodKey,
    store_scope: input.storeScope,
    filing_type: input.filingType,
    status: input.status,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    actor: input.actor || null,
    source_workflow_status_id: input.sourceWorkflowStatusId || null,
    payload,
    created_at: new Date().toISOString(),
  }
  try {
    await supabaseInsert('accounting_workflow_events', row)
  } catch (e) {
    if (isMissingWorkflowEventsTableError(e)) return
    throw e
  }
}

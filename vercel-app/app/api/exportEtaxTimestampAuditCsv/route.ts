import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

const ETAX_TIMESTAMP_NOTE_PREFIX = 'ETAX_TIMESTAMP::'

type WorkflowRow = {
  id?: number
  year_month?: string | null
  filing_type?: string | null
  status?: string | null
  note?: string | null
  owner?: string | null
  updated_by?: string | null
  updated_at?: string | null
  store_scope?: string | null
}

type WorkflowEventRow = {
  year_month?: string | null
  store_scope?: string | null
  status?: string | null
  actor?: string | null
  occurred_at?: string | null
  payload?: unknown
}

function csvCell(v: unknown): string {
  const raw = v == null ? '' : String(v)
  return `"${raw.replace(/"/g, '""')}"`
}

function parseEtaxMeta(note: string | null | undefined): Record<string, unknown> {
  const s = String(note || '').trim()
  if (!s.startsWith(ETAX_TIMESTAMP_NOTE_PREFIX)) return {}
  const payload = s.slice(ETAX_TIMESTAMP_NOTE_PREFIX.length).trim()
  if (!payload) return {}
  try {
    const parsed = JSON.parse(payload)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {}
  return payload as Record<string, unknown>
}

function buildCsv(rows: WorkflowRow[]): string {
  const readStep = (meta: Record<string, unknown>, key: string): { doneAt: string; doneBy: string } => {
    const stepAudit = meta.stepAudit && typeof meta.stepAudit === 'object' ? (meta.stepAudit as Record<string, unknown>) : {}
    const one = stepAudit[key]
    if (!one || typeof one !== 'object') return { doneAt: '', doneBy: '' }
    const o = one as Record<string, unknown>
    return {
      doneAt: String(o.doneAt || '').trim(),
      doneBy: String(o.doneBy || '').trim(),
    }
  }
  const header = [
    'updated_at',
    'year_month',
    'store_scope',
    'status',
    'updated_by',
    'tax_id',
    'branch_code',
    'rd_contact_email',
    'sender_gmail',
    'activate_code_ref',
    'apply_submitted',
    'ko01_printed',
    'docs_uploaded',
    'email_confirmed',
    'activate_code_received',
    'password_set',
    'sender_email_registered',
    'pilot_issued',
    'apply_submitted_at',
    'apply_submitted_by',
    'ko01_printed_at',
    'ko01_printed_by',
    'docs_uploaded_at',
    'docs_uploaded_by',
    'email_confirmed_at',
    'email_confirmed_by',
    'activate_code_received_at',
    'activate_code_received_by',
    'password_set_at',
    'password_set_by',
    'sender_email_registered_at',
    'sender_email_registered_by',
    'pilot_issued_at',
    'pilot_issued_by',
    'attachment_count',
    'memo',
    'note_raw',
  ]
  const out = [header.join(',')]
  for (const row of rows) {
    const meta = parseEtaxMeta(row.note)
    const s1 = readStep(meta, 'applySubmitted')
    const s2 = readStep(meta, 'ko01Printed')
    const s3 = readStep(meta, 'docsUploaded')
    const s4 = readStep(meta, 'emailConfirmed')
    const s5 = readStep(meta, 'activateCodeReceived')
    const s6 = readStep(meta, 'passwordSet')
    const s7 = readStep(meta, 'senderEmailRegistered')
    const s8 = readStep(meta, 'pilotIssued')
    const attachments = Array.isArray(meta.attachmentUrls) ? meta.attachmentUrls : []
    out.push(
      [
        csvCell(row.updated_at || ''),
        csvCell(row.year_month || ''),
        csvCell(row.store_scope || ''),
        csvCell(row.status || ''),
        csvCell(row.updated_by || ''),
        csvCell(meta.taxId || ''),
        csvCell(meta.branchCode || ''),
        csvCell(meta.rdContactEmail || ''),
        csvCell(meta.senderGmail || ''),
        csvCell(meta.activateCodeRef || ''),
        csvCell(Boolean(meta.applySubmitted)),
        csvCell(Boolean(meta.ko01Printed)),
        csvCell(Boolean(meta.docsUploaded)),
        csvCell(Boolean(meta.emailConfirmed)),
        csvCell(Boolean(meta.activateCodeReceived)),
        csvCell(Boolean(meta.passwordSet)),
        csvCell(Boolean(meta.senderEmailRegistered)),
        csvCell(Boolean(meta.pilotIssued)),
        csvCell(s1.doneAt),
        csvCell(s1.doneBy),
        csvCell(s2.doneAt),
        csvCell(s2.doneBy),
        csvCell(s3.doneAt),
        csvCell(s3.doneBy),
        csvCell(s4.doneAt),
        csvCell(s4.doneBy),
        csvCell(s5.doneAt),
        csvCell(s5.doneBy),
        csvCell(s6.doneAt),
        csvCell(s6.doneBy),
        csvCell(s7.doneAt),
        csvCell(s7.doneBy),
        csvCell(s8.doneAt),
        csvCell(s8.doneBy),
        csvCell(attachments.length),
        csvCell(meta.memo || ''),
        csvCell(row.note || ''),
      ].join(',')
    )
  }
  return `\uFEFF${out.join('\n')}`
}

function buildCsvFromEvents(rows: WorkflowEventRow[]): string {
  const readStep = (meta: Record<string, unknown>, key: string): { doneAt: string; doneBy: string } => {
    const stepAudit = meta.stepAudit && typeof meta.stepAudit === 'object' ? (meta.stepAudit as Record<string, unknown>) : {}
    const one = stepAudit[key]
    if (!one || typeof one !== 'object') return { doneAt: '', doneBy: '' }
    const o = one as Record<string, unknown>
    return {
      doneAt: String(o.doneAt || '').trim(),
      doneBy: String(o.doneBy || '').trim(),
    }
  }

  const header = [
    'updated_at',
    'year_month',
    'store_scope',
    'status',
    'updated_by',
    'tax_id',
    'branch_code',
    'rd_contact_email',
    'sender_gmail',
    'activate_code_ref',
    'apply_submitted',
    'ko01_printed',
    'docs_uploaded',
    'email_confirmed',
    'activate_code_received',
    'password_set',
    'sender_email_registered',
    'pilot_issued',
    'apply_submitted_at',
    'apply_submitted_by',
    'ko01_printed_at',
    'ko01_printed_by',
    'docs_uploaded_at',
    'docs_uploaded_by',
    'email_confirmed_at',
    'email_confirmed_by',
    'activate_code_received_at',
    'activate_code_received_by',
    'password_set_at',
    'password_set_by',
    'sender_email_registered_at',
    'sender_email_registered_by',
    'pilot_issued_at',
    'pilot_issued_by',
    'attachment_count',
    'memo',
    'note_raw',
  ]
  const out = [header.join(',')]
  for (const row of rows) {
    const meta = payloadRecord(row.payload)
    const s1 = readStep(meta, 'applySubmitted')
    const s2 = readStep(meta, 'ko01Printed')
    const s3 = readStep(meta, 'docsUploaded')
    const s4 = readStep(meta, 'emailConfirmed')
    const s5 = readStep(meta, 'activateCodeReceived')
    const s6 = readStep(meta, 'passwordSet')
    const s7 = readStep(meta, 'senderEmailRegistered')
    const s8 = readStep(meta, 'pilotIssued')
    const attachments = Array.isArray(meta.attachmentUrls) ? meta.attachmentUrls : []
    out.push(
      [
        csvCell(row.occurred_at || ''),
        csvCell(row.year_month || ''),
        csvCell(row.store_scope || ''),
        csvCell(row.status || ''),
        csvCell(row.actor || ''),
        csvCell(meta.taxId || ''),
        csvCell(meta.branchCode || ''),
        csvCell(meta.rdContactEmail || ''),
        csvCell(meta.senderGmail || ''),
        csvCell(meta.activateCodeRef || ''),
        csvCell(Boolean(meta.applySubmitted)),
        csvCell(Boolean(meta.ko01Printed)),
        csvCell(Boolean(meta.docsUploaded)),
        csvCell(Boolean(meta.emailConfirmed)),
        csvCell(Boolean(meta.activateCodeReceived)),
        csvCell(Boolean(meta.passwordSet)),
        csvCell(Boolean(meta.senderEmailRegistered)),
        csvCell(Boolean(meta.pilotIssued)),
        csvCell(s1.doneAt),
        csvCell(s1.doneBy),
        csvCell(s2.doneAt),
        csvCell(s2.doneBy),
        csvCell(s3.doneAt),
        csvCell(s3.doneBy),
        csvCell(s4.doneAt),
        csvCell(s4.doneBy),
        csvCell(s5.doneAt),
        csvCell(s5.doneBy),
        csvCell(s6.doneAt),
        csvCell(s6.doneBy),
        csvCell(s7.doneAt),
        csvCell(s7.doneBy),
        csvCell(s8.doneAt),
        csvCell(s8.doneBy),
        csvCell(attachments.length),
        csvCell(meta.memo || ''),
        csvCell(meta.noteRaw || ''),
      ].join(',')
    )
  }
  return `\uFEFF${out.join('\n')}`
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const userRole = String(auth.role || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim().slice(0, 7)
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }

  try {
    const scope = storeFilter || 'All'
    try {
      const eventRows = (await supabaseSelectFilter(
        'accounting_workflow_events',
        [
          `year_month=eq.${encodeURIComponent(yearMonth)}`,
          `filing_type=eq.${encodeURIComponent('etax_timestamp')}`,
          `event_type=eq.${encodeURIComponent('etax_snapshot_saved')}`,
          `store_scope=eq.${encodeURIComponent(scope)}`,
        ].join('&'),
        {
          select: 'year_month,store_scope,status,actor,occurred_at,payload',
          order: 'occurred_at.asc,id.asc',
          limit: 5000,
        }
      )) as WorkflowEventRow[] | null
      if ((eventRows || []).length > 0) {
        const csv = buildCsvFromEvents(eventRows || [])
        return new NextResponse(csv, {
          status: 200,
          headers: {
            ...Object.fromEntries(headers.entries()),
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="etax-timestamp-audit-${yearMonth}.csv"`,
          },
        })
      }
    } catch (e) {
      // fallback below to legacy note JSON
      console.warn('exportEtaxTimestampAuditCsv events fallback:', e)
    }

    const rows = (await supabaseSelectFilter(
      'accounting_filing_workflow_status',
      `year_month=eq.${encodeURIComponent(yearMonth)}&filing_type=eq.${encodeURIComponent('etax_timestamp')}&store_scope=eq.${encodeURIComponent(scope)}`,
      {
        select: 'id,year_month,filing_type,status,note,owner,updated_by,updated_at,store_scope',
        order: 'updated_at.asc,id.asc',
        limit: 2000,
      }
    )) as WorkflowRow[] | null
    const csv = buildCsv(rows || [])
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="etax-timestamp-audit-${yearMonth}.csv"`,
      },
    })
  } catch (e) {
    console.error('exportEtaxTimestampAuditCsv:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

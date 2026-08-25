import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseUpdate,
} from '@/lib/supabase-server'

export type WhtLedgerDirection = 'outbound' | 'inbound'
export type WhtLedgerSourceType =
  | 'purchase_order'
  | 'expense_accrual'
  | 'payroll_record'
  | 'bank_transaction'
  | 'manual'

export type WhtLedgerAutoSaveRow = {
  payment_date: string
  tax_month: string
  payee_name: string | null
  payee_tax_id: string | null
  income_type: string | null
  gross_amount: number | null
  wht_rate: number | null
  wht_amount: number
  form_hint: string | null
  certificate_no: string | null
  memo: string
  filing_status: 'draft'
  submitted_at: null
  submitted_by: null
  store_name: string | null
  updated_at: string
  direction?: WhtLedgerDirection
  source_type?: WhtLedgerSourceType
  source_id?: number
}

let whtLedgerExtendedColumns: boolean | null = null

function isMissingSubmissionColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('filing_status') || msg.includes('submitted_at') || msg.includes('submitted_by')
}

function isMissingExtendedColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('direction') ||
    msg.includes('source_type') ||
    msg.includes('source_id')
  )
}

function stripSubmissionAuditFields<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.filing_status
  delete next.submitted_at
  delete next.submitted_by
  return next
}

function stripExtendedFields<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.direction
  delete next.source_type
  delete next.source_id
  return next
}

async function probeWhtLedgerExtendedColumns(): Promise<boolean> {
  if (whtLedgerExtendedColumns != null) return whtLedgerExtendedColumns
  try {
    await supabaseSelectFilter('withholding_tax_ledger_entries', 'id=eq.-1', {
      select: 'id,direction,source_type,source_id',
      limit: 1,
    })
    whtLedgerExtendedColumns = true
  } catch (e) {
    whtLedgerExtendedColumns = !isMissingExtendedColumnError(e)
  }
  return whtLedgerExtendedColumns
}

function rowForDb(row: WhtLedgerAutoSaveRow, extended: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = { ...row }
  if (!extended) {
    return stripExtendedFields(base)
  }
  return {
    ...base,
    direction: row.direction || 'outbound',
    source_type: row.source_type || null,
    source_id: row.source_id != null && row.source_id > 0 ? row.source_id : null,
  }
}

async function insertWhtRow(row: Record<string, unknown>): Promise<void> {
  const extended = await probeWhtLedgerExtendedColumns()
  const dbRow = rowForDb(row as WhtLedgerAutoSaveRow, extended)
  const insertRow = {
    ...dbRow,
    created_by: 'system',
    created_at: new Date().toISOString(),
  }
  try {
    await supabaseInsert('withholding_tax_ledger_entries', insertRow)
  } catch (e) {
    if (isMissingSubmissionColumnError(e)) {
      await supabaseInsert('withholding_tax_ledger_entries', stripSubmissionAuditFields(insertRow))
      return
    }
    if (isMissingExtendedColumnError(e)) {
      whtLedgerExtendedColumns = false
      await supabaseInsert(
        'withholding_tax_ledger_entries',
        stripSubmissionAuditFields(stripExtendedFields(insertRow))
      )
      return
    }
    throw e
  }
}

async function updateWhtRow(id: number, row: Record<string, unknown>): Promise<void> {
  const extended = await probeWhtLedgerExtendedColumns()
  const dbRow = rowForDb(row as WhtLedgerAutoSaveRow, extended)
  try {
    await supabaseUpdate('withholding_tax_ledger_entries', id, dbRow)
  } catch (e) {
    if (isMissingSubmissionColumnError(e)) {
      await supabaseUpdate('withholding_tax_ledger_entries', id, stripSubmissionAuditFields(dbRow))
      return
    }
    if (isMissingExtendedColumnError(e)) {
      whtLedgerExtendedColumns = false
      await supabaseUpdate(
        'withholding_tax_ledger_entries',
        id,
        stripSubmissionAuditFields(stripExtendedFields(dbRow))
      )
      return
    }
    throw e
  }
}

/** 세무 화면에서 금액·세율을 저장하면 붙는 표시. 자동동기화는 이 행의 금액을 덮지 않는다. */
export const WHT_MANUAL_AMOUNTS_TAG = '[MANUAL_AMOUNTS]'

export type WhtAutoExistingRef = {
  id: number
  filingStatus: string
  memo?: string | null
}

export function hasManualWhtAmountsTag(memo: unknown): boolean {
  return String(memo || '').includes(WHT_MANUAL_AMOUNTS_TAG)
}

export function withManualWhtAmountsTag(memo: unknown): string {
  const s = String(memo || '').trim()
  if (hasManualWhtAmountsTag(s)) return s.slice(0, 2000)
  return `${s ? `${s} ` : ''}${WHT_MANUAL_AMOUNTS_TAG}`.trim().slice(0, 2000)
}

/** 수동 저장 시 AUTO 연동 태그가 지워지지 않게 유지 (중복 원장 행 방지). */
export function preserveAutoWhtMemoTags(existingMemo: unknown, nextMemo: string): string {
  const tags = String(existingMemo || '').match(/\[AUTO:[^\]]+\]/g) || []
  let out = String(nextMemo || '').trim()
  for (const tag of tags) {
    if (!out.includes(tag)) out = `${tag} ${out}`.trim()
  }
  return out.slice(0, 2000)
}

export function shouldSkipWhtAutoOverwrite(existing: WhtAutoExistingRef | undefined): boolean {
  if (!existing?.id) return false
  if (String(existing.filingStatus || '').trim().toLowerCase() === 'submitted') return true
  return hasManualWhtAmountsTag(existing.memo)
}

export function parseWhtMemoSourceId(memo: string, tag: string): number {
  const m = memo.match(new RegExp(`\\[AUTO:${tag}:(\\d+)\\]`))
  if (!m) return 0
  return Math.floor(Number(m[1]) || 0)
}

export async function loadAutoWhtLedgerIndex(params: {
  months: string[]
  memoTagPrefix: string
  storeFilter?: string
  appendStoreFilter: (filter: string, store: string) => string
}): Promise<Map<number, WhtAutoExistingRef>> {
  const { buildTaxMonthPostgrestFilter } = await import('@/lib/thai-tax-period')
  const monthFilter = buildTaxMonthPostgrestFilter(params.months)
  const autoBase = `${monthFilter}&memo=ilike.${encodeURIComponent(`%[AUTO:${params.memoTagPrefix}:%`)}`
  const autoFilter = params.storeFilter
    ? params.appendStoreFilter(autoBase, params.storeFilter)
    : autoBase
  const extended = await probeWhtLedgerExtendedColumns()
  const existingAutoRows = (await supabaseSelectFilterAllPages(
    'withholding_tax_ledger_entries',
    autoFilter,
    {
      select: extended ? 'id,memo,filing_status,source_type,source_id' : 'id,memo,filing_status',
      order: 'id.asc',
      pageSize: 3000,
      maxRows: 30000,
    }
  )) as {
    id?: number
    memo?: string | null
    filing_status?: string | null
    source_type?: string | null
    source_id?: number | null
  }[]

  const map = new Map<number, WhtAutoExistingRef>()
  for (const row of existingAutoRows || []) {
    const id = Math.floor(Number(row.id) || 0)
    if (id <= 0) continue
    const sourceId = Math.floor(Number(row.source_id) || 0)
    const key =
      sourceId > 0
        ? sourceId
        : parseWhtMemoSourceId(String(row.memo || ''), params.memoTagPrefix)
    if (key <= 0) continue
    map.set(key, {
      id,
      filingStatus: String(row.filing_status || '').trim().toLowerCase(),
      memo: String(row.memo || ''),
    })
  }
  return map
}

/** 자동 원장 행 upsert. submitted·수동 금액 잠금 행은 건드리지 않음. */
export async function upsertAutoWithholdingTaxLedgerEntry(params: {
  sourceKey: number
  existingBySource: Map<number, WhtAutoExistingRef>
  saveRow: WhtLedgerAutoSaveRow
}): Promise<boolean> {
  const sourceKey = Math.floor(Number(params.sourceKey) || 0)
  if (sourceKey <= 0) return false
  const existing = params.existingBySource.get(sourceKey)
  if (shouldSkipWhtAutoOverwrite(existing)) return false

  if (existing?.id) {
    await updateWhtRow(existing.id, params.saveRow)
    return true
  }
  await insertWhtRow(params.saveRow)
  return true
}

export async function deleteAutoWithholdingTaxLedgerEntries(params: {
  existingBySource: Map<number, WhtAutoExistingRef>
  seenSourceKeys: Set<number>
}): Promise<number> {
  let deleted = 0
  for (const [key, ex] of params.existingBySource.entries()) {
    if (params.seenSourceKeys.has(key)) continue
    if (shouldSkipWhtAutoOverwrite(ex)) continue
    await supabaseDeleteByFilter('withholding_tax_ledger_entries', `id=eq.${ex.id}`)
    deleted += 1
  }
  return deleted
}

/** PO·통장 등 동일 건 이중 연동 시 bank 자동 행 제거 */
export async function deleteAutoWhtBySource(
  sourceType: WhtLedgerSourceType,
  sourceId: number
): Promise<void> {
  const id = Math.floor(Number(sourceId) || 0)
  if (id <= 0) return
  const extended = await probeWhtLedgerExtendedColumns()
  if (extended) {
    await supabaseDeleteByFilter(
      'withholding_tax_ledger_entries',
      `source_type=eq.${encodeURIComponent(sourceType)}&source_id=eq.${id}&filing_status=neq.submitted`
    )
    return
  }
}

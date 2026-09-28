import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

export const TAX_PERIOD_CLOSED = 'TAX_PERIOD_CLOSED'
export const TAX_BOOK_SCHEMA_MISSING = 'TAX_BOOK_SCHEMA_MISSING'

export function isMissingTaxBookSchemaError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  if (msg.includes(TAX_BOOK_SCHEMA_MISSING.toLowerCase())) return true
  if (msg.includes('42p01') && msg.includes('tax_accounting_periods')) return true
  if (!msg.includes('42703') && !msg.includes('pgrst204') && !msg.includes('schema cache')) return false
  return (
    msg.includes('book') ||
    msg.includes('voucher_kind') ||
    msg.includes('tax_entity_code') ||
    msg.includes('tax_accounting_periods')
  )
}

type PeriodRow = { is_closed?: boolean }

export async function readTaxAccountingPeriod(
  taxEntityCode: string,
  yearMonth: string
): Promise<{ schemaReady: boolean; isClosed: boolean }> {
  const entity = String(taxEntityCode || '').trim()
  const ym = String(yearMonth || '').slice(0, 7)
  if (!entity || !/^\d{4}-\d{2}$/.test(ym)) return { schemaReady: true, isClosed: false }
  try {
    const rows = (await supabaseSelectFilter(
      'tax_accounting_periods',
      `tax_entity_code=eq.${encodeURIComponent(entity)}&year_month=eq.${encodeURIComponent(ym)}`,
      { select: 'is_closed', limit: 1 }
    )) as PeriodRow[] | null
    return { schemaReady: true, isClosed: Boolean(rows?.[0]?.is_closed) }
  } catch (e) {
    if (isMissingTaxBookSchemaError(e)) return { schemaReady: false, isClosed: false }
    throw e
  }
}

export async function assertTaxAccountingPeriodOpen(taxEntityCode: string, yearMonth: string): Promise<void> {
  const entity = String(taxEntityCode || '').trim()
  const ym = String(yearMonth || '').slice(0, 7)
  if (!entity) throw new Error('NEED_TAX_ENTITY')
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('INVALID_YEAR_MONTH')
  const period = await readTaxAccountingPeriod(entity, ym)
  if (!period.schemaReady) throw new Error(TAX_BOOK_SCHEMA_MISSING)
  if (period.isClosed) throw new Error(TAX_PERIOD_CLOSED)
}

export async function setTaxAccountingPeriodClosed(input: {
  taxEntityCode: string
  yearMonth: string
  isClosed: boolean
  actor: string | null
  unlockReason?: string | null
}): Promise<void> {
  const entity = String(input.taxEntityCode || '').trim()
  const ym = String(input.yearMonth || '').slice(0, 7)
  if (!entity) throw new Error('NEED_TAX_ENTITY')
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('INVALID_YEAR_MONTH')
  const now = new Date().toISOString()
  try {
    await supabaseUpsert(
      'tax_accounting_periods',
      [
        {
          tax_entity_code: entity,
          year_month: ym,
          is_closed: input.isClosed,
          closed_at: input.isClosed ? now : null,
          closed_by: input.isClosed ? input.actor : null,
          unlocked_at: input.isClosed ? null : now,
          unlocked_by: input.isClosed ? null : input.actor,
          unlock_reason: input.isClosed ? null : input.unlockReason || null,
        },
      ],
      'tax_entity_code,year_month'
    )
  } catch (e) {
    if (isMissingTaxBookSchemaError(e)) throw new Error(TAX_BOOK_SCHEMA_MISSING)
    throw e
  }
}

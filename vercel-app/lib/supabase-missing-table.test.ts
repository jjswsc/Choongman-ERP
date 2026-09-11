import { describe, expect, it } from 'vitest'
import { isMissingPostgrestTableError } from './supabase-missing-table'

describe('isMissingPostgrestTableError', () => {
  it('detects PGRST205 schema cache miss for the named table', () => {
    expect(
      isMissingPostgrestTableError(
        'Supabase select failed: {"code":"PGRST205","hint":"Perhaps you meant the table \'public.vat_ledger_entries\'","message":"Could not find the table \'public.vat_pp36_ledger_entries\' in the schema cache"}',
        'vat_pp36_ledger_entries'
      )
    ).toBe(true)
  })

  it('does not match a different missing table', () => {
    expect(
      isMissingPostgrestTableError(
        'Supabase select failed: {"code":"PGRST205","message":"Could not find the table \'public.vat_pp36_ledger_entries\' in the schema cache"}',
        'withholding_tax_pnd54_entries'
      )
    ).toBe(false)
  })

  it('does not treat network timeout as missing table', () => {
    expect(isMissingPostgrestTableError(new Error('Supabase request timeout'))).toBe(false)
  })

  it('detects Omni item_categories PGRST205', () => {
    expect(
      isMissingPostgrestTableError(
        'Supabase select failed: {"code":"PGRST205","details":null,"hint":"Perhaps you meant the table \'public.item_vendors\'","message":"Could not find the table \'public.item_categories\' in the schema cache"}',
        'item_categories'
      )
    ).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { extractPgUndefinedColumn, filterOrOrderReferencesColumn } from './supabase-pgrst204-retry'

describe('extractPgUndefinedColumn', () => {
  it('reads join_date from PostgREST 42703 JSON wrapped in Error', () => {
    const err = new Error(
      'Supabase select failed: {"code":"42703","details":null,"hint":null,"message":"column employees.join_date does not exist"}'
    )
    expect(extractPgUndefinedColumn(err)).toBe('join_date')
  })

  it('reads phone from PostgREST 42703 with photo hint', () => {
    const err = new Error(
      'Supabase select failed: {"code":"42703","details":null,"hint":"Perhaps you meant to reference the column \\"employees.photo\\".","message":"column employees.phone does not exist"}'
    )
    expect(extractPgUndefinedColumn(err)).toBe('phone')
  })
})

describe('filterOrOrderReferencesColumn', () => {
  it('detects PostgREST filter and order keys', () => {
    expect(
      filterOrOrderReferencesColumn(
        'is_advance',
        'store_code=ilike.Silom&is_advance=eq.true&status=in.(pending,cooking)',
        'scheduled_at.asc'
      )
    ).toBe(true)
    expect(filterOrOrderReferencesColumn('scheduled_at', 'store_code=eq.Silom', 'scheduled_at.asc')).toBe(
      true
    )
    expect(filterOrOrderReferencesColumn('guest_phone', 'store_code=eq.Silom', 'created_at.desc')).toBe(
      false
    )
  })
})

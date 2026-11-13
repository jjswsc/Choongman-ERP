import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  extractPgUndefinedColumn,
  filterOrOrderReferencesColumn,
  getPgrst204OmittedColumnsForTests,
  resetPgrst204OmittedColumnsForTests,
  supabaseInsertWithPgrst204Fallback,
} from './supabase-pgrst204-retry'

vi.mock('@/lib/supabase-server', () => ({
  supabaseInsert: vi.fn(),
  supabaseSelect: vi.fn(),
  supabaseSelectFilter: vi.fn(),
  supabaseSelectFilterAllPages: vi.fn(),
  supabaseUpdateByFilter: vi.fn(),
  supabaseUpsertMerge: vi.fn(),
}))

import { supabaseInsert } from '@/lib/supabase-server'

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

describe('supabaseInsertWithPgrst204Fallback omitted cache', () => {
  beforeEach(() => {
    resetPgrst204OmittedColumnsForTests()
    vi.mocked(supabaseInsert).mockReset()
  })

  it('remembers missing columns so the next insert skips them on first try', async () => {
    vi.mocked(supabaseInsert)
      .mockRejectedValueOnce(
        new Error('column pos_orders.is_advance does not exist')
      )
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2 }])

    await supabaseInsertWithPgrst204Fallback(
      'pos_orders',
      { store_code: 'CM Silom', is_advance: true, total: 100 },
      'testInsert'
    )
    expect(getPgrst204OmittedColumnsForTests('pos_orders')).toEqual(['is_advance'])

    await supabaseInsertWithPgrst204Fallback(
      'pos_orders',
      { store_code: 'CM Silom', is_advance: true, total: 200 },
      'testInsert'
    )
    expect(vi.mocked(supabaseInsert).mock.calls[2]?.[1]).toEqual({
      store_code: 'CM Silom',
      total: 200,
    })
  })
})

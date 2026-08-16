import { describe, expect, it } from 'vitest'
import { extractPgUndefinedColumn } from './supabase-pgrst204-retry'

describe('extractPgUndefinedColumn', () => {
  it('reads join_date from PostgREST 42703 JSON wrapped in Error', () => {
    const err = new Error(
      'Supabase select failed: {"code":"42703","details":null,"hint":null,"message":"column employees.join_date does not exist"}'
    )
    expect(extractPgUndefinedColumn(err)).toBe('join_date')
  })
})

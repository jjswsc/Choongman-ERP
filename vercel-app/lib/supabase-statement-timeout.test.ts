import { describe, expect, it } from 'vitest'
import { isSupabaseStatementTimeoutError } from './supabase-statement-timeout'

describe('isSupabaseStatementTimeoutError', () => {
  it('detects PostgREST 57014 JSON wrapped in Error', () => {
    const err = new Error(
      'Supabase RPC failed: {"code":"57014","details":null,"hint":null,"message":"canceling statement due to statement timeout"}'
    )
    expect(isSupabaseStatementTimeoutError(err)).toBe(true)
  })

  it('detects raw JSON body', () => {
    expect(
      isSupabaseStatementTimeoutError(
        '{"code":"57014","message":"canceling statement due to statement timeout"}'
      )
    ).toBe(true)
  })

  it('does not treat generic network timeout as statement timeout', () => {
    expect(isSupabaseStatementTimeoutError(new Error('Supabase request timeout'))).toBe(false)
    expect(isSupabaseStatementTimeoutError(new Error('PGRST205 table missing'))).toBe(false)
  })
})

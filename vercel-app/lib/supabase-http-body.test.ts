import { gzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { decodeHttpResponseBody } from '@/lib/supabase-http-body'

describe('decodeHttpResponseBody', () => {
  it('passes through plain utf8', () => {
    const raw = Buffer.from('{"ok":true}', 'utf8')
    expect(decodeHttpResponseBody(raw, undefined)).toBe('{"ok":true}')
  })

  it('decodes gzip', () => {
    const json = '{"completed_count":3}'
    const raw = gzipSync(Buffer.from(json, 'utf8'))
    expect(decodeHttpResponseBody(raw, 'gzip')).toBe(json)
  })
})

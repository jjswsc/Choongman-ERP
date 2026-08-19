import { describe, expect, it } from 'vitest'
import {
  deriveQrTableJoinSecret,
  hashQrSessionSecret,
  parseQrSessionSecretHashes,
  serializeQrSessionSecretHashes,
  verifyQrSessionSecret,
} from '@/lib/qr-table-session-secret-hashes'

describe('qr table session secret hashes', () => {
  it('keeps a single legacy hex hash as-is', () => {
    const hash = hashQrSessionSecret('device-a')
    expect(parseQrSessionSecretHashes(hash)).toEqual([hash])
    expect(serializeQrSessionSecretHashes([hash])).toBe(hash)
    expect(verifyQrSessionSecret('device-a', hash)).toBe(true)
    expect(verifyQrSessionSecret('device-b', hash)).toBe(false)
  })

  it('accepts any hash in a JSON list so two phones can share a session', () => {
    const a = hashQrSessionSecret('phone-1')
    const b = hashQrSessionSecret('phone-2')
    const stored = serializeQrSessionSecretHashes([a, b])
    expect(stored.startsWith('[')).toBe(true)
    expect(verifyQrSessionSecret('phone-1', stored)).toBe(true)
    expect(verifyQrSessionSecret('phone-2', stored)).toBe(true)
    expect(verifyQrSessionSecret('phone-3', stored)).toBe(false)
  })

  it('derives the same join secret for the same table token + session', () => {
    const s1 = deriveQrTableJoinSecret(42, 'table-token-aaa')
    const s2 = deriveQrTableJoinSecret(42, 'table-token-aaa')
    const other = deriveQrTableJoinSecret(42, 'table-token-bbb')
    expect(s1).toBe(s2)
    expect(s1).not.toBe(other)
    expect(s1.length).toBeGreaterThan(20)
  })
})

import { describe, expect, it } from 'vitest'
import { authCanAccessPosStoreWrite } from '@/lib/pos-store-access-server'
import type { JwtPayload } from '@/lib/jwt-auth'

describe('authCanAccessPosStoreWrite', () => {
  it('allows office staff for any store', async () => {
    const auth = { role: 'officer', store: 'Office' } as JwtPayload
    await expect(authCanAccessPosStoreWrite(auth, 'CM Silom')).resolves.toBe(true)
  })

  it('denies authenticated user without store scope', async () => {
    const auth = { role: 'staff', store: '' } as JwtPayload
    await expect(authCanAccessPosStoreWrite(auth, 'CM Silom')).resolves.toBe(false)
  })

  it('allows manager on primary store (grade key match)', async () => {
    const auth = { role: 'manager', store: 'CM Silom' } as JwtPayload
    await expect(authCanAccessPosStoreWrite(auth, 'CM Silom')).resolves.toBe(true)
  })

  it('allows pos_staff on assigned store', async () => {
    const auth = { role: 'pos_staff', store: 'CM Silom' } as JwtPayload
    await expect(authCanAccessPosStoreWrite(auth, 'CM Silom')).resolves.toBe(true)
  })

  it('allows franchisee extra store from allowedStores', async () => {
    const auth = {
      role: 'franchisee',
      store: 'CM Rama9',
      allowedStores: ['CM Ladprao'],
    } as JwtPayload
    await expect(authCanAccessPosStoreWrite(auth, 'CM Ladprao')).resolves.toBe(true)
    await expect(authCanAccessPosStoreWrite(auth, 'CM Other')).resolves.toBe(false)
  })
})

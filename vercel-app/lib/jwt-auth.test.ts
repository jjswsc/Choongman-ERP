import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signToken, verifyToken } from './jwt-auth'

const TEST_SECRET = 'test-secret-for-jwt-at-least-32-characters'

describe('jwt-auth', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET
  })

  afterEach(() => {
    delete process.env.JWT_SECRET
  })

  describe('signToken & verifyToken', () => {
    it('토큰 발급 후 검증 시 페이로드 복원', async () => {
      const payload = { store: 'Store1', name: '홍길동', role: 'manager' }
      const token = await signToken(payload)
      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3) // JWT 형식

      const verified = await verifyToken(token)
      expect(verified).not.toBeNull()
      expect(verified?.store).toBe('Store1')
      expect(verified?.name).toBe('홍길동')
      expect(verified?.role).toBe('manager')
    })

    it('잘못된 토큰은 null 반환', async () => {
      expect(await verifyToken('invalid.token.here')).toBeNull()
      expect(await verifyToken('')).toBeNull()
    })

    it('변조된 토큰은 null 반환', async () => {
      const token = await signToken({ store: 'S', name: 'N', role: 'staff' })
      const parts = token.split('.')
      const tampered = parts[0] + '.' + parts[1] + '.wrongsignature'
      expect(await verifyToken(tampered)).toBeNull()
    })
  })
})

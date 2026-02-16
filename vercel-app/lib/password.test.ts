import { describe, it, expect } from 'vitest'
import { isHashed, hashPassword, verifyPassword } from './password'

describe('password', () => {
  describe('isHashed', () => {
    it('평문은 false', () => {
      expect(isHashed('')).toBe(false)
      expect(isHashed('hello')).toBe(false)
      expect(isHashed('12345')).toBe(false)
    })

    it('bcrypt 해시($2a$)는 true', () => {
      const hash = '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJ'
      expect(isHashed(hash)).toBe(true)
    })

    it('bcrypt 해시($2b$)는 true', () => {
      const hash = '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJ'
      expect(isHashed(hash)).toBe(true)
    })

    it('짧은 $2로 시작하는 문자열은 false', () => {
      expect(isHashed('$2a$short')).toBe(false)
    })
  })

  describe('hashPassword', () => {
    it('빈 문자열은 빈 문자열 반환', async () => {
      expect(await hashPassword('')).toBe('')
      expect(await hashPassword('   ')).toBe('')
    })

    it('평문을 해시하면 bcrypt 형식 반환', async () => {
      const result = await hashPassword('mypassword')
      expect(result).toBeTruthy()
      expect(isHashed(result)).toBe(true)
      expect(result.length).toBeGreaterThan(50)
    })

    it('같은 입력이라도 해시가 매번 다름 (salt)', async () => {
      const a = await hashPassword('same')
      const b = await hashPassword('same')
      expect(a).not.toBe(b)
    })
  })

  describe('verifyPassword', () => {
    it('빈 입력은 false', async () => {
      expect(await verifyPassword('', 'stored')).toBe(false)
      expect(await verifyPassword('input', '')).toBe(false)
    })

    it('평문-평문 비교 (레거시)', async () => {
      expect(await verifyPassword('hello', 'hello')).toBe(true)
      expect(await verifyPassword('hello', 'world')).toBe(false)
    })

    it('평문-해시 비교', async () => {
      const hashed = await hashPassword('secret123')
      expect(await verifyPassword('secret123', hashed)).toBe(true)
      expect(await verifyPassword('wrong', hashed)).toBe(false)
    })
  })
})

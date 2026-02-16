/**
 * 비밀번호 해시/검증
 * bcrypt 해시 형식: $2a$10$... (60자) → 해시된 비밀번호로 인식
 */
import { hash, compare } from 'bcryptjs'

const SALT_ROUNDS = 10

const BCRYPT_PREFIX = '$2'

/** 평문 비밀번호인지 확인 (해시는 $2로 시작) */
export function isHashed(password: string): boolean {
  const s = String(password || '').trim()
  return s.length >= 50 && (s.startsWith('$2a$') || s.startsWith('$2b$'))
}

/** 비밀번호 해시 (저장 시 사용) */
export async function hashPassword(plain: string): Promise<string> {
  const s = String(plain || '').trim()
  if (!s) return ''
  return hash(s, SALT_ROUNDS)
}

/**
 * 비밀번호 검증
 * - 해시된 DB 값과 평문 입력 비교
 * - DB가 평문(레거시)인 경우 fallback 비교
 */
export async function verifyPassword(plainInput: string, storedValue: string): Promise<boolean> {
  const input = String(plainInput || '').trim()
  const stored = String(storedValue || '').trim()
  if (!input || !stored) return false

  if (isHashed(stored)) {
    return compare(input, stored)
  }
  return input === stored
}

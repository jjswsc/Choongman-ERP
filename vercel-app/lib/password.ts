/**
 * 비밀번호 해시/검증
 * bcrypt 해시 형식: $2a$10$... (60자) → 해시된 비밀번호로 인식
 */
import { hash, compare } from 'bcryptjs'

const SALT_ROUNDS = 10

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

export type VerifyPasswordOptions = {
  /**
   * DB에 평문이 남아 있을 때 문자열 비교 허용 (충만 레거시).
   * Omni(SaaS) 로그인에서는 false — 평문 저장 계정은 로그인 거부.
   */
  allowLegacyPlaintext?: boolean
}

/**
 * 비밀번호 검증
 * - 해시된 DB 값과 평문 입력 비교
 * - DB가 평문(레거시)인 경우: 기본 허용(충만 호환). Omni 로그인은 allowLegacyPlaintext:false 로 거부.
 */
export async function verifyPassword(
  plainInput: string,
  storedValue: string,
  opts?: VerifyPasswordOptions
): Promise<boolean> {
  const input = String(plainInput || '').trim()
  const stored = String(storedValue || '').trim()
  if (!input || !stored) return false

  if (isHashed(stored)) {
    return compare(input, stored)
  }
  /** 명시적 false(Omni)만 평문 거부. 미지정·true는 충만 레거시 유지. */
  if (opts?.allowLegacyPlaintext === false) {
    return false
  }
  return input === stored
}

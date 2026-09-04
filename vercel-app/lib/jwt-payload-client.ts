/** 클라이언트 전용 — JWT 서명 검증 없이 payload claim 읽기 (UI 권한·세션 보강) */
export function readJwtPayloadClaimsUnsafe(token: string): Record<string, unknown> | null {
  try {
    const raw = String(token || '').trim()
    const parts = raw.split('.')
    if (parts.length < 2) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad) b64 += '='.repeat(4 - pad)
    const json = atob(b64)
    const parsed = JSON.parse(json) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function readJwtCanManageOfficePayroll(token: string | null | undefined): boolean {
  if (!token) return false
  const claims = readJwtPayloadClaimsUnsafe(token)
  return claims?.canManageOfficePayroll === true
}

/** JWT exp까지 남은 초. 없거나 파싱 실패면 null. */
export function readJwtRemainingSec(token: string | null | undefined): number | null {
  if (!token) return null
  const claims = readJwtPayloadClaimsUnsafe(token)
  const exp = Number(claims?.exp)
  if (!Number.isFinite(exp) || exp <= 0) return null
  return exp - Date.now() / 1000
}

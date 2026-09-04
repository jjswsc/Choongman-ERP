import { AUTH_TOKEN_REFRESH_WITHIN_SEC } from '@/lib/auth-token-ttl'
import { readJwtRemainingSec } from '@/lib/jwt-payload-client'

export function shouldRefreshAuthToken(token: string | null | undefined): boolean {
  const remain = readJwtRemainingSec(token)
  if (remain == null) return false
  if (remain <= 0) return false
  return remain < AUTH_TOKEN_REFRESH_WITHIN_SEC
}

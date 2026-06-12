export type GrabApiEnv = 'staging' | 'production'

export type GrabOAuthCredentials = {
  cacheKey: string
  clientId: string
  clientSecret: string
  apiEnv: GrabApiEnv
  partnerApiBaseUrl?: string
  authBaseUrl?: string
  requestTimeoutMs?: number
  inboundOauthClientId?: string
  inboundOauthClientSecret?: string
}

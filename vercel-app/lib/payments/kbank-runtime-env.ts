/** KBank API 호출에 쓰는 런타임 자격 — env 또는 tenant DB에서 resolve */
export type KbankRuntimeEnv = {
  /** 토큰 캐시 키 */
  cacheKey: string
  consumerId: string
  consumerSecret: string
  partnerId: string
  partnerSecret: string
  merchantId: string
  openapiBaseUrl: string
  oauthBaseUrl?: string
  proxySecret?: string
  tokenScope?: string
  tokenPath?: string
  qrGeneratePath?: string
  inquiryPath?: string
  cancelPath?: string
  voidPath?: string
  settlementPath?: string
  terminalId?: string
  /** Partner Shop ID (매장별, 선택) */
  partnerShopId?: string
  qrTypeThai?: string
}

export function kbankRuntimeField(runtime: KbankRuntimeEnv | undefined, envName: string): string {
  if (!runtime) return String(process.env[envName] || '').trim()
  const map: Record<string, keyof KbankRuntimeEnv> = {
    KBANK_CONSUMER_ID: 'consumerId',
    KBANK_CONSUMER_SECRET: 'consumerSecret',
    KBANK_PARTNER_ID: 'partnerId',
    KBANK_PARTNER_SECRET: 'partnerSecret',
    KBANK_MERCHANT_ID: 'merchantId',
    KBANK_OPENAPI_BASE_URL: 'openapiBaseUrl',
    KBANK_OAUTH_BASE_URL: 'oauthBaseUrl',
    KBANK_PROXY_SECRET: 'proxySecret',
    KBANK_TOKEN_SCOPE: 'tokenScope',
    KBANK_TOKEN_PATH: 'tokenPath',
    KBANK_QR_GENERATE_PATH: 'qrGeneratePath',
    KBANK_INQUIRY_PATH: 'inquiryPath',
    KBANK_QR_STATUS_PATH: 'inquiryPath',
    KBANK_CANCEL_PATH: 'cancelPath',
    KBANK_QR_CANCEL_PATH: 'cancelPath',
    KBANK_VOID_PATH: 'voidPath',
    KBANK_QR_VOID_PATH: 'voidPath',
    KBANK_SETTLEMENT_PATH: 'settlementPath',
    KBANK_QR_SETTLEMENT_PATH: 'settlementPath',
    KBANK_TERMINAL_ID: 'terminalId',
    KBANK_PARTNER_SHOP_ID: 'partnerShopId',
    KBANK_QR_TYPE_THAI: 'qrTypeThai',
  }
  const key = map[envName]
  if (key && runtime[key] != null) {
    const v = String(runtime[key]).trim()
    if (v) return v
  }
  return String(process.env[envName] || '').trim()
}

export function mustKbankRuntimeField(
  runtime: KbankRuntimeEnv | undefined,
  envName: string
): string {
  const v = kbankRuntimeField(runtime, envName)
  if (!v) throw new Error(`${envName} environment variable is required.`)
  return v
}

export type IntegrationProvider = 'kbank' | 'grab'

/** tenant_integrations.config_json — KBank OAuth·파트너 자격 */
export type TenantKbankConfig = {
  consumerId?: string
  consumerSecret?: string
  partnerId?: string
  partnerSecret?: string
  merchantId?: string
  openapiBaseUrl?: string
  oauthBaseUrl?: string
  proxySecret?: string
  tokenScope?: string
  tokenPath?: string
  qrGeneratePath?: string
  inquiryPath?: string
  cancelPath?: string
  voidPath?: string
  settlementPath?: string
}

/** tenant_store_integrations.config_json — 매장별 KBank */
export type StoreKbankConfig = {
  /** 매장별 Merchant ID (예: KB000002340300) — 테넌트 MID를 덮어씀 */
  merchantId?: string
  /** 은행 Partner Shop ID (예: SJGLB00007) — 참고·향후 API용 */
  partnerShopId?: string
  terminalId?: string
  qrEnabled?: boolean
}

/** tenant_integrations.config_json — Grab OAuth */
export type TenantGrabConfig = {
  clientId?: string
  clientSecret?: string
  apiEnv?: 'staging' | 'production'
  partnerApiBaseUrl?: string
  authBaseUrl?: string
  requestTimeoutMs?: number
  inboundOauthClientId?: string
  inboundOauthClientSecret?: string
}

/** tenant_store_integrations.config_json — Grab 매장 매핑 */
export type StoreGrabConfig = {
  /** Grab 대시보드 merchant ID (3-C…) */
  grabMerchantId?: string
  /** 파트너 숫자 스토어 ID (예: 1048) */
  partnerMerchantId?: string
  /** menu notification API용 GFSBPOS-… ID */
  menuMerchantId?: string
  /** ERP store_code (비우면 tenant_store_integrations.store_code 사용) */
  erpStoreCode?: string
}

export type TenantIntegrationRow = {
  id: number
  tenantId: string
  provider: IntegrationProvider
  isEnabled: boolean
  config: TenantKbankConfig | TenantGrabConfig
  notes: string
  updatedAt: string
}

export type TenantStoreIntegrationRow = {
  id: number
  tenantId: string
  storeCode: string
  provider: IntegrationProvider
  isEnabled: boolean
  config: StoreKbankConfig | StoreGrabConfig
  notes: string
  updatedAt: string
}

export type IntegrationScope = {
  tenantId?: string
  storeCode?: string
}

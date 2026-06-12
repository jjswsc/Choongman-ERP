import {
  listTenantStoreIntegrations,
  loadTenantIntegration,
  loadTenantStoreIntegration,
} from '@/lib/tenant-integration-store'
import type {
  IntegrationScope,
  StoreGrabConfig,
  StoreKbankConfig,
  TenantGrabConfig,
  TenantKbankConfig,
} from '@/lib/tenant-integration-types'
import type { KbankRuntimeEnv } from '@/lib/payments/kbank-runtime-env'
import type { GrabOAuthCredentials } from '@/lib/grab-oauth-credentials'
import {
  buildGrabPortalMerchantMapDefaults,
  buildGrabStoreMapJsonDefaults,
} from '@/lib/grab-portal-merchant-map-defaults'
import {
  parseGrabPartnerApiMenuMerchantMap,
  parseGrabStoreMap,
} from '@/lib/grab-store-map-env'

function pickStr(...values: unknown[]): string {
  for (const v of values) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}

function readEnv(name: string): string {
  return String(process.env[name] || '').trim()
}

/** process.env → KbankRuntimeEnv (충만 단일 운영 폴백) */
export function kbankRuntimeFromProcessEnv(): KbankRuntimeEnv {
  return {
    cacheKey: 'env-default',
    consumerId: readEnv('KBANK_CONSUMER_ID'),
    consumerSecret: readEnv('KBANK_CONSUMER_SECRET'),
    partnerId: readEnv('KBANK_PARTNER_ID'),
    partnerSecret: readEnv('KBANK_PARTNER_SECRET'),
    merchantId: readEnv('KBANK_MERCHANT_ID'),
    openapiBaseUrl: readEnv('KBANK_OPENAPI_BASE_URL'),
    oauthBaseUrl: readEnv('KBANK_OAUTH_BASE_URL'),
    proxySecret: readEnv('KBANK_PROXY_SECRET'),
    tokenScope: readEnv('KBANK_TOKEN_SCOPE'),
    tokenPath: readEnv('KBANK_TOKEN_PATH'),
    qrGeneratePath: readEnv('KBANK_QR_GENERATE_PATH'),
    inquiryPath: readEnv('KBANK_INQUIRY_PATH') || readEnv('KBANK_QR_STATUS_PATH'),
    cancelPath: readEnv('KBANK_CANCEL_PATH') || readEnv('KBANK_QR_CANCEL_PATH'),
    voidPath: readEnv('KBANK_VOID_PATH') || readEnv('KBANK_QR_VOID_PATH'),
    settlementPath: readEnv('KBANK_SETTLEMENT_PATH') || readEnv('KBANK_QR_SETTLEMENT_PATH'),
    terminalId: readEnv('KBANK_TERMINAL_ID'),
    qrTypeThai: readEnv('KBANK_QR_TYPE_THAI'),
  }
}

export function mergeKbankTenantConfig(base: KbankRuntimeEnv, cfg: TenantKbankConfig, cacheKey: string): KbankRuntimeEnv {
  return {
    cacheKey,
    consumerId: pickStr(cfg.consumerId, base.consumerId),
    consumerSecret: pickStr(cfg.consumerSecret, base.consumerSecret),
    partnerId: pickStr(cfg.partnerId, base.partnerId),
    partnerSecret: pickStr(cfg.partnerSecret, base.partnerSecret),
    merchantId: pickStr(cfg.merchantId, base.merchantId),
    openapiBaseUrl: pickStr(cfg.openapiBaseUrl, base.openapiBaseUrl),
    oauthBaseUrl: pickStr(cfg.oauthBaseUrl, base.oauthBaseUrl),
    proxySecret: pickStr(cfg.proxySecret, base.proxySecret),
    tokenScope: pickStr(cfg.tokenScope, base.tokenScope),
    tokenPath: pickStr(cfg.tokenPath, base.tokenPath),
    qrGeneratePath: pickStr(cfg.qrGeneratePath, base.qrGeneratePath),
    inquiryPath: pickStr(cfg.inquiryPath, base.inquiryPath),
    cancelPath: pickStr(cfg.cancelPath, base.cancelPath),
    voidPath: pickStr(cfg.voidPath, base.voidPath),
    settlementPath: pickStr(cfg.settlementPath, base.settlementPath),
    terminalId: base.terminalId,
    qrTypeThai: base.qrTypeThai,
  }
}

function applyStoreKbankConfig(base: KbankRuntimeEnv, cfg: StoreKbankConfig): KbankRuntimeEnv {
  return {
    ...base,
    terminalId: pickStr(cfg.terminalId, base.terminalId),
  }
}

export async function resolveKbankRuntime(scope?: IntegrationScope): Promise<KbankRuntimeEnv> {
  const tenantId = String(scope?.tenantId || '').trim()
  const storeCode = String(scope?.storeCode || '').trim()
  let runtime = kbankRuntimeFromProcessEnv()

  if (tenantId) {
    const tenantRow = await loadTenantIntegration(tenantId, 'kbank')
    if (tenantRow) {
      runtime = mergeKbankTenantConfig(
        runtime,
        tenantRow.config as TenantKbankConfig,
        `tenant:${tenantId}`
      )
    }
  }

  if (tenantId && storeCode) {
    const storeRow = await loadTenantStoreIntegration(tenantId, storeCode, 'kbank')
    if (storeRow) {
      runtime = applyStoreKbankConfig(runtime, storeRow.config as StoreKbankConfig)
      runtime = { ...runtime, cacheKey: `${runtime.cacheKey}|store:${storeCode}` }
    }
  }

  return runtime
}

export function grabOAuthFromProcessEnv(): GrabOAuthCredentials {
  const apiEnvRaw = readEnv('GRAB_API_ENV').toLowerCase()
  const apiEnv =
    apiEnvRaw === 'prod' || apiEnvRaw === 'production' ? ('production' as const) : ('staging' as const)
  return {
    cacheKey: 'env-default',
    clientId: readEnv('GRAB_CLIENT_ID'),
    clientSecret: readEnv('GRAB_CLIENT_SECRET'),
    apiEnv,
    partnerApiBaseUrl: readEnv('GRAB_PARTNER_API_BASE_URL'),
    authBaseUrl: readEnv('GRAB_AUTH_BASE_URL'),
    requestTimeoutMs: Number(readEnv('GRAB_API_REQUEST_TIMEOUT_MS') || '') || undefined,
  }
}

function mergeGrabTenantConfig(
  base: GrabOAuthCredentials,
  cfg: TenantGrabConfig,
  cacheKey: string
): GrabOAuthCredentials {
  const apiEnvRaw = pickStr(cfg.apiEnv, base.apiEnv)
  const apiEnv = apiEnvRaw === 'production' ? 'production' : 'staging'
  return {
    cacheKey,
    clientId: pickStr(cfg.clientId, base.clientId),
    clientSecret: pickStr(cfg.clientSecret, base.clientSecret),
    apiEnv,
    partnerApiBaseUrl: pickStr(cfg.partnerApiBaseUrl, base.partnerApiBaseUrl),
    authBaseUrl: pickStr(cfg.authBaseUrl, base.authBaseUrl),
    requestTimeoutMs: cfg.requestTimeoutMs ?? base.requestTimeoutMs,
    inboundOauthClientId: pickStr(cfg.inboundOauthClientId, readEnv('GRAB_INBOUND_OAUTH_CLIENT_ID')),
    inboundOauthClientSecret: pickStr(cfg.inboundOauthClientSecret, readEnv('GRAB_INBOUND_OAUTH_CLIENT_SECRET')),
  }
}

export async function resolveGrabOAuthCredentials(scope?: IntegrationScope): Promise<GrabOAuthCredentials> {
  const tenantId = String(scope?.tenantId || '').trim()
  const creds = grabOAuthFromProcessEnv()
  if (!tenantId) return creds
  const tenantRow = await loadTenantIntegration(tenantId, 'grab')
  if (!tenantRow) return creds
  return mergeGrabTenantConfig(creds, tenantRow.config as TenantGrabConfig, `tenant:${tenantId}`)
}

/** env + DB tenant_store_integrations → Grab store map (동기 parseGrabStoreMap 대체·확장) */
export async function resolveGrabStoreMap(scope?: IntegrationScope): Promise<Record<string, string>> {
  const tenantId = String(scope?.tenantId || '').trim()
  const out = { ...parseGrabStoreMap() }

  if (!tenantId) return out

  const storeRows = await listTenantStoreIntegrations(tenantId, 'grab')
  for (const row of storeRows) {
    if (!row.isEnabled) continue
    const cfg = row.config as StoreGrabConfig
    const erpCode = pickStr(cfg.erpStoreCode, row.storeCode)
    const grabId = pickStr(cfg.grabMerchantId)
    const partnerId = pickStr(cfg.partnerMerchantId)
    const menuId = pickStr(cfg.menuMerchantId)

    if (grabId && partnerId) out[grabId] = partnerId
    if (partnerId && erpCode) out[partnerId] = erpCode
    if (menuId && partnerId) out[menuId] = partnerId
    if (menuId && erpCode && !partnerId) out[menuId] = erpCode
  }

  return out
}

export function buildGrabStoreMapFromRows(
  rows: Array<{ storeCode: string; config: StoreGrabConfig; isEnabled?: boolean }>
): Record<string, string> {
  const out: Record<string, string> = {
    ...buildGrabStoreMapJsonDefaults(),
    ...buildGrabPortalMerchantMapDefaults(),
  }
  for (const row of rows) {
    if (row.isEnabled === false) continue
    const cfg = row.config
    const erpCode = pickStr(cfg.erpStoreCode, row.storeCode)
    const grabId = pickStr(cfg.grabMerchantId)
    const partnerId = pickStr(cfg.partnerMerchantId)
    const menuId = pickStr(cfg.menuMerchantId)
    if (grabId && partnerId) out[grabId] = partnerId
    if (partnerId && erpCode) out[partnerId] = erpCode
    if (menuId && partnerId) out[menuId] = partnerId
  }
  return out
}

export async function resolveTenantIdByGrabLookup(seed: string): Promise<string | null> {
  const key = String(seed || '').trim()
  if (!key) return null
  try {
    const { supabaseSelectFilter } = await import('@/lib/supabase-server')
    const rows = (await supabaseSelectFilter('tenant_store_integrations', `provider=eq.grab&is_enabled=eq.true`, {
      limit: 500,
      select: 'tenant_id,store_code,config_json',
    })) as { tenant_id?: string; store_code?: string; config_json?: unknown }[] | null
    for (const row of rows || []) {
      const cfg = (row.config_json && typeof row.config_json === 'object'
        ? row.config_json
        : {}) as StoreGrabConfig
      const erp = pickStr(cfg.erpStoreCode, row.store_code)
      const hits = [
        pickStr(cfg.grabMerchantId),
        pickStr(cfg.partnerMerchantId),
        pickStr(cfg.menuMerchantId),
        erp,
      ]
      if (hits.some((h) => h && h === key)) {
        return String(row.tenant_id || '').trim() || null
      }
    }
  } catch {
    return null
  }
  return null
}

export { parseGrabPartnerApiMenuMerchantMap }

/** erp_stores.store_code → tenant_id (SaaS 매장) */
export async function resolveTenantIdForStoreCode(storeCode: string): Promise<string | undefined> {
  const code = String(storeCode || '').trim()
  if (!code) return undefined
  try {
    const { supabaseSelectFilter } = await import('@/lib/supabase-server')
    const rows = (await supabaseSelectFilter('erp_stores', `store_code=eq.${encodeURIComponent(code)}`, {
      limit: 1,
      select: 'tenant_id',
    })) as { tenant_id?: string | null }[] | null
    const tenantId = String(rows?.[0]?.tenant_id || '').trim()
    return tenantId || undefined
  } catch {
    return undefined
  }
}

/** erp_stores.store_code → tenant DB KBank/Grab 자격 resolve */
export async function resolveKbankRuntimeForStoreCode(storeCode: string): Promise<KbankRuntimeEnv> {
  const code = String(storeCode || '').trim()
  const tenantId = await resolveTenantIdForStoreCode(code)
  return resolveKbankRuntime({ tenantId, storeCode: code || undefined })
}

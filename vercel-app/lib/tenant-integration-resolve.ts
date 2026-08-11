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
import { isSaasBrand } from '@/lib/app-brand'
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'
import type { GrabOAuthCredentials } from '@/lib/grab-oauth-credentials'
import {
  buildGrabPortalMerchantMapDefaults,
  buildGrabStoreMapJsonDefaults,
} from '@/lib/grab-portal-merchant-map-defaults'
import {
  parseGrabPartnerApiMenuMerchantMap,
  parseGrabStoreMap,
} from '@/lib/grab-store-map-env'
import { lookupChoongmanKbankStoreDefaults } from '@/lib/kbank-store-merchant-defaults'

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
    partnerShopId: readEnv('KBANK_PARTNER_SHOP_ID'),
    qrTypeThai: readEnv('KBANK_QR_TYPE_THAI'),
  }
}

/** Omni 테넌트용 — 플랫폼 env 비밀을 고객사에 섞지 않음 */
export function emptyKbankRuntime(cacheKey = 'tenant-empty'): KbankRuntimeEnv {
  return {
    cacheKey,
    consumerId: '',
    consumerSecret: '',
    partnerId: '',
    partnerSecret: '',
    merchantId: '',
    openapiBaseUrl: '',
    oauthBaseUrl: '',
    proxySecret: '',
    tokenScope: '',
    tokenPath: '',
    qrGeneratePath: '',
    inquiryPath: '',
    cancelPath: '',
    voidPath: '',
    settlementPath: '',
    terminalId: '',
    partnerShopId: '',
    qrTypeThai: '',
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
    partnerShopId: base.partnerShopId,
    qrTypeThai: base.qrTypeThai,
  }
}

export function applyStoreKbankConfig(base: KbankRuntimeEnv, cfg: StoreKbankConfig): KbankRuntimeEnv {
  return {
    ...base,
    merchantId: pickStr(cfg.merchantId, base.merchantId),
    partnerShopId: pickStr(cfg.partnerShopId, base.partnerShopId),
    terminalId: pickStr(cfg.terminalId, base.terminalId),
  }
}

export async function resolveKbankRuntime(scope?: IntegrationScope): Promise<KbankRuntimeEnv> {
  const tenantId = String(scope?.tenantId || '').trim()
  const storeCode = String(scope?.storeCode || '').trim()
  const isolate = tenantId ? await shouldIsolateTenantIntegrationsFromEnv() : false
  let runtime = isolate ? emptyKbankRuntime(`tenant:${tenantId}`) : kbankRuntimeFromProcessEnv()

  if (tenantId) {
    const tenantRow = await loadTenantIntegration(tenantId, 'kbank')
    if (tenantRow) {
      runtime = mergeKbankTenantConfig(
        runtime,
        tenantRow.config as TenantKbankConfig,
        `tenant:${tenantId}`
      )
    } else if (isolate) {
      /** Omni: DB 자격 없으면 env 폴백 금지 */
      return emptyKbankRuntime(`tenant:${tenantId}:missing`)
    }
  }

  // 충만 매장별 MID 기본값 (Huamak / Seacon). 아래 DB store 설정이 있으면 그 값이 우선.
  if (storeCode) {
    const defaults = lookupChoongmanKbankStoreDefaults(storeCode)
    if (defaults) {
      runtime = applyStoreKbankConfig(runtime, {
        merchantId: defaults.merchantId,
        partnerShopId: defaults.partnerShopId,
        terminalId: defaults.terminalId,
      })
      if (!runtime.cacheKey.includes('|store:')) {
        runtime = { ...runtime, cacheKey: `${runtime.cacheKey}|store:${storeCode}` }
      }
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
    inboundOauthClientId: readEnv('GRAB_INBOUND_OAUTH_CLIENT_ID'),
    inboundOauthClientSecret: readEnv('GRAB_INBOUND_OAUTH_CLIENT_SECRET'),
  }
}

export function emptyGrabOAuthCredentials(cacheKey = 'tenant-empty'): GrabOAuthCredentials {
  return {
    cacheKey,
    clientId: '',
    clientSecret: '',
    apiEnv: 'staging',
    partnerApiBaseUrl: '',
    authBaseUrl: '',
    requestTimeoutMs: undefined,
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
    inboundOauthClientId: pickStr(cfg.inboundOauthClientId, base.inboundOauthClientId),
    inboundOauthClientSecret: pickStr(cfg.inboundOauthClientSecret, base.inboundOauthClientSecret),
  }
}

export async function resolveGrabOAuthCredentials(scope?: IntegrationScope): Promise<GrabOAuthCredentials> {
  const tenantId = String(scope?.tenantId || '').trim()
  const isolate = tenantId ? await shouldIsolateTenantIntegrationsFromEnv() : false
  if (!tenantId) return grabOAuthFromProcessEnv()
  const tenantRow = await loadTenantIntegration(tenantId, 'grab')
  if (!tenantRow) {
    return isolate ? emptyGrabOAuthCredentials(`tenant:${tenantId}:missing`) : grabOAuthFromProcessEnv()
  }
  const base = isolate ? emptyGrabOAuthCredentials(`tenant:${tenantId}`) : grabOAuthFromProcessEnv()
  return mergeGrabTenantConfig(base, tenantRow.config as TenantGrabConfig, `tenant:${tenantId}`)
}

/** env + DB tenant_store_integrations → Grab store map (동기 parseGrabStoreMap 대체·확장) */
export async function resolveGrabStoreMap(scope?: IntegrationScope): Promise<Record<string, string>> {
  const tenantId = String(scope?.tenantId || '').trim()
  /** Omni: 플랫폼 GRAB_STORE_MAP_JSON 폴백 금지 — DB 매핑만 */
  const isolate = tenantId ? await shouldIsolateTenantIntegrationsFromEnv() : false
  const out: Record<string, string> = isolate ? {} : { ...parseGrabStoreMap() }

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

async function shouldResolveTenantIdForStoreCode(): Promise<boolean> {
  if (isLegacyChoongmanErpSupabase()) return false
  try {
    const { isServerSaasBrand } = await import('@/lib/app-brand-server')
    return await isServerSaasBrand()
  } catch {
    return isSaasBrand()
  }
}

/** Omni: 고객사 연동에 플랫폼 env 비밀 폴백 금지. 충만은 false. */
async function shouldIsolateTenantIntegrationsFromEnv(): Promise<boolean> {
  return shouldResolveTenantIdForStoreCode()
}

/**
 * erp_stores.tenant_id 컬럼이 없는 DB(충만 레거시)를 한 번 만나면 캐시.
 * 브랜드 env·SUPABASE_URL 오설정으로 가드가 뚫려도, 프로세스당 최대 1회만 조회→이후 영구 스킵(42703 로그 폭주 방지).
 */
let erpStoresTenantIdColumnMissing = false

/** erp_stores.store_code → tenant_id (SaaS 매장). 충만 등 레거시 DB는 조회하지 않음 */
export async function resolveTenantIdForStoreCode(storeCode: string): Promise<string | undefined> {
  const code = String(storeCode || '').trim()
  if (!code || erpStoresTenantIdColumnMissing || isLegacyChoongmanErpSupabase()) return undefined
  if (!(await shouldResolveTenantIdForStoreCode())) return undefined
  try {
    const { supabaseSelectFilter } = await import('@/lib/supabase-server')
    const rows = (await supabaseSelectFilter('erp_stores', `store_code=eq.${encodeURIComponent(code)}`, {
      limit: 1,
      select: 'tenant_id',
    })) as { tenant_id?: string | null }[] | null
    const tenantId = String(rows?.[0]?.tenant_id || '').trim()
    return tenantId || undefined
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/42703|tenant_id.*does not exist|column.*tenant_id/i.test(msg)) {
      erpStoresTenantIdColumnMissing = true
    }
    return undefined
  }
}

/** erp_stores.store_code → tenant DB KBank/Grab 자격 resolve */
export async function resolveKbankRuntimeForStoreCode(storeCode: string): Promise<KbankRuntimeEnv> {
  const code = String(storeCode || '').trim()
  const tenantId = await resolveTenantIdForStoreCode(code)
  return resolveKbankRuntime({ tenantId, storeCode: code || undefined })
}

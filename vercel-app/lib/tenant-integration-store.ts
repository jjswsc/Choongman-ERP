import {
  supabaseSelectFilter,
  supabaseUpsertMerge,
} from '@/lib/supabase-server'
import type {
  IntegrationProvider,
  StoreGrabConfig,
  StoreKbankConfig,
  TenantGrabConfig,
  TenantIntegrationRow,
  TenantKbankConfig,
  TenantStoreIntegrationRow,
} from '@/lib/tenant-integration-types'

type DbTenantRow = {
  id?: number
  tenant_id?: string
  provider?: string
  is_enabled?: boolean
  config_json?: unknown
  notes?: string | null
  updated_at?: string
}

type DbStoreRow = DbTenantRow & { store_code?: string }

function readConfigJson(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* ignore */
    }
  }
  return {}
}

function normalizeProvider(raw: unknown): IntegrationProvider | null {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'kbank' || v === 'grab') return v
  return null
}

function mapTenantRow(row: DbTenantRow): TenantIntegrationRow | null {
  const tenantId = String(row.tenant_id || '').trim()
  const provider = normalizeProvider(row.provider)
  if (!tenantId || !provider) return null
  const config = readConfigJson(row.config_json)
  return {
    id: Number(row.id) || 0,
    tenantId,
    provider,
    isEnabled: row.is_enabled !== false,
    config: config as TenantKbankConfig & TenantGrabConfig,
    notes: String(row.notes || '').trim(),
    updatedAt: String(row.updated_at || ''),
  }
}

function mapStoreRow(row: DbStoreRow): TenantStoreIntegrationRow | null {
  const tenantId = String(row.tenant_id || '').trim()
  const storeCode = String(row.store_code || '').trim()
  const provider = normalizeProvider(row.provider)
  if (!tenantId || !storeCode || !provider) return null
  const config = readConfigJson(row.config_json)
  return {
    id: Number(row.id) || 0,
    tenantId,
    storeCode,
    provider,
    isEnabled: row.is_enabled !== false,
    config: config as StoreKbankConfig & StoreGrabConfig,
    notes: String(row.notes || '').trim(),
    updatedAt: String(row.updated_at || ''),
  }
}

export async function loadTenantIntegration(
  tenantId: string,
  provider: IntegrationProvider
): Promise<TenantIntegrationRow | null> {
  const tid = String(tenantId || '').trim()
  if (!tid) return null
  try {
    const rows = (await supabaseSelectFilter(
      'tenant_integrations',
      `tenant_id=eq.${encodeURIComponent(tid)}&provider=eq.${encodeURIComponent(provider)}`,
      { limit: 1, select: 'id,tenant_id,provider,is_enabled,config_json,notes,updated_at' }
    )) as DbTenantRow[] | null
    const mapped = mapTenantRow(rows?.[0] || {})
    if (!mapped || !mapped.isEnabled) return null
    return mapped
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e)
    if (/relation|does not exist|42P01/i.test(msg)) return null
    throw e
  }
}

export async function loadTenantIntegrationRaw(
  tenantId: string,
  provider: IntegrationProvider
): Promise<TenantIntegrationRow | null> {
  const tid = String(tenantId || '').trim()
  if (!tid) return null
  try {
    const rows = (await supabaseSelectFilter(
      'tenant_integrations',
      `tenant_id=eq.${encodeURIComponent(tid)}&provider=eq.${encodeURIComponent(provider)}`,
      { limit: 1, select: 'id,tenant_id,provider,is_enabled,config_json,notes,updated_at' }
    )) as DbTenantRow[] | null
    return mapTenantRow(rows?.[0] || {})
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e)
    if (/relation|does not exist|42P01/i.test(msg)) return null
    throw e
  }
}

export async function loadTenantStoreIntegration(
  tenantId: string,
  storeCode: string,
  provider: IntegrationProvider
): Promise<TenantStoreIntegrationRow | null> {
  const tid = String(tenantId || '').trim()
  const code = String(storeCode || '').trim()
  if (!tid || !code) return null
  try {
    const rows = (await supabaseSelectFilter(
      'tenant_store_integrations',
      `tenant_id=eq.${encodeURIComponent(tid)}&store_code=eq.${encodeURIComponent(code)}&provider=eq.${encodeURIComponent(provider)}`,
      { limit: 1, select: 'id,tenant_id,store_code,provider,is_enabled,config_json,notes,updated_at' }
    )) as DbStoreRow[] | null
    const mapped = mapStoreRow(rows?.[0] || {})
    return mapped?.isEnabled ? mapped : null
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e)
    if (/relation|does not exist|42P01/i.test(msg)) return null
    throw e
  }
}

export async function listTenantStoreIntegrations(
  tenantId: string,
  provider?: IntegrationProvider
): Promise<TenantStoreIntegrationRow[]> {
  const tid = String(tenantId || '').trim()
  if (!tid) return []
  let filter = `tenant_id=eq.${encodeURIComponent(tid)}`
  if (provider) filter += `&provider=eq.${encodeURIComponent(provider)}`
  try {
    const rows = (await supabaseSelectFilter('tenant_store_integrations', filter, {
      limit: 500,
      order: 'store_code.asc',
      select: 'id,tenant_id,store_code,provider,is_enabled,config_json,notes,updated_at',
    })) as DbStoreRow[] | null
    return (rows || []).map(mapStoreRow).filter((r): r is TenantStoreIntegrationRow => Boolean(r))
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e)
    if (/relation|does not exist|42P01/i.test(msg)) return []
    throw e
  }
}

export async function listAllTenantIntegrationsForAdmin(tenantId: string): Promise<{
  tenant: TenantIntegrationRow[]
  stores: TenantStoreIntegrationRow[]
}> {
  const tid = String(tenantId || '').trim()
  if (!tid) return { tenant: [], stores: [] }
  try {
    const tenantRows = (await supabaseSelectFilter('tenant_integrations', `tenant_id=eq.${encodeURIComponent(tid)}`, {
      limit: 10,
      select: 'id,tenant_id,provider,is_enabled,config_json,notes,updated_at',
    })) as DbTenantRow[] | null
    const storeRows = (await supabaseSelectFilter('tenant_store_integrations', `tenant_id=eq.${encodeURIComponent(tid)}`, {
      limit: 500,
      order: 'store_code.asc,provider.asc',
      select: 'id,tenant_id,store_code,provider,is_enabled,config_json,notes,updated_at',
    })) as DbStoreRow[] | null
    return {
      tenant: (tenantRows || []).map(mapTenantRow).filter((r): r is TenantIntegrationRow => Boolean(r)),
      stores: (storeRows || []).map(mapStoreRow).filter((r): r is TenantStoreIntegrationRow => Boolean(r)),
    }
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e)
    if (/relation|does not exist|42P01/i.test(msg)) return { tenant: [], stores: [] }
    throw e
  }
}

export async function saveTenantIntegration(params: {
  tenantId: string
  provider: IntegrationProvider
  isEnabled: boolean
  config: Record<string, unknown>
  notes?: string
}): Promise<void> {
  const tenantId = String(params.tenantId || '').trim()
  const provider = normalizeProvider(params.provider)
  if (!tenantId || !provider) throw new Error('tenant_id_and_provider_required')
  await supabaseUpsertMerge('tenant_integrations', 'tenant_id,provider', {
    tenant_id: tenantId,
    provider,
    is_enabled: params.isEnabled !== false,
    config_json: params.config || {},
    notes: String(params.notes || '').trim() || null,
    updated_at: new Date().toISOString(),
  })
}

export async function saveTenantStoreIntegration(params: {
  tenantId: string
  storeCode: string
  provider: IntegrationProvider
  isEnabled: boolean
  config: Record<string, unknown>
  notes?: string
}): Promise<void> {
  const tenantId = String(params.tenantId || '').trim()
  const storeCode = String(params.storeCode || '').trim()
  const provider = normalizeProvider(params.provider)
  if (!tenantId || !storeCode || !provider) throw new Error('tenant_store_provider_required')
  await supabaseUpsertMerge('tenant_store_integrations', 'tenant_id,store_code,provider', {
    tenant_id: tenantId,
    store_code: storeCode,
    provider,
    is_enabled: params.isEnabled !== false,
    config_json: params.config || {},
    notes: String(params.notes || '').trim() || null,
    updated_at: new Date().toISOString(),
  })
}

/** API 응답용 — 시크릿 필드 마스킹 */
export function maskIntegrationConfigForAdmin(
  provider: IntegrationProvider,
  config: Record<string, unknown>
): Record<string, unknown> {
  const secretKeys =
    provider === 'kbank'
      ? ['consumerSecret', 'partnerSecret', 'proxySecret']
      : ['clientSecret', 'inboundOauthClientSecret']
  const out: Record<string, unknown> = { ...config }
  for (const key of secretKeys) {
    const v = String(out[key] ?? '').trim()
    if (!v) continue
    out[key] = v.length <= 4 ? '****' : `${'*'.repeat(Math.min(8, v.length - 4))}${v.slice(-4)}`
    out[`${key}Set`] = true
  }
  return out
}

/** 저장 시 빈 시크릿은 기존 값 유지 */
export function mergeIntegrationConfigSecrets(
  provider: IntegrationProvider,
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>
): Record<string, unknown> {
  const secretKeys =
    provider === 'kbank'
      ? ['consumerSecret', 'partnerSecret', 'proxySecret']
      : ['clientSecret', 'inboundOauthClientSecret']
  const out = { ...existing, ...incoming }
  for (const key of secretKeys) {
    const next = String(incoming[key] ?? '').trim()
    if (!next || next.includes('*')) {
      if (existing[key] != null && String(existing[key]).trim()) {
        out[key] = existing[key]
      } else {
        delete out[key]
      }
    }
  }
  return out
}

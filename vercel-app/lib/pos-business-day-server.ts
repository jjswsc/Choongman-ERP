import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { resolveSaasTenantScope, type SaasTenantScope } from '@/lib/saas-tenant-scope'
import {
  tenantScopedSettingsKey,
  tenantScopedSettingsKeys,
  type TenantSettingsScope,
} from '@/lib/tenant-system-settings'
import {
  normalizePosBusinessHours,
  POS_BUSINESS_DAY_DEFAULT_HOURS,
  posBusinessDateYmdToUtcRange,
  type PosBusinessHoursConfig,
} from '@/lib/pos-business-day'
import { normStoreKey } from '@/lib/store-list-keys'
import type { JwtPayload } from '@/lib/jwt-auth'
import { isFranchiseeRole, isManagerRole, isOfficeRole } from '@/lib/permissions'

export const POS_BUSINESS_DAY_KEY_GLOBAL = 'pos_business_day_start'
export const POS_BUSINESS_DAY_KEY_BY_STORE = 'pos_business_day_start_by_store'

export type PosBusinessDaySettingsContext = {
  globalDefault: PosBusinessHoursConfig
  /** normStoreKey → 매장 전용 덮어쓰기 */
  byNormKey: Map<string, PosBusinessHoursConfig>
}

type BusinessDayCacheEntry = { at: number; ctx: PosBusinessDaySettingsContext }
const cacheByTenant = new Map<string, BusinessDayCacheEntry>()
/** 영업일 설정은 자주 바뀌지 않음. 저장 시 invalidatePosBusinessDayServerCache()로 즉시 반영 */
const TTL_MS = 300_000

export type PosBusinessDayLoadHint = {
  tenantId?: string | null
  storeCode?: string | null
}

export function invalidatePosBusinessDayServerCache(): void {
  cacheByTenant.clear()
}

async function resolveBusinessDayScope(
  hint?: PosBusinessDayLoadHint | string | null
): Promise<SaasTenantScope> {
  if (typeof hint === 'string' || hint == null) {
    return resolveSaasTenantScope({ auth: hint ? { tenantId: hint } : null })
  }
  return resolveSaasTenantScope({
    auth: hint.tenantId ? { tenantId: hint.tenantId } : null,
    storeCode: hint.storeCode,
  })
}

function toSettingsScope(scope: SaasTenantScope): TenantSettingsScope {
  return { enforce: scope.enforce, tenantId: scope.tenantId }
}

function cacheKeyFor(scope: TenantSettingsScope): string {
  return scope.enforce && scope.tenantId ? scope.tenantId : ''
}

function parseByStoreJson(raw: unknown): Map<string, PosBusinessHoursConfig> {
  const map = new Map<string, PosBusinessHoursConfig>()
  if (raw == null) return map
  let o: unknown = raw
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw) as unknown
    } catch {
      return map
    }
  }
  if (!o || typeof o !== 'object') return map
  const obj = o as Record<string, unknown>
  const stores = obj.stores
  if (!stores || typeof stores !== 'object') return map
  for (const [k, v] of Object.entries(stores as Record<string, unknown>)) {
    const nk = normStoreKey(k)
    if (!nk) continue
    map.set(nk, normalizePosBusinessHours(v))
  }
  return map
}

export async function loadPosBusinessDaySettingsContext(
  hint?: PosBusinessDayLoadHint | string | null
): Promise<PosBusinessDaySettingsContext> {
  const settingsScope = toSettingsScope(await resolveBusinessDayScope(hint))
  const cacheKey = cacheKeyFor(settingsScope)
  const cached = cacheByTenant.get(cacheKey)
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ctx
  try {
    const lookupKeys = [
      ...new Set([
        ...tenantScopedSettingsKeys(POS_BUSINESS_DAY_KEY_GLOBAL, settingsScope),
        ...tenantScopedSettingsKeys(POS_BUSINESS_DAY_KEY_BY_STORE, settingsScope),
      ]),
    ]
    const orFilter = `or=(${lookupKeys.map((k) => `key.eq.${encodeURIComponent(k)}`).join(',')})`
    const rows = (await supabaseSelectFilter('system_settings', orFilter, {
      limit: Math.max(lookupKeys.length, 4),
      select: 'key,value_json',
    })) as { key?: string; value_json?: unknown }[] | null

    const byKey = new Map<string, unknown>()
    for (const row of rows || []) {
      const k = String(row.key || '').trim()
      if (k) byKey.set(k, row.value_json)
    }
    const globalKey = tenantScopedSettingsKeys(POS_BUSINESS_DAY_KEY_GLOBAL, settingsScope).find((k) =>
      byKey.has(k)
    )
    const storeKey = tenantScopedSettingsKeys(POS_BUSINESS_DAY_KEY_BY_STORE, settingsScope).find((k) =>
      byKey.has(k)
    )
    const globalDefault = globalKey ? normalizePosBusinessHours(byKey.get(globalKey)) : POS_BUSINESS_DAY_DEFAULT_HOURS
    const byNormKey = storeKey ? parseByStoreJson(byKey.get(storeKey)) : new Map<string, PosBusinessHoursConfig>()
    const ctx: PosBusinessDaySettingsContext = { globalDefault, byNormKey }
    cacheByTenant.set(cacheKey, { at: Date.now(), ctx })
    return ctx
  } catch {
    const ctx: PosBusinessDaySettingsContext = {
      globalDefault: POS_BUSINESS_DAY_DEFAULT_HOURS,
      byNormKey: new Map(),
    }
    cacheByTenant.set(cacheKey, { at: Date.now(), ctx })
    return ctx
  }
}

export function resolvePosBusinessHoursFromContext(
  ctx: PosBusinessDaySettingsContext,
  storeCode?: string | null
): PosBusinessHoursConfig {
  const nk = normStoreKey(storeCode || '')
  if (nk && ctx.byNormKey.has(nk)) {
    const hit = ctx.byNormKey.get(nk)
    if (hit) return hit
  }
  return ctx.globalDefault
}

/** @deprecated 이름 호환 — `resolvePosBusinessHoursFromContext` 사용 */
export function resolvePosBusinessDayStartFromContext(
  ctx: PosBusinessDaySettingsContext,
  storeCode?: string | null
): PosBusinessHoursConfig {
  return resolvePosBusinessHoursFromContext(ctx, storeCode)
}

/** 매장 코드 기준 적용 영업 시간(전사 기본 또는 매장 덮어쓰기) */
export async function loadPosBusinessHoursForServer(storeCode?: string | null): Promise<PosBusinessHoursConfig> {
  const ctx = await loadPosBusinessDaySettingsContext({ storeCode })
  return resolvePosBusinessHoursFromContext(ctx, storeCode)
}

/** @deprecated — `loadPosBusinessHoursForServer` */
export async function loadPosBusinessDayStartForServer(storeCode?: string | null): Promise<PosBusinessHoursConfig> {
  return loadPosBusinessHoursForServer(storeCode)
}

function hoursKey(c: PosBusinessHoursConfig): string {
  const x = normalizePosBusinessHours(c)
  return `${x.start.hour}:${x.start.minute}:${x.end.hour}:${x.end.minute}`
}

export function uniquePosBusinessHoursConfigs(ctx: PosBusinessDaySettingsContext): PosBusinessHoursConfig[] {
  const out: PosBusinessHoursConfig[] = []
  const seen = new Set<string>()
  const push = (c: PosBusinessHoursConfig) => {
    const k = hoursKey(c)
    if (seen.has(k)) return
    seen.add(k)
    out.push(normalizePosBusinessHours(c))
  }
  push(ctx.globalDefault)
  for (const c of ctx.byNormKey.values()) push(c)
  return out
}

/** @deprecated */
export function uniquePosBusinessDayConfigs(ctx: PosBusinessDaySettingsContext): PosBusinessHoursConfig[] {
  return uniquePosBusinessHoursConfigs(ctx)
}

/** 방콕 영업일 라벨 YYYY-MM-DD 에 대해, 등장 가능한 모든 영업 시간 설정의 UTC 구간 봉투 */
export function posBusinessDayUtcEnvelopeBangkokYmd(
  ymd: string,
  ctx: PosBusinessDaySettingsContext
): { startISO: string; endISOExclusive: string } {
  const configs = uniquePosBusinessHoursConfigs(ctx)
  let minMs = Infinity
  let maxMs = -Infinity
  for (const c of configs) {
    const { startISO, endISOExclusive } = posBusinessDateYmdToUtcRange(ymd, c)
    const a = Date.parse(startISO)
    const b = Date.parse(endISOExclusive)
    if (Number.isFinite(a)) minMs = Math.min(minMs, a)
    if (Number.isFinite(b)) maxMs = Math.max(maxMs, b)
  }
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    return posBusinessDateYmdToUtcRange(ymd, POS_BUSINESS_DAY_DEFAULT_HOURS)
  }
  return {
    startISO: new Date(minMs).toISOString(),
    endISOExclusive: new Date(maxMs).toISOString(),
  }
}

function authAllowedStoreNormKeys(auth: JwtPayload): Set<string> {
  const set = new Set<string>()
  const main = normStoreKey(auth.store || '')
  if (main) set.add(main)
  for (const x of auth.allowedStores || []) {
    const n = normStoreKey(String(x || ''))
    if (n) set.add(n)
  }
  return set
}

export function authCanSavePosBusinessDayGlobal(auth: JwtPayload): boolean {
  return isOfficeRole(String(auth.role || ''))
}

export function authCanSavePosBusinessDayForStore(auth: JwtPayload, storeCode: string): boolean {
  const role = String(auth.role || '')
  if (isOfficeRole(role)) return true
  if (!isManagerRole(role) && !isFranchiseeRole(role)) return false
  const nk = normStoreKey(storeCode)
  if (!nk) return false
  return authAllowedStoreNormKeys(auth).has(nk)
}

async function readSettingJson(baseKey: string, hint?: PosBusinessDayLoadHint | string | null): Promise<unknown | null> {
  const settingsScope = toSettingsScope(await resolveBusinessDayScope(hint))
  const keys = tenantScopedSettingsKeys(baseKey, settingsScope)
  const filter = `or=(${keys.map((k) => `key.eq.${encodeURIComponent(k)}`).join(',')})`
  const rows = (await supabaseSelectFilter('system_settings', filter, {
    limit: keys.length,
    select: 'key,value_json',
  })) as { key?: string; value_json?: unknown }[] | null
  const byKey = new Map<string, unknown>()
  for (const row of rows || []) {
    const k = String(row.key || '').trim()
    if (k) byKey.set(k, row.value_json)
  }
  for (const candidate of keys) {
    if (byKey.has(candidate)) return byKey.get(candidate) ?? null
  }
  return null
}

export async function readPosBusinessDayByStoreJson(
  hint?: PosBusinessDayLoadHint | string | null
): Promise<Record<string, PosBusinessHoursConfig>> {
  try {
    const m = parseByStoreJson(await readSettingJson(POS_BUSINESS_DAY_KEY_BY_STORE, hint))
    const o: Record<string, PosBusinessHoursConfig> = {}
    for (const [k, v] of m) o[k] = v
    return o
  } catch {
    return {}
  }
}

function serializeHoursForJson(c: PosBusinessHoursConfig): { start: { hour: number; minute: number }; end: { hour: number; minute: number } } {
  const h = normalizePosBusinessHours(c)
  return {
    start: { hour: h.start.hour, minute: h.start.minute },
    end: { hour: h.end.hour, minute: h.end.minute },
  }
}

export async function writePosBusinessDayByStoreJson(
  stores: Record<string, PosBusinessHoursConfig>,
  hint?: PosBusinessDayLoadHint | string | null
): Promise<void> {
  const normalized: Record<string, { start: { hour: number; minute: number }; end: { hour: number; minute: number } }> =
    {}
  for (const [k, v] of Object.entries(stores)) {
    const nk = normStoreKey(k)
    if (!nk) continue
    normalized[nk] = serializeHoursForJson(v)
  }
  const settingsScope = toSettingsScope(await resolveBusinessDayScope(hint))
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: tenantScopedSettingsKey(POS_BUSINESS_DAY_KEY_BY_STORE, settingsScope),
        value_json: { v: 1 as const, stores: normalized },
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
  invalidatePosBusinessDayServerCache()
}

export async function upsertPosBusinessDayStoreOverride(
  storeCode: string,
  config: PosBusinessHoursConfig | null,
  hint?: PosBusinessDayLoadHint | string | null
): Promise<void> {
  const nk = normStoreKey(storeCode)
  if (!nk) return
  const current = await readPosBusinessDayByStoreJson(hint ?? { storeCode })
  if (config == null) {
    delete current[nk]
  } else {
    current[nk] = normalizePosBusinessHours(config)
  }
  await writePosBusinessDayByStoreJson(current, hint ?? { storeCode })
}

export async function upsertPosBusinessDayGlobal(
  config: PosBusinessHoursConfig,
  hint?: PosBusinessDayLoadHint | string | null
): Promise<void> {
  const c = normalizePosBusinessHours(config)
  const settingsScope = toSettingsScope(await resolveBusinessDayScope(hint))
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: tenantScopedSettingsKey(POS_BUSINESS_DAY_KEY_GLOBAL, settingsScope),
        value_json: serializeHoursForJson(c),
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
  invalidatePosBusinessDayServerCache()
}

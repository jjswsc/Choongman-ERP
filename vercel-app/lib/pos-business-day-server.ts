import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
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

let cache: { at: number; ctx: PosBusinessDaySettingsContext } | null = null
const TTL_MS = 60_000

export function invalidatePosBusinessDayServerCache(): void {
  cache = null
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

export async function loadPosBusinessDaySettingsContext(): Promise<PosBusinessDaySettingsContext> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.ctx
  try {
    const orFilter = `or=(key.eq.${encodeURIComponent(POS_BUSINESS_DAY_KEY_GLOBAL)},key.eq.${encodeURIComponent(POS_BUSINESS_DAY_KEY_BY_STORE)})`
    const rows = (await supabaseSelectFilter('system_settings', orFilter, {
      limit: 10,
    })) as { key?: string; value_json?: unknown }[] | null

    let globalDefault = POS_BUSINESS_DAY_DEFAULT_HOURS
    const byNormKey = new Map<string, PosBusinessHoursConfig>()
    for (const row of rows || []) {
      const k = String(row.key || '')
      if (k === POS_BUSINESS_DAY_KEY_GLOBAL) {
        globalDefault = normalizePosBusinessHours(row.value_json)
      } else if (k === POS_BUSINESS_DAY_KEY_BY_STORE) {
        const m = parseByStoreJson(row.value_json)
        for (const [nk, c] of m) byNormKey.set(nk, c)
      }
    }
    const ctx: PosBusinessDaySettingsContext = { globalDefault, byNormKey }
    cache = { at: Date.now(), ctx }
    return ctx
  } catch {
    const ctx: PosBusinessDaySettingsContext = {
      globalDefault: POS_BUSINESS_DAY_DEFAULT_HOURS,
      byNormKey: new Map(),
    }
    cache = { at: Date.now(), ctx }
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
  const ctx = await loadPosBusinessDaySettingsContext()
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

export async function readPosBusinessDayByStoreJson(): Promise<Record<string, PosBusinessHoursConfig>> {
  try {
    const rows = (await supabaseSelectFilter(
      'system_settings',
      `key.eq.${encodeURIComponent(POS_BUSINESS_DAY_KEY_BY_STORE)}`,
      { limit: 1 }
    )) as { value_json?: unknown }[] | null
    const m = parseByStoreJson(rows?.[0]?.value_json)
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

export async function writePosBusinessDayByStoreJson(stores: Record<string, PosBusinessHoursConfig>): Promise<void> {
  const normalized: Record<string, { start: { hour: number; minute: number }; end: { hour: number; minute: number } }> =
    {}
  for (const [k, v] of Object.entries(stores)) {
    const nk = normStoreKey(k)
    if (!nk) continue
    normalized[nk] = serializeHoursForJson(v)
  }
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: POS_BUSINESS_DAY_KEY_BY_STORE,
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
  config: PosBusinessHoursConfig | null
): Promise<void> {
  const nk = normStoreKey(storeCode)
  if (!nk) return
  const current = await readPosBusinessDayByStoreJson()
  if (config == null) {
    delete current[nk]
  } else {
    current[nk] = normalizePosBusinessHours(config)
  }
  await writePosBusinessDayByStoreJson(current)
}

export async function upsertPosBusinessDayGlobal(config: PosBusinessHoursConfig): Promise<void> {
  const c = normalizePosBusinessHours(config)
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: POS_BUSINESS_DAY_KEY_GLOBAL,
        value_json: serializeHoursForJson(c),
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
  invalidatePosBusinessDayServerCache()
}

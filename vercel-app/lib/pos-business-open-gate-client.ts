import { getPosBusinessDaySettings, getPosSettlement } from '@/lib/api-client'
import {
  addDaysYmd,
  getPosBusinessDateStrFromConfig,
  POS_BUSINESS_DAY_DEFAULT_HOURS,
  setPosBusinessHoursClient,
  type PosBusinessHoursConfig,
} from '@/lib/pos-business-day'
import { getPosSettlementWithCache, settlementStoreCacheKeys } from '@/lib/offline/settlement-offline'
import { getFromCache } from '@/lib/offline/cache'
import { readPosBusinessOpenLocal } from '@/lib/pos-business-open-local'
import { isOnline, shouldPreferOfflineCache } from '@/lib/offline/network'
import { isPosBusinessOpenRecorded } from '@/lib/pos-business-open-gate'
import { getBangkokDateStr } from '@/lib/pos-business-day'
import { OFFICE_STORES } from '@/lib/permissions'
import { aliasKeysForStore } from '@/lib/store-vendor-tax-link'
import { normStoreKey } from '@/lib/store-list-keys'
import type { PosSettlement } from '@/lib/api-client'

export type PosBusinessOpenBlockReason = 'none' | 'never_opened' | 'new_business_day'

export type PosBusinessOpenCheckClientResult = {
  allowed: boolean
  businessDateYmd: string
  blockReason: PosBusinessOpenBlockReason
  /** 이전 영업일에 시재가 있었을 때 (새 영업일 미등록) */
  prevBusinessDateYmd?: string
}

function normalizeSettlement(
  settlement: PosSettlement | PosSettlement[] | null | undefined
): PosSettlement | null {
  if (!settlement) return null
  return Array.isArray(settlement) ? settlement[0] ?? null : settlement
}

function uniqueStoreCandidates(codes: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of codes) {
    const t = String(raw || '').trim()
    if (!t) continue
    const key = normStoreKey(t)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

/** CM Office ↔ Office 등 본사 계열 store_code 후보 */
function headOfficeAliasCandidates(storeCode: string): string[] {
  const probe = normStoreKey(storeCode)
  const isOfficeLike = OFFICE_STORES.some((o) => normStoreKey(o) === probe)
  if (!isOfficeLike) {
    const matchesAny = OFFICE_STORES.some((o) => probe.includes(normStoreKey(o)) || normStoreKey(o).includes(probe))
    if (!matchesAny) return []
  }
  return OFFICE_STORES.filter(Boolean)
}

function buildStoreLookupCandidates(
  storeCode: string,
  options?: {
    resolveStoreKey?: (raw: string) => string
    legacyToCanonical?: Record<string, string>
    storeLabels?: Record<string, string>
  }
): string[] {
  const trimmed = String(storeCode || '').trim()
  const canonical = options?.resolveStoreKey?.(trimmed) || trimmed
  const aliases = aliasKeysForStore(
    canonical,
    options?.storeLabels,
    options?.legacyToCanonical
  )
  return uniqueStoreCandidates([
    canonical,
    trimmed,
    ...aliases,
    ...headOfficeAliasCandidates(canonical),
    ...headOfficeAliasCandidates(trimmed),
  ])
}

async function isBusinessOpenInLocalCache(storeCode: string, settleDate: string): Promise<boolean> {
  if (readPosBusinessOpenLocal(storeCode, settleDate)) return true
  for (const sc of settlementStoreCacheKeys(storeCode)) {
    try {
      const key = `settlement:${sc}:${settleDate}`
      const cached = await getFromCache<{ settlement?: PosSettlement | PosSettlement[] | null }>(
        'pos_sales_cache',
        key
      )
      if (isPosBusinessOpenRecorded(normalizeSettlement(cached?.settlement))) return true
    } catch {
      /* next alias */
    }
  }
  return false
}

async function isBusinessOpenForStoreDate(storeCode: string, settleDate: string): Promise<boolean> {
  if (await isBusinessOpenInLocalCache(storeCode, settleDate)) return true
  try {
    const data = await getPosSettlementWithCache({ storeCode, settleDate })
    if (isPosBusinessOpenRecorded(normalizeSettlement(data.settlement))) return true
  } catch {
    /* fall through — API 직접 조회 */
  }
  if (!isOnline() || shouldPreferOfflineCache()) return false
  try {
    const data = await getPosSettlement({ storeCode, settleDate })
    return isPosBusinessOpenRecorded(normalizeSettlement(data.settlement))
  } catch {
    return false
  }
}

async function isBusinessOpenForCandidates(
  storeCandidates: string[],
  settleDate: string
): Promise<boolean> {
  for (const sc of storeCandidates) {
    if (await isBusinessOpenForStoreDate(sc, settleDate)) return true
  }
  return false
}

async function loadStoreBusinessHours(storeCode: string): Promise<PosBusinessHoursConfig> {
  try {
    const j = await getPosBusinessDaySettings(storeCode)
    return {
      start: { hour: j.hour, minute: j.minute },
      end: { hour: j.endHour, minute: j.endMinute },
    }
  } catch {
    return { ...POS_BUSINESS_DAY_DEFAULT_HOURS }
  }
}

/**
 * 터미널·주문 화면용 — 매장 영업시간·store_code 별칭을 반영해 영업 시작(시재) 여부 판정.
 */
export async function checkPosBusinessOpenClient(params: {
  storeCode: string
  resolveStoreKey?: (raw: string) => string
  legacyToCanonical?: Record<string, string>
  storeLabels?: Record<string, string>
  /** true면 조회한 영업시간을 전역 clientOverride에도 반영 */
  syncGlobalBusinessHours?: boolean
}): Promise<PosBusinessOpenCheckClientResult> {
  const store = String(params.storeCode ?? '').trim()
  if (!store) {
    return { allowed: false, businessDateYmd: '', blockReason: 'never_opened' }
  }

  const candidates = buildStoreLookupCandidates(store, params)
  const hours = await loadStoreBusinessHours(candidates[0] || store)
  if (params.syncGlobalBusinessHours !== false) {
    setPosBusinessHoursClient(hours)
  }

  const businessDateYmd = getPosBusinessDateStrFromConfig(new Date(), hours)
  const calendarYmd = getBangkokDateStr()
  const todayDatesToCheck = uniqueStoreCandidates([businessDateYmd, calendarYmd])
  let allowedToday = false
  for (const probeDate of todayDatesToCheck) {
    if (await isBusinessOpenForCandidates(candidates, probeDate)) {
      allowedToday = true
      break
    }
  }
  if (allowedToday) {
    return { allowed: true, businessDateYmd, blockReason: 'none' }
  }

  const prevBusinessDateYmd = addDaysYmd(businessDateYmd, -1)
  const allowedPrev = await isBusinessOpenForCandidates(candidates, prevBusinessDateYmd)
  if (allowedPrev) {
    return {
      allowed: false,
      businessDateYmd,
      blockReason: 'new_business_day',
      prevBusinessDateYmd,
    }
  }

  return { allowed: false, businessDateYmd, blockReason: 'never_opened' }
}

export type EnsurePosBusinessOpenForOrderParams = {
  storeCode: string
  resolveStoreKey?: (raw: string) => string
  legacyToCanonical?: Record<string, string>
  storeLabels?: Record<string, string>
  messages: {
    neverOpened: string
    newBusinessDay: (ctx: {
      businessDateYmd: string
      prevBusinessDateYmd?: string
    }) => string
  }
  onAlert: (message: string) => void | Promise<void>
}

/** 주문·테이블 선택 직전 — React 게이트 state가 stale일 수 있어 항상 최신 판정 */
export async function ensurePosBusinessOpenForOrder(
  params: EnsurePosBusinessOpenForOrderParams
): Promise<boolean> {
  const store = String(params.storeCode ?? '').trim()
  if (!store) {
    await params.onAlert(params.messages.neverOpened)
    return false
  }
  const result = await checkPosBusinessOpenClient({
    storeCode: store,
    resolveStoreKey: params.resolveStoreKey,
    legacyToCanonical: params.legacyToCanonical,
    storeLabels: params.storeLabels,
  })
  if (result.allowed) return true
  const msg =
    result.blockReason === 'new_business_day'
      ? params.messages.newBusinessDay({
          businessDateYmd: result.businessDateYmd,
          prevBusinessDateYmd: result.prevBusinessDateYmd,
        })
      : params.messages.neverOpened
  await params.onAlert(msg)
  return false
}

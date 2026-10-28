import { bangkokTodayYmd } from '@/lib/bangkok-date'
import { stripTenantPrefixedStoreCode } from '@/lib/pos-operating-store-code'
import {
  OPTION_STEP_SOLD_OUT_PART_KEY,
  normalizeOptionStepKey,
  normalizeOptionStepValue,
  normalizePosMenuSoldOutScope,
  optionStepSoldOutKey,
  optionStepValuesHitSoldOut,
  shouldApplyOptionStepSoldOutForChannel,
  type OptionStepSoldOutChannel,
  type PosMenuSoldOutScope,
} from '@/lib/pos-option-step-store-sold-out'

export { applyStorefrontPartSoldOutToOptionFlags } from '@/lib/pos-option-step-store-sold-out'
import { supabaseDeleteByFilter, supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

export type OptionStepSoldOutItem = {
  stepKey: string
  stepValue: string
  soldOutDate: string
  scope: PosMenuSoldOutScope
}

export type StoreOptionStepSoldOutLoadResult = {
  /** "part:Wing" → sold_out_date */
  byKey: Map<string, string>
  scopeByKey: Map<string, PosMenuSoldOutScope>
  /** 품절 판정용 Set (channel 필터 반영) */
  soldOutKeys: Set<string>
  schemaReady: boolean
}

function isMissingRelationError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err || '').toLowerCase()
  return (
    msg.includes('pos_option_step_store_sold_out') &&
    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
  )
}

/** 매장별 옵션 단계 품절 로드. 테이블 미배포면 schemaReady=false */
export async function loadStoreOptionStepSoldOut(
  storeCode: string,
  opts?: { channel?: OptionStepSoldOutChannel }
): Promise<StoreOptionStepSoldOutLoadResult> {
  const code = stripTenantPrefixedStoreCode(storeCode)
  const empty: StoreOptionStepSoldOutLoadResult = {
    byKey: new Map(),
    scopeByKey: new Map(),
    soldOutKeys: new Set(),
    schemaReady: true,
  }
  if (!code) return empty
  const channel = opts?.channel ?? 'storefront'
  try {
    const rows = (await supabaseSelectFilter(
      'pos_option_step_store_sold_out',
      `store_code=eq.${encodeURIComponent(code)}`,
      {
        limit: 5000,
        select: 'step_key,step_value,sold_out_date,scope',
      }
    )) as Array<{
      step_key?: string | null
      step_value?: string | null
      sold_out_date?: string | null
      scope?: string | null
    }>
    const byKey = new Map<string, string>()
    const scopeByKey = new Map<string, PosMenuSoldOutScope>()
    const soldOutKeys = new Set<string>()
    for (const row of rows || []) {
      const stepKey = normalizeOptionStepKey(row.step_key)
      const stepValue = normalizeOptionStepValue(row.step_value)
      const d = String(row.sold_out_date || '').trim().slice(0, 10)
      if (!stepKey || !stepValue || !d) continue
      const scope = normalizePosMenuSoldOutScope(row.scope ?? 'store')
      const key = optionStepSoldOutKey(stepKey, stepValue)
      byKey.set(key, d)
      scopeByKey.set(key, scope)
      if (shouldApplyOptionStepSoldOutForChannel(channel, scope)) {
        soldOutKeys.add(key)
      }
    }
    return { byKey, scopeByKey, soldOutKeys, schemaReady: true }
  } catch (e) {
    if (isMissingRelationError(e)) {
      return {
        byKey: new Map(),
        scopeByKey: new Map(),
        soldOutKeys: new Set(),
        schemaReady: false,
      }
    }
    throw e
  }
}

export function isOptionStepSoldOutForStore(
  optionStepValues: Record<string, string> | null | undefined,
  soldOutKeys: ReadonlySet<string>
): boolean {
  return optionStepValuesHitSoldOut(optionStepValues, soldOutKeys)
}

/** 매장 품절 ON/OFF. soldOut=false 이면 행 삭제. v1 scope 기본 store */
export async function setStoreOptionStepSoldOut(params: {
  storeCode: string
  stepKey: string
  stepValue: string
  soldOut: boolean
  scope?: PosMenuSoldOutScope
}): Promise<{
  soldOutDate: string | null
  soldOutScope: PosMenuSoldOutScope | null
  schemaReady: boolean
}> {
  const storeCode = stripTenantPrefixedStoreCode(params.storeCode)
  const stepKey = normalizeOptionStepKey(params.stepKey)
  const stepValue = normalizeOptionStepValue(params.stepValue)
  if (!storeCode || !stepKey || !stepValue) {
    throw new Error('storeCode, stepKey, stepValue required')
  }
  const scope = normalizePosMenuSoldOutScope(params.scope ?? 'store')
  const today = bangkokTodayYmd()
  try {
    if (params.soldOut) {
      await supabaseUpsert(
        'pos_option_step_store_sold_out',
        [
          {
            store_code: storeCode,
            step_key: stepKey,
            step_value: stepValue,
            sold_out_date: today,
            scope,
          },
        ],
        'store_code,step_key,step_value'
      )
      return { soldOutDate: today, soldOutScope: scope, schemaReady: true }
    }
    await supabaseDeleteByFilter(
      'pos_option_step_store_sold_out',
      `store_code=eq.${encodeURIComponent(storeCode)}&step_key=eq.${encodeURIComponent(stepKey)}&step_value=eq.${encodeURIComponent(stepValue)}`
    )
    return { soldOutDate: null, soldOutScope: null, schemaReady: true }
  } catch (e) {
    if (isMissingRelationError(e)) {
      return { soldOutDate: null, soldOutScope: null, schemaReady: false }
    }
    throw e
  }
}

/** 활성 메뉴 옵션에서 distinct part 값 수집 (UI 목록용) */
export async function listDistinctOptionStepParts(): Promise<string[]> {
  const preferred = ['Boneless', 'Wing', 'Drumette']
  const parts = new Set<string>()
  try {
    const rows = (await supabaseSelectFilter('pos_menu_options', 'option_step_values=not.is.null', {
      limit: 50000,
      select: 'option_step_values',
    })) as Array<{ option_step_values?: Record<string, string> | null }>
    for (const row of rows || []) {
      const sv = row.option_step_values
      if (!sv || typeof sv !== 'object' || Array.isArray(sv)) continue
      const part = normalizeOptionStepValue(
        (sv as Record<string, string>)[OPTION_STEP_SOLD_OUT_PART_KEY] ??
          (sv as Record<string, string>).part
      )
      if (part) parts.add(part)
    }
  } catch {
    // 컬럼 미배포·필터 실패 시 치킨 기본 부위만 노출
    return [...preferred]
  }
  if (parts.size === 0) return [...preferred]
  const rest = [...parts].filter((p) => !preferred.includes(p)).sort((a, b) => a.localeCompare(b))
  return [...preferred.filter((p) => parts.has(p)), ...rest]
}

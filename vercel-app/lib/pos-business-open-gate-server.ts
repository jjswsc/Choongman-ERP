import { supabaseSelectFilter } from '@/lib/supabase-server'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { loadPosBusinessHoursForServer } from '@/lib/pos-business-day-server'
import { POS_BUSINESS_OPEN_REQUIRED_CODE } from '@/lib/pos-business-open-gate'
import { resolvePosStoreFilterCandidates } from '@/lib/pos-store-filter-candidates'
import { normStoreKey } from '@/lib/store-list-keys'

export type PosBusinessOpenCheckResult =
  | { ok: true; businessDateYmd: string }
  | { ok: false; businessDateYmd: string; message: string; code: string }

/** 매장·영업일 기준 영업 시작(시재) 저장 여부 */
export async function loadPosBusinessOpenStatus(
  storeCode: string,
  settleDateYmd?: string
): Promise<{ businessDateYmd: string; isOpen: boolean }> {
  const store = String(storeCode ?? '').trim()
  if (!store) return { businessDateYmd: '', isOpen: false }

  const hours = await loadPosBusinessHoursForServer(store)
  const businessDateYmd =
    String(settleDateYmd ?? '')
      .trim()
      .slice(0, 10) || getPosBusinessDateStrFromConfig(new Date(), hours)

  try {
    const rows = (await supabaseSelectFilter(
      'pos_settlements',
      `store_code=eq.${encodeURIComponent(store)}&settle_date=eq.${encodeURIComponent(businessDateYmd)}`,
      { limit: 1, select: 'cash_actual' }
    )) as { cash_actual?: number | null }[] | null
    const cashActual = rows?.[0]?.cash_actual
    const isOpen = cashActual != null && Number.isFinite(Number(cashActual))
    return { businessDateYmd, isOpen }
  } catch {
    return { businessDateYmd, isOpen: false }
  }
}

/** 신규·수정 주문 저장 전 영업 시작 필수 */
export async function assertPosBusinessOpenForOrderSave(storeCode: string): Promise<PosBusinessOpenCheckResult> {
  const store = String(storeCode ?? '').trim()
  if (!store) {
    return {
      ok: false,
      businessDateYmd: '',
      message: 'store_required',
      code: 'store_required',
    }
  }

  /** 가장 흔한 경우: 요청 store_code 가 시재 키와 일치 → 후보 전개 전에 1회만 조회 */
  const primary = await loadPosBusinessOpenStatus(store)
  if (primary.isOpen) {
    return { ok: true, businessDateYmd: primary.businessDateYmd }
  }

  const candidates = await resolvePosStoreFilterCandidates(store).catch(() => [] as string[])
  const storeKey = normStoreKey(store)
  const others = candidates.filter((c) => {
    const k = normStoreKey(String(c || '').trim())
    return Boolean(k) && k !== storeKey
  })

  let businessDateYmd = primary.businessDateYmd
  if (others.length > 0) {
    const statuses = await Promise.all(others.map((c) => loadPosBusinessOpenStatus(c)))
    for (const status of statuses) {
      if (status.businessDateYmd) businessDateYmd = status.businessDateYmd
      if (status.isOpen) {
        return { ok: true, businessDateYmd: status.businessDateYmd }
      }
    }
  }

  if (!businessDateYmd) {
    businessDateYmd = primary.businessDateYmd
  }

  return {
    ok: false,
    businessDateYmd,
    message: POS_BUSINESS_OPEN_REQUIRED_CODE,
    code: POS_BUSINESS_OPEN_REQUIRED_CODE,
  }
}

function storeCandidateKeys(codes: string[]): Set<string> {
  const out = new Set<string>()
  for (const raw of codes) {
    const key = normStoreKey(String(raw || '').trim())
    if (key) out.add(key)
  }
  return out
}

/** 기존 주문 결제 — 주문 store_code에 시재가 없으면 POS 단말 매장(연동된 별칭)으로 폴백 */
export async function assertPosBusinessOpenForExistingOrderSave(params: {
  orderStoreCode: string
  terminalStoreCode?: string
}): Promise<PosBusinessOpenCheckResult> {
  const orderStore = String(params.orderStoreCode ?? '').trim()
  const orderCheck = await assertPosBusinessOpenForOrderSave(orderStore)
  if (orderCheck.ok) return orderCheck

  const terminal = String(params.terminalStoreCode ?? '').trim()
  if (!terminal) return orderCheck

  const terminalCheck = await assertPosBusinessOpenForOrderSave(terminal)
  if (!terminalCheck.ok) return orderCheck

  const [orderCandidates, terminalCandidates] = await Promise.all([
    resolvePosStoreFilterCandidates(orderStore).catch(() => [] as string[]),
    resolvePosStoreFilterCandidates(terminal).catch(() => [] as string[]),
  ])
  const terminalKeys = storeCandidateKeys(terminalCandidates)
  const linked =
    orderCandidates.some((code) => terminalKeys.has(normStoreKey(code))) ||
    terminalCandidates.some((code) => orderCandidates.includes(code)) ||
    normStoreKey(orderStore) === normStoreKey(terminal) ||
    terminalCandidates.includes(orderStore)

  return linked ? terminalCheck : orderCheck
}

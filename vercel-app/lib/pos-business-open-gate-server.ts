import { supabaseSelectFilter } from '@/lib/supabase-server'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { loadPosBusinessHoursForServer } from '@/lib/pos-business-day-server'
import { POS_BUSINESS_OPEN_REQUIRED_CODE } from '@/lib/pos-business-open-gate'

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
  const { businessDateYmd, isOpen } = await loadPosBusinessOpenStatus(store)
  if (!isOpen) {
    return {
      ok: false,
      businessDateYmd,
      message: POS_BUSINESS_OPEN_REQUIRED_CODE,
      code: POS_BUSINESS_OPEN_REQUIRED_CODE,
    }
  }
  return { ok: true, businessDateYmd }
}

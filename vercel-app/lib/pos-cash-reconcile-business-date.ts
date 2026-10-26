/**
 * 채널 현금·드릴 — paid_at(없으면 created_at) 영업일 라벨.
 * 라우트에서 bizCtx 와 함께 사용.
 */
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { resolvePosBusinessHoursFromContext } from '@/lib/pos-business-day-server'
import type { PosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import {
  cashReconcileEventTimestamp,
  parseCashReconcileEventDate,
  type CashReconcileOrderRow,
} from '@/lib/pos-cash-reconcile'

export function makeCashReconcileBusinessDateForRow(bizCtx: PosBusinessDaySettingsContext) {
  return (row: CashReconcileOrderRow): string => {
    const raw = cashReconcileEventTimestamp(row)
    if (!raw) return ''
    const d = parseCashReconcileEventDate(raw)
    if (!d) return raw.slice(0, 10)
    const hours = resolvePosBusinessHoursFromContext(bizCtx, String(row.store_code ?? '').trim())
    return getPosBusinessDateStrFromConfig(d, hours)
  }
}

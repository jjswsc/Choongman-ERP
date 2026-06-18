/**
 * Omni(SaaS) pos_orders — 충만 POS API와 병행 저장 시 레거시 컬럼(store_name 등) 보강.
 * Choongman DB에는 해당 컬럼이 없을 수 있어 supabaseInsertWithPgrst204Fallback 이 제거한다.
 */
export type PosOrderSaaSCompatOpts = {
  tenantId?: string | null
  /** erp_stores.store_name 등 표시명. 없으면 store_code 사용 */
  storeDisplayName?: string | null
}

export function enrichPosOrderRowForSaaS(
  row: Record<string, unknown>,
  opts?: PosOrderSaaSCompatOpts
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }
  const storeCode = String(row.store_code ?? '').trim()
  const displayName = String(opts?.storeDisplayName ?? '').trim()
  if (storeCode || displayName) {
    if (out.store_name == null || String(out.store_name).trim() === '') {
      out.store_name = displayName || storeCode
    }
  }
  if (row.total != null && (out.total_amount == null || out.total_amount === '')) {
    out.total_amount = row.total
  }
  const tenantId = String(opts?.tenantId ?? '').trim()
  if (tenantId && (out.tenant_id == null || String(out.tenant_id).trim() === '')) {
    out.tenant_id = tenantId
  }
  return out
}

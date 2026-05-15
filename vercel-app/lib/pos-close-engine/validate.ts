import { supabaseRpc, supabaseUpsert } from '@/lib/supabase-server'

type CloseSnapshotRow = {
  store_code?: string
  business_date?: string
  system_total?: number
  settlement_total?: number
  diff_total?: number
  has_settlement?: boolean
  close_status?: string
}

export type PosCloseValidateResult = {
  storeCode: string
  businessDate: string
  systemTotal: number
  settlementTotal: number
  diffTotal: number
  hasSettlement: boolean
  status: 'validated' | 'draft'
  checks: {
    hasSettlement: boolean
    diffWithinTolerance: boolean
  }
}

export async function validatePosCloseRun(params: {
  storeCode: string
  businessDate: string
}): Promise<PosCloseValidateResult> {
  const storeCode = String(params.storeCode || '').trim()
  const businessDate = String(params.businessDate || '').trim().slice(0, 10)
  if (!storeCode || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error('INVALID_POS_CLOSE_VALIDATE_PARAMS')
  }
  const rows = await supabaseRpc<CloseSnapshotRow[]>('get_pos_close_snapshot', {
    p_store_code: storeCode,
    p_settle_date: businessDate,
  })
  const row = rows?.[0] || {}
  const systemTotal = Number(row.system_total || 0)
  const settlementTotal = Number(row.settlement_total || 0)
  const diffTotal = Number(row.diff_total || 0)
  const hasSettlement = Boolean(row.has_settlement)
  const diffWithinTolerance = Math.abs(diffTotal) <= 0.5
  const status: 'validated' | 'draft' = hasSettlement && diffWithinTolerance ? 'validated' : 'draft'

  const checks = {
    hasSettlement,
    diffWithinTolerance,
  }
  await supabaseUpsert(
    'pos_close_runs',
    [
      {
        store_code: storeCode,
        business_date: businessDate,
        status,
        checks_json: checks,
        totals_json: {
          systemTotal,
          settlementTotal,
          diffTotal,
        },
        validated_at: new Date().toISOString(),
      },
    ],
    'store_code,business_date'
  )

  return {
    storeCode,
    businessDate,
    systemTotal,
    settlementTotal,
    diffTotal,
    hasSettlement,
    status,
    checks,
  }
}

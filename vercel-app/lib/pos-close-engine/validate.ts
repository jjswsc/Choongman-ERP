import { supabaseUpsert } from '@/lib/supabase-server'
import { computePosCloseSnapshot } from '@/lib/pos-close-engine/snapshot'

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

  const snap = await computePosCloseSnapshot({ storeCode, businessDate })
  const diffWithinTolerance = Math.abs(snap.diffTotal) <= 0.5
  const status: 'validated' | 'draft' =
    snap.hasSettlement && diffWithinTolerance ? 'validated' : 'draft'

  const checks = {
    hasSettlement: snap.hasSettlement,
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
          systemTotal: snap.systemTotal,
          settlementTotal: snap.settlementTotal,
          diffTotal: snap.diffTotal,
        },
        validated_at: new Date().toISOString(),
      },
    ],
    'store_code,business_date'
  )

  return {
    storeCode,
    businessDate,
    systemTotal: snap.systemTotal,
    settlementTotal: snap.settlementTotal,
    diffTotal: snap.diffTotal,
    hasSettlement: snap.hasSettlement,
    status,
    checks,
  }
}

import { supabaseUpsert } from '@/lib/supabase-server'
import { computePosCloseSnapshot } from '@/lib/pos-close-engine/snapshot'
import {
  assertSaasTenantWritable,
  saasTenantStoreConflictTarget,
  stampSaasTenantIdForUniqueKey,
  type SaasTenantScope,
  LEGACY_SAAS_TENANT_SCOPE,
} from '@/lib/saas-tenant-scope'

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
  tenantScope?: SaasTenantScope
}): Promise<PosCloseValidateResult> {
  const storeCode = String(params.storeCode || '').trim()
  const businessDate = String(params.businessDate || '').trim().slice(0, 10)
  const tenantScope = params.tenantScope || LEGACY_SAAS_TENANT_SCOPE
  if (!storeCode || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error('INVALID_POS_CLOSE_VALIDATE_PARAMS')
  }
  const writeErr = assertSaasTenantWritable(tenantScope, {
    tableHint: 'pos_close_runs',
    label: 'POS 마감',
  })
  if (writeErr) throw new Error(writeErr)

  const snap = await computePosCloseSnapshot({ storeCode, businessDate, tenantScope })
  const diffWithinTolerance = Math.abs(snap.diffTotal) <= 0.5
  const status: 'validated' | 'draft' =
    snap.hasSettlement && diffWithinTolerance ? 'validated' : 'draft'

  const checks = {
    hasSettlement: snap.hasSettlement,
    diffWithinTolerance,
  }
  const row = stampSaasTenantIdForUniqueKey(
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
    tenantScope
  )
  try {
    await supabaseUpsert(
      'pos_close_runs',
      [row],
      saasTenantStoreConflictTarget(tenantScope, 'store_code,business_date')
    )
  } catch (e) {
    /** W0 SQL 미적용 환경 — 레거시 unique 폴백 */
    const msg = e instanceof Error ? e.message : String(e)
    if (/on conflict|42P10|unique|tenant_id/i.test(msg)) {
      const { tenant_id: _t, ...legacy } = row
      await supabaseUpsert('pos_close_runs', [legacy], 'store_code,business_date')
    } else {
      throw e
    }
  }

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

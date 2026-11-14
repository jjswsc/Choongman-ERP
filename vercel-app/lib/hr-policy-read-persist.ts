import { supabaseInsert, supabaseUpdateByFilterReturning, supabaseUpsert } from '@/lib/supabase-server'
import {
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  stampSaasTenantId,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

function isDuplicateKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  return /duplicate key|23505|already exists/i.test(msg)
}

/**
 * 인사 규정 확인 저장. 같은 이름·같은 규정은 매장 표기가 달라도 최신 버전으로 맞춘다.
 */
export async function persistHrPolicyRead(params: {
  policyId: number
  store: string
  name: string
  contentVersion: number
  tenantScope: SaasTenantScope
}): Promise<void> {
  const policyId = Number(params.policyId)
  const store = String(params.store || '').trim()
  const name = String(params.name || '').trim()
  const cv = Math.max(1, Math.floor(Number(params.contentVersion ?? 1)) || 1)
  if (!Number.isFinite(policyId) || policyId <= 0 || !store || !name) {
    throw new Error('invalid hr policy read key')
  }
  const patch = {
    status: '확인',
    read_at: new Date().toISOString(),
    acknowledged_version: cv,
  }
  const nameFilter = `policy_id=eq.${policyId}&name=eq.${encodeURIComponent(name)}`
  const updated = await supabaseUpdateByFilterReturning('hr_policy_reads', nameFilter, patch)
  if (Array.isArray(updated) && updated.length > 0) return

  const insertOnce = async (row: Record<string, unknown>) => {
    try {
      await supabaseInsert('hr_policy_reads', row)
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        await supabaseUpdateByFilterReturning('hr_policy_reads', nameFilter, patch)
        return
      }
      throw e
    }
  }

  const row = stampSaasTenantId(
    { policy_id: policyId, store, name, ...patch },
    params.tenantScope,
    'hr_policy_reads'
  )
  try {
    await insertOnce(row)
  } catch (e) {
    if (isMissingSaasTenantColumnError(e) && 'tenant_id' in row) {
      markSaasTenantColumnMissing('hr_policy_reads')
      const { tenant_id: _t, ...withoutTenant } = row
      await insertOnce(withoutTenant)
      return
    }
    try {
      await supabaseUpsert('hr_policy_reads', [row], 'policy_id,store,name')
    } catch (e2) {
      if (isMissingSaasTenantColumnError(e2) && 'tenant_id' in row) {
        markSaasTenantColumnMissing('hr_policy_reads')
        const { tenant_id: _t, ...withoutTenant } = row
        await supabaseUpsert('hr_policy_reads', [withoutTenant], 'policy_id,store,name')
        return
      }
      throw e2
    }
  }
}

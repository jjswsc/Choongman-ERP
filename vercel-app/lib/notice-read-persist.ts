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
 * 공지 확인 저장. upsert on_conflict 실패(유니크 없음 등)여도 insert/update로 남긴다.
 * 같은 이름·같은 공지는 매장 표기가 달라도 확인으로 맞춘다.
 */
export async function persistNoticeRead(params: {
  noticeId: number
  store: string
  name: string
  tenantScope: SaasTenantScope
}): Promise<void> {
  const noticeId = Number(params.noticeId)
  const store = String(params.store || '').trim()
  const name = String(params.name || '').trim()
  if (!Number.isFinite(noticeId) || noticeId <= 0 || !store || !name) {
    throw new Error('invalid notice read key')
  }
  const patch = {
    status: '확인',
    read_at: new Date().toISOString(),
  }
  const nameFilter = `notice_id=eq.${noticeId}&name=eq.${encodeURIComponent(name)}`
  const updated = await supabaseUpdateByFilterReturning('notice_reads', nameFilter, patch)
  if (Array.isArray(updated) && updated.length > 0) return

  const insertOnce = async (row: Record<string, unknown>) => {
    try {
      await supabaseInsert('notice_reads', row)
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        await supabaseUpdateByFilterReturning('notice_reads', nameFilter, patch)
        return
      }
      throw e
    }
  }

  const row = stampSaasTenantId(
    { notice_id: noticeId, store, name, ...patch },
    params.tenantScope,
    'notice_reads'
  )
  try {
    await insertOnce(row)
  } catch (e) {
    if (isMissingSaasTenantColumnError(e) && 'tenant_id' in row) {
      markSaasTenantColumnMissing('notice_reads')
      const { tenant_id: _t, ...withoutTenant } = row
      await insertOnce(withoutTenant)
      return
    }
    try {
      await supabaseUpsert('notice_reads', [row], 'notice_id,store,name')
    } catch (e2) {
      if (isMissingSaasTenantColumnError(e2) && 'tenant_id' in row) {
        markSaasTenantColumnMissing('notice_reads')
        const { tenant_id: _t, ...withoutTenant } = row
        await supabaseUpsert('notice_reads', [withoutTenant], 'notice_id,store,name')
        return
      }
      throw e2
    }
  }
}

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
 * 공지 확인 저장.
 * 반드시 현재 로그인 매장(store)+이름 키로 upsert 한다.
 * (예전 name-only UPDATE는 다른 매장 행만 갱신하고 현재 매장 행이 없어 모바일에서 「확인했는데 다음날 또 뜸」이 났다.)
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

  const storeFilter =
    `notice_id=eq.${noticeId}` +
    `&store=eq.${encodeURIComponent(store)}` +
    `&name=eq.${encodeURIComponent(name)}`

  const updatedSameStore = await supabaseUpdateByFilterReturning('notice_reads', storeFilter, patch)
  if (Array.isArray(updatedSameStore) && updatedSameStore.length > 0) {
    // 같은 이름·다른 매장 표기 행도 확인으로 맞춤(조회 폴백용)
    const nameFilter = `notice_id=eq.${noticeId}&name=eq.${encodeURIComponent(name)}`
    try {
      await supabaseUpdateByFilterReturning('notice_reads', nameFilter, patch)
    } catch {
      /* best-effort */
    }
    return
  }

  const insertOnce = async (row: Record<string, unknown>) => {
    try {
      await supabaseInsert('notice_reads', row)
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        await supabaseUpdateByFilterReturning('notice_reads', storeFilter, patch)
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
    } else {
      try {
        await supabaseUpsert('notice_reads', [row], 'notice_id,store,name')
      } catch (e2) {
        if (isMissingSaasTenantColumnError(e2) && 'tenant_id' in row) {
          markSaasTenantColumnMissing('notice_reads')
          const { tenant_id: _t, ...withoutTenant } = row
          await supabaseUpsert('notice_reads', [withoutTenant], 'notice_id,store,name')
        } else {
          throw e2
        }
      }
    }
  }

  // 이름만 같은 기존 행도 확인으로 맞춤
  const nameFilter = `notice_id=eq.${noticeId}&name=eq.${encodeURIComponent(name)}`
  try {
    await supabaseUpdateByFilterReturning('notice_reads', nameFilter, patch)
  } catch {
    /* best-effort */
  }
}

import { isNoticeReadStatus } from '@/lib/notice-read-status'
import { normalizeNoticePersonName } from '@/lib/notice-person-key'
import { resolveCanonicalNoticeEmployeeKeys } from '@/lib/notice-read-canonical'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilterReturning, supabaseUpsert } from '@/lib/supabase-server'
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

async function upsertNoticeReadRow(params: {
  noticeId: number
  store: string
  name: string
  patch: { status: string; read_at: string }
  tenantScope: SaasTenantScope
}): Promise<void> {
  const { noticeId, store, name, patch, tenantScope } = params
  const storeFilter =
    `notice_id=eq.${noticeId}` +
    `&store=eq.${encodeURIComponent(store)}` +
    `&name=eq.${encodeURIComponent(name)}`

  const updated = await supabaseUpdateByFilterReturning('notice_reads', storeFilter, patch)
  if (Array.isArray(updated) && updated.length > 0) return

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
    tenantScope,
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

async function verifyNoticeReadSaved(params: {
  noticeId: number
  stores: string[]
  name: string
}): Promise<boolean> {
  const name = normalizeNoticePersonName(params.name)
  if (!name || params.stores.length === 0) return false
  for (const store of params.stores) {
    const filter =
      `notice_id=eq.${params.noticeId}` +
      `&store=eq.${encodeURIComponent(store)}` +
      `&name=eq.${encodeURIComponent(name)}`
    try {
      const rows = (await supabaseSelectFilter('notice_reads', filter, {
        limit: 1,
        select: 'status',
      })) as { status?: string }[]
      if (rows?.[0] && isNoticeReadStatus(String(rows[0].status || ''))) return true
    } catch {
      /* try next store */
    }
  }
  return false
}

/**
 * 공지 확인 저장.
 * - 로그인 매장 + 인사 마스터 매장(표기만 다른 경우) 모두 upsert
 * - 저장 후 재조회로 검증 (실패 시 throw → API 500 → 클라이언트 롤백)
 */
export async function persistNoticeRead(params: {
  noticeId: number
  store: string
  name: string
  tenantScope: SaasTenantScope
}): Promise<{ verified: boolean; stores: string[]; name: string }> {
  const noticeId = Number(params.noticeId)
  const loginStore = String(params.store || '').trim()
  const loginName = normalizeNoticePersonName(params.name)
  if (!Number.isFinite(noticeId) || noticeId <= 0 || !loginStore || !loginName) {
    throw new Error('invalid notice read key')
  }

  const canonical = await resolveCanonicalNoticeEmployeeKeys({
    store: loginStore,
    name: loginName,
    tenantScope: params.tenantScope,
  })
  const name = canonical.name || loginName
  const stores = canonical.stores.length > 0 ? canonical.stores : [loginStore]
  const patch = {
    status: '확인',
    read_at: new Date().toISOString(),
  }

  for (const store of stores) {
    await upsertNoticeReadRow({
      noticeId,
      store,
      name,
      patch,
      tenantScope: params.tenantScope,
    })
  }

  const verified = await verifyNoticeReadSaved({ noticeId, stores, name })
  if (!verified) {
    throw new Error('notice read verify failed')
  }
  return { verified: true, stores, name }
}

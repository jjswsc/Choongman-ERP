import 'server-only'

import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { normalizeNoticePersonName, noticePersonNamesMatch } from '@/lib/notice-person-key'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/**
 * 인사 마스터 기준으로 공지 확인에 쓸 매장·이름 키를 고른다.
 * 로그인 매장 문자열과 DB 매장이 CM/대소문자만 달라도 양쪽 키로 저장할 수 있게 stores 목록을 반환.
 */
export async function resolveCanonicalNoticeEmployeeKeys(params: {
  store: string
  name: string
  tenantScope: SaasTenantScope
}): Promise<{ name: string; stores: string[] }> {
  const loginStore = String(params.store || '').trim()
  const loginName = normalizeNoticePersonName(params.name)
  const stores = new Set<string>()
  if (loginStore) stores.add(loginStore)
  let canonicalName = loginName

  if (!loginName) return { name: '', stores: [...stores] }

  const base = `name=eq.${encodeURIComponent(loginName)}`
  const filter = appendSaasTenantFilter(base, params.tenantScope, 'employees')
  let rows: { store?: string; name?: string }[] = []
  try {
    rows = (await supabaseSelectFilter('employees', filter, {
      limit: 100,
      select: 'store,name',
    })) as { store?: string; name?: string }[]
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('employees')
      rows = (await supabaseSelectFilter('employees', base, {
        limit: 100,
        select: 'store,name',
      })) as { store?: string; name?: string }[]
    } else {
      // 조회 실패해도 로그인 키로는 저장 진행
      return { name: loginName, stores: [...stores] }
    }
  }

  for (const e of rows || []) {
    const es = String(e.store || '').trim()
    const en = normalizeNoticePersonName(String(e.name || ''))
    if (!es || !en) continue
    if (!noticePersonNamesMatch(en, loginName)) continue
    if (es === loginStore || storesMatchForGradeLookup(es, loginStore)) {
      stores.add(es)
      canonicalName = en
    }
  }

  return { name: canonicalName || loginName, stores: [...stores] }
}

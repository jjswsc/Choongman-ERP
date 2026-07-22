import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import type { JwtPayload } from '@/lib/jwt-auth'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { normalizeTenantId } from '@/lib/tenant-context'
import {
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

export type InteriorTenantGuardOk = {
  ok: true
  auth: JwtPayload
  scope: SaasTenantScope
  errorResponse: null
}

export type InteriorTenantGuardFail = {
  ok: false
  auth: null
  scope: SaasTenantScope
  errorResponse: NextResponse
}

/** 인테리어 읽기 API: manager 인증 + 스코프 (tenant 없으면 Omni에서 빈 결과용 blocked) */
export async function requireInteriorTenantRead(
  request: NextRequest
): Promise<InteriorTenantGuardOk | InteriorTenantGuardFail> {
  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    return {
      ok: false,
      auth: null,
      scope: { enforce: false, tenantId: '' },
      errorResponse: authRes.errorResponse,
    }
  }
  const scope = await resolveSaasTenantScope({ auth: authRes.auth })
  return { ok: true, auth: authRes.auth, scope, errorResponse: null }
}

/** 인테리어 쓰기 API: manager 인증 + Omni tenant 스코프 fail-closed */
export async function requireInteriorTenantContext(
  request: NextRequest
): Promise<InteriorTenantGuardOk | InteriorTenantGuardFail> {
  const base = await requireInteriorTenantRead(request)
  if (!base.ok) return base
  const writeErr = assertSaasTenantWritable(base.scope, {
    tableHint: 'interior_projects',
    label: '인테리어',
  })
  if (writeErr) {
    return {
      ok: false,
      auth: null,
      scope: base.scope,
      errorResponse: NextResponse.json({ success: false, message: writeErr }, { status: 403 }),
    }
  }
  return base
}

/**
 * 프로젝트 소유(테넌트) 검증.
 * enforce=false(충만) 또는 tenant 컬럼 없으면 ok.
 */
export async function assertInteriorProjectAccess(
  projectId: number | string,
  scope: SaasTenantScope
): Promise<'ok' | 'not_found' | 'forbidden'> {
  const id = Math.floor(Number(projectId))
  if (!Number.isFinite(id) || id <= 0) return 'not_found'
  if (!scope.enforce) return 'ok'
  if (isSaasTenantQueryBlocked(scope, 'interior_projects')) return 'forbidden'

  try {
    const rows = (await supabaseSelectFilter(
      'interior_projects',
      `id=eq.${id}`,
      { limit: 1, select: 'id,tenant_id' }
    )) as { id?: number; tenant_id?: string | null }[]
    const row = rows?.[0]
    if (!row?.id) return 'not_found'
    const rowTid = normalizeTenantId(row.tenant_id)
    if (!rowTid) return 'ok'
    if (rowTid !== normalizeTenantId(scope.tenantId)) return 'forbidden'
    return 'ok'
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('interior_projects')
      return 'ok'
    }
    throw e
  }
}

export function stampInteriorTenantRow<T extends Record<string, unknown>>(
  row: T,
  scope: SaasTenantScope
): T {
  return stampSaasTenantId(row, scope, 'interior_projects')
}

export function interiorForbiddenResponse(headers?: HeadersInit): NextResponse {
  return NextResponse.json(
    { success: false, message: '해당 프로젝트에 접근할 수 없습니다.' },
    { status: 403, headers }
  )
}

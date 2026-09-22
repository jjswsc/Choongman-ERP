import { supabaseSelectFilter, supabaseUpsert, supabaseUpsertMerge } from '@/lib/supabase-server'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantColumnMissing,
  markSaasTenantColumnMissing,
  stampSaasTenantId,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

/** PostgREST: on_conflict 열이 유니크 제약과 안 맞을 때 (아직 법인 유니크 SQL 전) */
export function isNoUniqueConflictTargetError(err: unknown): boolean {
  const m = String(err instanceof Error ? err.message : err).toLowerCase()
  return (
    m.includes('42p10') ||
    m.includes('no unique or exclusion constraint') ||
    m.includes('on conflict specification')
  )
}

function withoutTenant(row: Record<string, unknown>): Record<string, unknown> {
  const { tenant_id: _t, ...rest } = row
  return rest
}

/**
 * Omni: (tenant_id, legacyConflict) 로 저장.
 * 법인 유니크가 아직 없으면 기존 키로 한 번 더 시도한다.
 */
export async function upsertMergeTenantStore(
  table: string,
  legacyConflict: string,
  row: Record<string, unknown>,
  scope: SaasTenantScope
): Promise<void> {
  if (!scope.enforce || !scope.tenantId || isSaasTenantColumnMissing(table)) {
    await supabaseUpsertMerge(table, legacyConflict, withoutTenant(row))
    return
  }
  const stamped = stampSaasTenantId(row, scope, table)
  try {
    await supabaseUpsertMerge(table, `tenant_id,${legacyConflict}`, stamped)
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing(table)
      await supabaseUpsertMerge(table, legacyConflict, withoutTenant(stamped))
      return
    }
    if (isNoUniqueConflictTargetError(e)) {
      await supabaseUpsertMerge(table, legacyConflict, stamped)
      return
    }
    throw e
  }
}

export async function upsertRowsTenantStore(
  table: string,
  legacyConflict: string,
  rows: Record<string, unknown>[],
  scope: SaasTenantScope
): Promise<void> {
  if (!scope.enforce || !scope.tenantId || isSaasTenantColumnMissing(table)) {
    await supabaseUpsert(table, rows.map(withoutTenant), legacyConflict)
    return
  }
  const stamped = rows.map((r) => stampSaasTenantId(r, scope, table))
  try {
    await supabaseUpsert(table, stamped, `tenant_id,${legacyConflict}`)
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing(table)
      await supabaseUpsert(table, stamped.map(withoutTenant), legacyConflict)
      return
    }
    if (isNoUniqueConflictTargetError(e)) {
      await supabaseUpsert(table, stamped, legacyConflict)
      return
    }
    throw e
  }
}

/** tenant_id 컬럼이 없으면 기존 필터로 한 번 더 조회한다. */
export async function selectFilterOptionalTenant(
  table: string,
  baseFilter: string,
  scope: SaasTenantScope,
  opts: { select?: string; limit?: number; order?: string }
): Promise<unknown> {
  const run = (filter: string) => supabaseSelectFilter(table, filter, opts)
  if (!scope.enforce || !scope.tenantId || isSaasTenantColumnMissing(table)) {
    return run(baseFilter)
  }
  try {
    return await run(appendSaasTenantFilter(baseFilter, scope, table))
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing(table)
      return run(baseFilter)
    }
    throw e
  }
}

export function storeRowFilter(
  column: string,
  value: string,
  scope: SaasTenantScope,
  table: string,
  op: 'eq' | 'ilike' = 'eq'
): string {
  const base = `${column}=${op}.${encodeURIComponent(value)}`
  return appendSaasTenantFilter(base, scope, table)
}

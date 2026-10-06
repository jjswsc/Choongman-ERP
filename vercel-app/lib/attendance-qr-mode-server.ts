import { supabaseSelectFilter } from '@/lib/supabase-server'
import { upsertRowsTenantStore } from '@/lib/saas-store-conflict'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'
import {
  parseAttendanceQrMode,
  readAttendanceQrPayload,
  verifyAttendanceQrPayload,
  type AttendanceQrMode,
} from '@/lib/attendance-qr-token'

const TABLE = 'attendance_qr_store_settings'

export function isMissingAttendanceQrSettingsTable(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err)
  if (!/attendance_qr_store_settings/i.test(msg)) return false
  return /42P01|PGRST205|Could not find the table|does not exist/i.test(msg)
}

async function selectMode(
  storeCode: string,
  scope: SaasTenantScope
): Promise<AttendanceQrMode> {
  const base = `store_code=eq.${encodeURIComponent(storeCode)}`
  const run = async (filter: string) => {
    const rows = (await supabaseSelectFilter(TABLE, filter, { limit: 1, select: 'mode' })) as
      | { mode?: string }[]
      | null
    return parseAttendanceQrMode(rows?.[0]?.mode)
  }
  const filter = appendSaasTenantFilter(base, scope, TABLE)
  try {
    return await run(filter)
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing(TABLE)
      return await run(base)
    }
    throw e
  }
}

/** 행이 없거나 테이블이 아직 없으면 변동(2시간). */
export async function fetchAttendanceQrStoreMode(
  storeCode: string,
  scope?: SaasTenantScope
): Promise<{ mode: AttendanceQrMode; schemaMissing: boolean }> {
  const store = String(storeCode || '').trim()
  if (!store) return { mode: 'rotating', schemaMissing: false }
  const tenantScope = scope ?? (await resolveSaasTenantScope({ storeCode: store }))
  try {
    const mode = await selectMode(store, tenantScope)
    return { mode, schemaMissing: false }
  } catch (e) {
    if (isMissingAttendanceQrSettingsTable(e)) {
      return { mode: 'rotating', schemaMissing: true }
    }
    throw e
  }
}

export async function saveAttendanceQrStoreMode(params: {
  storeCode: string
  mode: AttendanceQrMode
  scope: SaasTenantScope
}): Promise<void> {
  const store = String(params.storeCode || '').trim()
  if (!store) throw new Error('store_required')
  const mode = parseAttendanceQrMode(params.mode)
  if (params.mode !== 'fixed' && params.mode !== 'rotating') {
    throw new Error('invalid_mode')
  }
  await upsertRowsTenantStore(
    TABLE,
    'store_code',
    [
      {
        store_code: store,
        mode,
        updated_at: new Date().toISOString(),
      },
    ],
    params.scope
  )
}

/**
 * 스캔 토큰을 발급한 회사의 현재 모드로 검증.
 * expectedScope 가 있으면 그 회사와 QR 회사가 다를 때 거절하고, 모드도 그 회사 설정으로 본다.
 * (매장 코드만으로 회사를 고르면 코드가 같은 다른 회사 모드가 잡혀 고정 QR이 만료로 거절된다.)
 */
export async function verifySubmittedAttendanceQr(
  qrPayload: string,
  at: Date = new Date(),
  expectedScope?: SaasTenantScope | null
): Promise<{ ok: boolean; storeCode?: string; tenantId?: string; reason?: string }> {
  const read = readAttendanceQrPayload(qrPayload)
  if (!read.ok || !read.storeCode) {
    return { ok: false, reason: read.reason || 'invalid_format' }
  }
  const expectedTenantId = String(expectedScope?.tenantId || '').trim()
  const payloadTenantId = String(read.tenantId || '').trim()
  if (expectedTenantId && payloadTenantId && expectedTenantId !== payloadTenantId) {
    return { ok: false, storeCode: read.storeCode, tenantId: payloadTenantId, reason: 'tenant_mismatch' }
  }
  const modeTenantId = payloadTenantId || expectedTenantId
  const scope: SaasTenantScope = modeTenantId
    ? { enforce: true, tenantId: modeTenantId }
    : expectedScope && !expectedScope.enforce
      ? expectedScope
      : await resolveSaasTenantScope({ storeCode: read.storeCode })
  const { mode } = await fetchAttendanceQrStoreMode(read.storeCode, scope)
  return verifyAttendanceQrPayload(qrPayload, at, mode, {
    ...(expectedTenantId ? { expectedTenantId } : {}),
  })
}

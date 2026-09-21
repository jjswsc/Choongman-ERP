/**
 * Settings Head Office / 인보이스 FROM — vendors 본사 행.
 * Omni: tenant_id 로 회사마다 별도 HQ. 충만 레거시: 전역 1행.
 */
import {
  appendInventoryTenantFilter,
  assertInventoryTenantWritable,
  isInventoryTenantQueryBlocked,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  stampInventoryTenantId,
  type InventoryTenantScope,
} from '@/lib/inventory-tenant-scope'
import { resolveHeadOfficeFromVendorRow } from '@/lib/head-office-defaults'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

export const HQ_VENDOR_CODE = 'HQ'

export const HQ_TENANT_UNIQUE_MESSAGE =
  '본사 정보(code=HQ)가 테넌트별로 저장되지 않습니다. Omni DB에 sql/inventory_tenant_id.sql 을 실행해 주세요.'

export const HQ_VENDOR_SELECT = 'id,code,type,name,addr,tax_id,phone,memo'

export type HeadOfficeVendorRow = {
  id?: number
  code?: string
  type?: string
  name?: string
  addr?: string
  tax_id?: string
  phone?: string
  memo?: string
  tenant_id?: string | null
  ceo?: string
}

export type HeadOfficeSettingsInfo = {
  companyName: string
  taxId: string
  address: string
  phone: string
  bankInfo: string
}

export function emptyHeadOfficeSettings(): HeadOfficeSettingsInfo {
  return { companyName: '', taxId: '', address: '', phone: '', bankInfo: '' }
}

export function buildHeadOfficeLookupFilters(scope: InventoryTenantScope): string[] {
  return [
    `code=eq.${encodeURIComponent(HQ_VENDOR_CODE)}`,
    'type=eq.본사',
    'type=eq.Head Office',
  ].map((base) => appendInventoryTenantFilter(base, scope))
}

function rawSettingsFromRow(row: HeadOfficeVendorRow): HeadOfficeSettingsInfo {
  return {
    companyName: String(row.name || '').trim(),
    taxId: String(row.tax_id || '').trim(),
    address: String(row.addr || '').trim(),
    phone: String(row.phone || '').trim(),
    bankInfo: String(row.memo || '').trim(),
  }
}

/** Settings 폼: Omni는 빈 값 유지(충만 S&J 기본값 주입 금지). 충만은 기존 기본값. */
export function toSettingsHeadOfficeInfo(
  row: HeadOfficeVendorRow | null | undefined,
  scope: InventoryTenantScope
): HeadOfficeSettingsInfo {
  if (!scope.enforce) {
    const resolved = resolveHeadOfficeFromVendorRow(row)
    return {
      companyName: resolved.companyName,
      taxId: resolved.taxId,
      address: resolved.address,
      phone: resolved.phone,
      bankInfo: resolved.bankInfo,
    }
  }
  if (!row) return emptyHeadOfficeSettings()
  return rawSettingsFromRow(row)
}

/** 인보이스/e-Tax FROM 회사. Omni는 다른 회사·S&J 기본값을 넣지 않는다. */
export function toInvoiceHeadOfficeCompany(
  row: HeadOfficeVendorRow | null | undefined,
  scope: InventoryTenantScope
): { companyName: string; address: string; taxId: string; phone: string } {
  const info = toSettingsHeadOfficeInfo(row, scope)
  return {
    companyName: info.companyName,
    address: info.address,
    taxId: info.taxId,
    phone: info.phone,
  }
}

export function isHeadOfficeCodeUniqueError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  return /23505|duplicate key|vendors_code|ux_vendors_tenant_code/i.test(msg)
}

export async function fetchHeadOfficeVendorRow(
  scope: InventoryTenantScope
): Promise<HeadOfficeVendorRow | null> {
  if (isInventoryTenantQueryBlocked(scope)) return null
  try {
    for (const filter of buildHeadOfficeLookupFilters(scope)) {
      const rows = (await supabaseSelectFilter('vendors', filter, {
        limit: 1,
        select: HQ_VENDOR_SELECT,
      })) as HeadOfficeVendorRow[] | null
      if (rows?.[0]) return rows[0]
    }
    return null
  } catch (err) {
    if (isMissingInventoryTenantIdColumnError(err)) {
      markInventoryTenantIdColumnMissing()
      if (scope.enforce) return null
    }
    throw err
  }
}

export async function upsertHeadOfficeVendor(
  scope: InventoryTenantScope,
  data: HeadOfficeSettingsInfo
): Promise<{ created: boolean }> {
  const writeBlock = assertInventoryTenantWritable(scope)
  if (writeBlock) throw new Error(writeBlock)

  const companyName = String(data.companyName || '').trim() || '본사'
  const payload: Record<string, unknown> = {
    type: '본사',
    code: HQ_VENDOR_CODE,
    name: companyName,
    tax_id: String(data.taxId || '').trim(),
    addr: String(data.address || '').trim(),
    phone: String(data.phone || '').trim(),
    memo: String(data.bankInfo || '').trim(),
  }

  let existing: HeadOfficeVendorRow | null
  try {
    existing = await fetchHeadOfficeVendorRow(scope)
  } catch (err) {
    if (isMissingInventoryTenantIdColumnError(err)) {
      markInventoryTenantIdColumnMissing()
      throw new Error(
        'vendors tenant_id 스키마가 없습니다. sql/inventory_tenant_id.sql 을 실행해 주세요.'
      )
    }
    throw err
  }

  try {
    if (existing?.id != null) {
      await supabaseUpdate('vendors', existing.id, payload)
      return { created: false }
    }
    await supabaseInsert('vendors', stampInventoryTenantId(payload, scope))
    return { created: true }
  } catch (err) {
    if (isMissingInventoryTenantIdColumnError(err)) {
      markInventoryTenantIdColumnMissing()
      throw new Error(
        'vendors tenant_id 스키마가 없습니다. sql/inventory_tenant_id.sql 을 실행해 주세요.'
      )
    }
    if (isHeadOfficeCodeUniqueError(err)) {
      throw new Error(HQ_TENANT_UNIQUE_MESSAGE)
    }
    throw err
  }
}

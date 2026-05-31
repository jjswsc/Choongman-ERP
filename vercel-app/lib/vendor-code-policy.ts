import { canonicalizeStoreCodeForTaxProfile } from '@/lib/store-tax-filing-profile'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export function normalizeVendorCode(raw: unknown): string {
  return String(raw || '').trim().slice(0, 120)
}

export function normalizeMachineCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9:_-]/g, '')
    .slice(0, 120)
}

export async function lookupVendorNameByCode(vendorCode: string): Promise<string> {
  const code = normalizeVendorCode(vendorCode)
  if (!code) return ''
  try {
    const rows = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(code)}`, {
      select: 'name,gps_name',
      limit: 1,
    })) as { name?: string | null; gps_name?: string | null }[] | null
    const hit = rows?.[0]
    if (!hit) return ''
    return String(hit.name || hit.gps_name || '').trim()
  } catch {
    return ''
  }
}

/** 입력값(코드/이름/매장표시명)으로 vendors.code 해석 */
export async function resolveVendorCodeLoose(input: unknown): Promise<string> {
  const raw = String(input || '').trim()
  if (!raw) return ''
  const normalized = normalizeVendorCode(raw)
  if (normalized) {
    try {
      const byCode = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(normalized)}`, {
        select: 'code',
        limit: 1,
      })) as { code?: string | null }[] | null
      const hitCode = normalizeVendorCode(byCode?.[0]?.code)
      if (hitCode) return hitCode
    } catch {
      // fallback below
    }
  }

  try {
    const byName = (await supabaseSelectFilter(
      'vendors',
      `or=(name.eq.${encodeURIComponent(raw)},gps_name.eq.${encodeURIComponent(raw)},sales_outlet.eq.${encodeURIComponent(raw)})`,
      { select: 'code', limit: 1 }
    )) as { code?: string | null }[] | null
    return normalizeVendorCode(byName?.[0]?.code)
  } catch {
    return ''
  }
}

/**
 * 매장 키(store_code/표시명/레거시 입력) -> vendors.code
 * 1) store_tax_filing_profiles.vendor_code
 * 2) vendors.sales_outlet / gps_name / name (레거시 fallback)
 */
export async function resolveVendorCodeFromStore(storeKey: string): Promise<string> {
  const raw = String(storeKey || '').trim()
  if (!raw || raw === 'All' || raw === '*') return ''
  const storeCode = await canonicalizeStoreCodeForTaxProfile(raw)
  try {
    const profileRows = (await supabaseSelectFilter(
      'store_tax_filing_profiles',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      {
        select: 'vendor_code',
        limit: 1,
      }
    )) as { vendor_code?: string | null }[] | null
    const profileCode = normalizeVendorCode(profileRows?.[0]?.vendor_code)
    if (profileCode) return profileCode
  } catch {
    // fallback below
  }

  const probes = Array.from(new Set([storeCode, raw].filter(Boolean)))
  for (const probe of probes) {
    try {
      const rows = (await supabaseSelectFilter(
        'vendors',
        `or=(sales_outlet.eq.${encodeURIComponent(probe)},gps_name.eq.${encodeURIComponent(probe)},name.eq.${encodeURIComponent(probe)})`,
        { select: 'code', limit: 1 }
      )) as { code?: string | null }[] | null
      const code = normalizeVendorCode(rows?.[0]?.code)
      if (code) return code
    } catch {
      // next probe
    }
  }
  return ''
}

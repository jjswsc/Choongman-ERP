import { fetchErpStoresMaster, buildLegacyToCanonicalMap } from '@/lib/erp-store-master'
import { normStoreKey } from '@/lib/store-list-keys'
import { supabaseSelectFilter, supabaseUpsertMerge } from '@/lib/supabase-server'

export type StoreTaxFilingProfile = {
  storeCode: string
  taxpayerName: string
  taxId: string
  branchNo: string
  placeOfBusiness: string
  ssoAccountNo: string
  ssoBranchCode: string
  ssoOfficeAddress: string
  ssoPostcode: string
  ssoPhone: string
  ssoFax: string
  ssoEmail: string
  updatedAt?: string | null
  updatedBy?: string | null
}

export type StoreTaxFilingProfileRow = {
  store_code?: string
  taxpayer_name?: string | null
  tax_id?: string | null
  branch_no?: string | null
  place_of_business?: string | null
  sso_account_no?: string | null
  sso_branch_code?: string | null
  sso_office_address?: string | null
  sso_postcode?: string | null
  sso_phone?: string | null
  sso_fax?: string | null
  sso_email?: string | null
  updated_at?: string | null
  updated_by?: string | null
}

export function normalizeStoreTaxId(raw: unknown): string {
  return String(raw || '')
    .replace(/\D/g, '')
    .trim()
    .slice(0, 13)
}

export function normalizeBranchNo(raw: unknown): string {
  const d = String(raw || '')
    .replace(/\D/g, '')
    .trim()
  if (!d) return '00000'
  return d.slice(0, 5).padStart(5, '0')
}

export function isValidStoreTaxId(taxId: string): boolean {
  return normalizeStoreTaxId(taxId).length === 13
}

export function mapStoreTaxFilingProfileRow(row: StoreTaxFilingProfileRow): StoreTaxFilingProfile {
  return {
    storeCode: String(row.store_code || '').trim(),
    taxpayerName: String(row.taxpayer_name || '').trim(),
    taxId: normalizeStoreTaxId(row.tax_id),
    branchNo: normalizeBranchNo(row.branch_no),
    placeOfBusiness: String(row.place_of_business || '').trim(),
    ssoAccountNo: String(row.sso_account_no || '').trim(),
    ssoBranchCode: String(row.sso_branch_code || '').trim(),
    ssoOfficeAddress: String(row.sso_office_address || '').trim(),
    ssoPostcode: String(row.sso_postcode || '').trim(),
    ssoPhone: String(row.sso_phone || '').trim(),
    ssoFax: String(row.sso_fax || '').trim(),
    ssoEmail: String(row.sso_email || '').trim(),
    updatedAt: row.updated_at ?? null,
    updatedBy: row.updated_by ?? null,
  }
}

export function toPp30CompanyBlock(profile: StoreTaxFilingProfile, storeLabel?: string) {
  const branch = normalizeBranchNo(profile.branchNo)
  const st = String(storeLabel || profile.storeCode || '').trim()
  const branchOfficeLabel = st ? `${st} ${branch}`.trim() : branch ? `สำนักงานใหญ่ ${branch}` : ''
  return {
    companyName: profile.taxpayerName,
    companyTaxIdDigits: profile.taxId,
    placeOfBusiness: profile.placeOfBusiness,
    branchOfficeLabel,
  }
}

export function listMissingProfileFields(profile: StoreTaxFilingProfile): ('taxpayerName' | 'taxId')[] {
  const missing: ('taxpayerName' | 'taxId')[] = []
  if (!String(profile.taxpayerName || '').trim()) missing.push('taxpayerName')
  if (!isValidStoreTaxId(profile.taxId)) missing.push('taxId')
  return missing
}

export async function canonicalizeStoreCodeForTaxProfile(storeKey: string): Promise<string> {
  const raw = String(storeKey || '').trim()
  if (!raw || raw === 'All' || raw === '*') return ''
  try {
    const masters = await fetchErpStoresMaster()
    const map = buildLegacyToCanonicalMap(masters || [])
    return map[normStoreKey(raw)] || raw
  } catch {
    return raw
  }
}

export async function fetchStoreTaxFilingProfiles(): Promise<StoreTaxFilingProfile[]> {
  try {
    const rows = (await supabaseSelectFilter('store_tax_filing_profiles', '', {
      select:
        'store_code,taxpayer_name,tax_id,branch_no,place_of_business,sso_account_no,sso_branch_code,sso_office_address,sso_postcode,sso_phone,sso_fax,sso_email,updated_at,updated_by',
      order: 'store_code.asc',
      limit: 500,
    })) as StoreTaxFilingProfileRow[] | null
    return (rows || []).map(mapStoreTaxFilingProfileRow).filter((p) => p.storeCode)
  } catch {
    return []
  }
}

export async function fetchStoreTaxFilingProfileByCode(storeCode: string): Promise<StoreTaxFilingProfile | null> {
  const code = String(storeCode || '').trim()
  if (!code) return null
  try {
    const rows = (await supabaseSelectFilter(
      'store_tax_filing_profiles',
      `store_code=eq.${encodeURIComponent(code)}`,
      {
        select:
          'store_code,taxpayer_name,tax_id,branch_no,place_of_business,sso_account_no,sso_branch_code,sso_office_address,sso_postcode,sso_phone,sso_fax,sso_email,updated_at,updated_by',
        limit: 1,
      }
    )) as StoreTaxFilingProfileRow[] | null
    const row = rows?.[0]
    if (!row) return null
    return mapStoreTaxFilingProfileRow(row)
  } catch {
    return null
  }
}

export async function resolveStoreTaxFilingProfile(
  storeKey: string,
  fallback?: Partial<
    Pick<
      StoreTaxFilingProfile,
      | 'taxpayerName'
      | 'taxId'
      | 'branchNo'
      | 'placeOfBusiness'
      | 'ssoAccountNo'
      | 'ssoBranchCode'
      | 'ssoOfficeAddress'
      | 'ssoPostcode'
      | 'ssoPhone'
      | 'ssoFax'
      | 'ssoEmail'
    >
  >
): Promise<StoreTaxFilingProfile> {
  const storeCode = await canonicalizeStoreCodeForTaxProfile(storeKey)
  const fromDb = storeCode ? await fetchStoreTaxFilingProfileByCode(storeCode) : null
  const fb = fallback || {}
  return {
    storeCode: storeCode || String(storeKey || '').trim(),
    taxpayerName: String(fromDb?.taxpayerName || fb.taxpayerName || '').trim(),
    taxId: normalizeStoreTaxId(fromDb?.taxId || fb.taxId),
    branchNo: normalizeBranchNo(fromDb?.branchNo || fb.branchNo),
    placeOfBusiness: String(fromDb?.placeOfBusiness || fb.placeOfBusiness || '').trim(),
    ssoAccountNo: String(fromDb?.ssoAccountNo || fb.ssoAccountNo || '').trim(),
    ssoBranchCode: String(fromDb?.ssoBranchCode || fb.ssoBranchCode || '').trim(),
    ssoOfficeAddress: String(fromDb?.ssoOfficeAddress || fb.ssoOfficeAddress || '').trim(),
    ssoPostcode: String(fromDb?.ssoPostcode || fb.ssoPostcode || '').trim(),
    ssoPhone: String(fromDb?.ssoPhone || fb.ssoPhone || '').trim(),
    ssoFax: String(fromDb?.ssoFax || fb.ssoFax || '').trim(),
    ssoEmail: String(fromDb?.ssoEmail || fb.ssoEmail || '').trim(),
    updatedAt: fromDb?.updatedAt ?? null,
    updatedBy: fromDb?.updatedBy ?? null,
  }
}

export async function upsertStoreTaxFilingProfile(input: {
  storeCode: string
  taxpayerName: string
  taxId: string
  branchNo: string
  placeOfBusiness?: string
  ssoAccountNo?: string
  ssoBranchCode?: string
  ssoOfficeAddress?: string
  ssoPostcode?: string
  ssoPhone?: string
  ssoFax?: string
  ssoEmail?: string
  updatedBy?: string
}): Promise<StoreTaxFilingProfile> {
  const storeCode = await canonicalizeStoreCodeForTaxProfile(input.storeCode)
  if (!storeCode) throw new Error('INVALID_STORE_CODE')

  const row = {
    store_code: storeCode,
    taxpayer_name: String(input.taxpayerName || '').trim().slice(0, 500),
    tax_id: normalizeStoreTaxId(input.taxId),
    branch_no: normalizeBranchNo(input.branchNo),
    place_of_business: String(input.placeOfBusiness || '').trim().slice(0, 1000) || null,
    sso_account_no: String(input.ssoAccountNo || '').trim().slice(0, 60),
    sso_branch_code: String(input.ssoBranchCode || '').trim().slice(0, 30),
    sso_office_address: String(input.ssoOfficeAddress || '').trim().slice(0, 1000) || null,
    sso_postcode: String(input.ssoPostcode || '').replace(/\D/g, '').slice(0, 10),
    sso_phone: String(input.ssoPhone || '').trim().slice(0, 80),
    sso_fax: String(input.ssoFax || '').trim().slice(0, 80),
    sso_email: String(input.ssoEmail || '').trim().slice(0, 200),
    updated_by: String(input.updatedBy || '').trim().slice(0, 200) || null,
    updated_at: new Date().toISOString(),
  }

  await supabaseUpsertMerge('store_tax_filing_profiles', 'store_code', row)
  return mapStoreTaxFilingProfileRow(row)
}

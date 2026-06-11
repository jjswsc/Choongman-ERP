import { supabaseSelect } from '@/lib/supabase-server'

type VendorRow = {
  code?: string
  name?: string
  gps_name?: string
  sales_outlet?: string
}

const SYSTEM_VENDOR_LABELS = new Set(['From HQ', 'HQ'])

export async function createVendorNameResolver(): Promise<(raw: string) => string> {
  const rows = (await supabaseSelect('vendors', {
    select: 'code,name,gps_name',
    order: 'id.asc',
    limit: 10000,
  })) as VendorRow[] | null

  const codeToName = new Map<string, string>()
  const nameCanonical = new Map<string, string>()

  for (const row of rows || []) {
    const code = String(row.code || '').trim()
    const name = String(row.name || row.gps_name || '').trim()
    if (!name) continue
    if (code) codeToName.set(code.toLowerCase(), name)
    nameCanonical.set(name.toLowerCase(), name)
  }

  return (raw: string) => {
    const value = String(raw || '').trim()
    if (!value) return ''
    if (SYSTEM_VENDOR_LABELS.has(value)) return value

    const byCode = codeToName.get(value.toLowerCase())
    if (byCode) return byCode

    const byName = nameCanonical.get(value.toLowerCase())
    if (byName) return byName

    return value
  }
}

/** 입고 등 vendorFilter — UI는 거래처명, 일부 API는 코드를 넘김. 둘 다 허용 */
export function buildVendorFilterAliasesFromRows(
  vendorFilter: string,
  rows: VendorRow[],
  resolveVendorName: (raw: string) => string
): Set<string> {
  const filter = String(vendorFilter || '').trim()
  if (!filter || filter.toLowerCase() === 'all') return new Set()

  const filterLower = filter.toLowerCase()
  const matched = rows.filter((row) => {
    const code = String(row.code || '').trim().toLowerCase()
    const name = String(row.name || '').trim().toLowerCase()
    const gps = String(row.gps_name || '').trim().toLowerCase()
    const sales = String(row.sales_outlet || '').trim().toLowerCase()
    return filterLower === code || filterLower === name || filterLower === gps || filterLower === sales
  })

  const aliases = new Set<string>()
  if (matched.length > 0) {
    for (const v of matched) {
      for (const raw of [v.name, v.gps_name, v.sales_outlet, v.code]) {
        const alias = resolveVendorName(String(raw || '').trim())
        if (alias) aliases.add(alias)
      }
    }
    return aliases
  }

  const canonical = resolveVendorName(filter)
  if (canonical) aliases.add(canonical)
  aliases.add(filter)
  return aliases
}

export async function resolveVendorFilterAliases(
  vendorFilter: string,
  resolveVendorName: (raw: string) => string
): Promise<Set<string>> {
  const rows = (await supabaseSelect('vendors', {
    select: 'code,name,gps_name,sales_outlet',
    order: 'id.asc',
    limit: 10000,
  })) as VendorRow[] | null
  return buildVendorFilterAliasesFromRows(vendorFilter, rows || [], resolveVendorName)
}

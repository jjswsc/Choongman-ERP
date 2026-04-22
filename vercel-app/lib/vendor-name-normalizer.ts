import { supabaseSelect } from '@/lib/supabase-server'

type VendorRow = {
  code?: string
  name?: string
  gps_name?: string
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

import { supabaseSelect } from '@/lib/supabase-server'
import {
  enrichLedgerRowsWithPayeeAddress,
  type RdPrepPayeeAddressRow,
  type RdPrepPayeeMaster,
} from '@/lib/rd-prep-payee-address'

function asMasterList(
  rows: { code?: string | null; name?: string | null; tax_id?: string | null; addr?: string | null; address?: string | null }[] | null
): RdPrepPayeeMaster[] {
  return (rows || [])
    .map((row) => ({
      code: String(row.code || '').trim() || null,
      name: String(row.name || '').trim() || null,
      taxId: String(row.tax_id || '').trim() || null,
      address: String(row.addr || row.address || '').trim() || null,
    }))
    .filter((row) => row.name || row.taxId || row.code)
}

async function loadVendorPayeeMasters(): Promise<RdPrepPayeeMaster[]> {
  try {
    const rows = (await supabaseSelect('vendors', {
      select: 'code,name,tax_id,addr',
      order: 'id.asc',
      limit: 20000,
    })) as { code?: string | null; name?: string | null; tax_id?: string | null; addr?: string | null }[] | null
    return asMasterList(rows)
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (msg.includes('addr') || msg.includes('tax_id') || msg.includes('column')) {
      return []
    }
    throw e
  }
}

async function loadEmployeePayeeMasters(): Promise<RdPrepPayeeMaster[]> {
  try {
    const rows = (await supabaseSelect('employees', {
      select: 'name,name_title,tax_id,id_number,address',
      order: 'id.asc',
      limit: 20000,
    })) as {
      name?: string | null
      name_title?: string | null
      tax_id?: string | null
      id_number?: string | null
      address?: string | null
    }[] | null
    return (rows || [])
      .map((row) => {
        const name = [String(row.name_title || '').trim(), String(row.name || '').trim()]
          .filter(Boolean)
          .join(' ')
        const tin = String(row.tax_id || '').trim() || String(row.id_number || '').trim()
        return {
          name: name || null,
          taxId: tin || null,
          address: String(row.address || '').trim() || null,
        }
      })
      .filter((row) => row.name || row.taxId)
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (msg.includes('address') || msg.includes('name_title') || msg.includes('id_number')) {
      return []
    }
    throw e
  }
}

/** ภ.ง.ด.1/3/53 RD Prep TXT — 원장 주소가 비면 거래처·직원 마스터로 채움 */
export async function enrichRdPrepLedgerPayeeAddresses<T extends RdPrepPayeeAddressRow>(
  rows: T[]
): Promise<T[]> {
  if (!rows.length) return rows
  const [vendors, employees] = await Promise.all([loadVendorPayeeMasters(), loadEmployeePayeeMasters()])
  return enrichLedgerRowsWithPayeeAddress(rows, { vendors, employees })
}

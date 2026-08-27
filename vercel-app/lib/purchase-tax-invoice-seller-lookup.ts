/** 매입 세금계산서 — TIN으로 상호·지점 채움 (거래처·검수 기억·กรมสรรพากร). */

import {
  digitsTin13,
  formatSellerBranch,
  thaiTinChecksumOk,
  type ExtractedPurchaseTaxInvoiceFields,
} from '@/lib/purchase-tax-invoice-core'

export type PurchaseTaxSellerProfile = {
  sellerTaxId: string
  sellerName: string
  sellerBranch?: string
}

const LEARN_KEY = 'cm_pti_seller_tin_memory'
const LEARN_MAX = 300

export function profilesFromVendors(
  vendors: Array<{ tax_no?: string | null; name?: string | null }>
): PurchaseTaxSellerProfile[] {
  const out: PurchaseTaxSellerProfile[] = []
  const seen = new Set<string>()
  for (const v of vendors) {
    const tin = digitsTin13(v.tax_no)
    const name = String(v.name || '').trim()
    if (tin.length !== 13 || !thaiTinChecksumOk(tin) || !name || seen.has(tin)) continue
    seen.add(tin)
    out.push({ sellerTaxId: tin, sellerName: name.slice(0, 200) })
  }
  return out
}

export function profileFromRdCompany(c: {
  taxId?: string
  name?: string
  branchNo?: string
  branchTitle?: string
}): PurchaseTaxSellerProfile | null {
  const tin = digitsTin13(c.taxId)
  const name = String(c.name || '').trim()
  if (tin.length !== 13 || !thaiTinChecksumOk(tin) || !name) return null
  return {
    sellerTaxId: tin,
    sellerName: name.slice(0, 200),
    sellerBranch: formatSellerBranch(String(c.branchTitle || c.branchNo || '')),
  }
}

export function pickRdCompanyForSeller(
  list: Array<{ taxId?: string; name?: string; branchNo?: string; branchTitle?: string }>,
  tin: string
): { taxId?: string; name?: string; branchNo?: string; branchTitle?: string } | null {
  const want = digitsTin13(tin)
  const matches = list.filter((c) => digitsTin13(c.taxId) === want)
  if (!matches.length) return null
  const hq = matches.find((c) => {
    const n = String(c.branchNo || '').replace(/\D/g, '')
    const title = String(c.branchTitle || '')
    return n === '' || n === '0' || /^0+$/.test(n) || /สำนักงานใหญ่|head\s*office/i.test(title)
  })
  return hq || matches[0]
}

export function parseRdSellerList(payload: unknown, tin: string): PurchaseTaxSellerProfile | null {
  const obj = payload && typeof payload === 'object' ? (payload as { list?: unknown }) : null
  const list = Array.isArray(obj?.list) ? obj.list : Array.isArray(payload) ? payload : []
  const rows = list.filter((row): row is Record<string, string> => !!row && typeof row === 'object')
  const picked = pickRdCompanyForSeller(rows, tin)
  return picked ? profileFromRdCompany(picked) : null
}

export function readLearnedSellerProfiles(): PurchaseTaxSellerProfile[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(LEARN_KEY) || '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row): PurchaseTaxSellerProfile | null => {
        if (!row || typeof row !== 'object') return null
        const r = row as PurchaseTaxSellerProfile
        const tin = digitsTin13(r.sellerTaxId)
        const name = String(r.sellerName || '').trim()
        if (tin.length !== 13 || !thaiTinChecksumOk(tin) || !name) return null
        const branch = r.sellerBranch ? formatSellerBranch(r.sellerBranch) : ''
        return {
          sellerTaxId: tin,
          sellerName: name.slice(0, 200),
          ...(branch ? { sellerBranch: branch } : {}),
        }
      })
      .filter((row): row is PurchaseTaxSellerProfile => !!row)
  } catch {
    return []
  }
}

export function rememberSellerProfiles(
  rows: Array<{ sellerTaxId?: string; sellerName?: string; sellerBranch?: string }>
): void {
  if (typeof window === 'undefined') return
  const map = new Map<string, PurchaseTaxSellerProfile>()
  for (const row of readLearnedSellerProfiles()) map.set(row.sellerTaxId, row)
  for (const row of rows) {
    const tin = digitsTin13(row.sellerTaxId)
    const name = String(row.sellerName || '').trim()
    if (tin.length !== 13 || !thaiTinChecksumOk(tin) || !name) continue
    map.set(tin, {
      sellerTaxId: tin,
      sellerName: name.slice(0, 200),
      sellerBranch: row.sellerBranch ? formatSellerBranch(row.sellerBranch) : map.get(tin)?.sellerBranch,
    })
  }
  const next = [...map.values()].slice(-LEARN_MAX)
  try {
    localStorage.setItem(LEARN_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
}

/** 학습·거래처·등록함 순. 이미 있는 이름은 유지하고 빈 칸만 채움. */
export function fillSellerFromProfiles(
  row: ExtractedPurchaseTaxInvoiceFields,
  known: Array<{ sellerTaxId?: string; sellerName?: string; sellerBranch?: string }>
): ExtractedPurchaseTaxInvoiceFields {
  const tin = digitsTin13(row.sellerTaxId)
  if (tin.length !== 13) return row
  const hit = known.find((k) => digitsTin13(k.sellerTaxId) === tin && String(k.sellerName || '').trim())
  if (!hit) return row
  return {
    ...row,
    sellerName: String(row.sellerName || '').trim() || String(hit.sellerName).trim().slice(0, 200),
    sellerBranch: row.sellerBranch || (hit.sellerBranch ? formatSellerBranch(hit.sellerBranch) : undefined),
  }
}

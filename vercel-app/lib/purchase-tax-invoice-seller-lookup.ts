/** 매입 세금계산서 — TIN으로 상호·지점 채움 (거래처·검수 기억·กรมสรรพากร). */

import {
  digitsTin13,
  formatSellerBranch,
  looksLikeJunkSellerName,
  thaiTinChecksumOk,
  type ExtractedPurchaseTaxInvoiceFields,
} from '@/lib/purchase-tax-invoice-core'

export type PurchaseTaxSellerProfile = {
  sellerTaxId: string
  sellerName: string
  sellerBranch?: string
  /** 검수에서 확정한 최근 번호. 다음 스캔의 거래처 꼴 힌트 */
  invoiceNos?: string[]
  /** 검수에서 확정한 최근 공급가. 터무니없이 작은 OCR 조각을 걸러 냄 */
  nets?: number[]
}

const LEARN_KEY = 'cm_pti_seller_tin_memory'
const LEARN_MAX = 300
const SAMPLE_KEEP = 12

function mergeInvoiceNos(prev: string[] | undefined, next?: string): string[] | undefined {
  const cur = [...(prev || [])]
  const n = String(next || '').trim()
  if (n) {
    const kept = [...cur.filter((x) => x !== n), n].slice(-SAMPLE_KEEP)
    return kept.length ? kept : undefined
  }
  return cur.length ? cur.slice(-SAMPLE_KEEP) : undefined
}

function mergeNets(prev: number[] | undefined, next?: number): number[] | undefined {
  const cur = [...(prev || [])]
  if (typeof next === 'number' && Number.isFinite(next) && next > 0) {
    cur.push(Math.round(next * 100) / 100)
  }
  const kept = cur.slice(-SAMPLE_KEEP)
  return kept.length ? kept : undefined
}

function parseInvoiceNos(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const nos = raw.map((x) => String(x || '').trim()).filter(Boolean).slice(-SAMPLE_KEEP)
  return nos.length ? nos : undefined
}

function parseNets(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const nets = raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0).slice(-SAMPLE_KEEP)
  return nets.length ? nets : undefined
}

/** 학습된 번호만 모아 거래처 꼴 표에 넣는다 */
export function learnedInvoiceHistory(
  profiles: Array<{ sellerTaxId?: string; invoiceNos?: string[] }>
): Array<{ sellerTaxId: string; invoiceNo: string }> {
  const out: Array<{ sellerTaxId: string; invoiceNo: string }> = []
  for (const p of profiles) {
    const tin = digitsTin13(p.sellerTaxId)
    if (tin.length !== 13) continue
    for (const no of p.invoiceNos || []) {
      const n = String(no || '').trim()
      if (n) out.push({ sellerTaxId: tin, invoiceNo: n })
    }
  }
  return out
}

export function netsByTin(
  profiles: Array<{ sellerTaxId?: string; nets?: number[] }>
): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const p of profiles) {
    const tin = digitsTin13(p.sellerTaxId)
    const nets = (p.nets || []).filter((n) => Number.isFinite(n) && n > 0)
    if (tin.length === 13 && nets.length) out[tin] = nets
  }
  return out
}

/**
 * 같은 TIN에서 공급가가 늘 수백~수천인데 이번만 수십 원대이면 OCR 조각으로 본다.
 * 표본이 3건 미만이면 막지 않는다(첫 거래처·소액 실거래를 오인하지 않기 위함).
 */
export function netLooksImplausiblySmallForTin(net: number, typicalNets: number[]): boolean {
  if (!(net > 0)) return false
  const xs = typicalNets.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (xs.length < 3) return false
  const mid = xs[Math.floor(xs.length / 2)]
  return mid >= 400 && net < 80 && net * 8 < mid
}

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
        const invoiceNos = parseInvoiceNos((r as { invoiceNos?: unknown }).invoiceNos)
        const nets = parseNets((r as { nets?: unknown }).nets)
        return {
          sellerTaxId: tin,
          sellerName: name.slice(0, 200),
          ...(branch ? { sellerBranch: branch } : {}),
          ...(invoiceNos ? { invoiceNos } : {}),
          ...(nets ? { nets } : {}),
        }
      })
      .filter((row): row is PurchaseTaxSellerProfile => !!row)
  } catch {
    return []
  }
}

export function rememberSellerProfiles(
  rows: Array<{
    sellerTaxId?: string
    sellerName?: string
    sellerBranch?: string
    invoiceNo?: string
    netAmount?: number
  }>
): void {
  if (typeof window === 'undefined') return
  const map = new Map<string, PurchaseTaxSellerProfile>()
  for (const row of readLearnedSellerProfiles()) map.set(row.sellerTaxId, row)
  for (const row of rows) {
    const tin = digitsTin13(row.sellerTaxId)
    const name = String(row.sellerName || '').trim()
    if (tin.length !== 13 || !thaiTinChecksumOk(tin) || !name) continue
    const prev = map.get(tin)
    const invoiceNos = mergeInvoiceNos(prev?.invoiceNos, row.invoiceNo)
    const nets = mergeNets(prev?.nets, row.netAmount)
    map.set(tin, {
      sellerTaxId: tin,
      sellerName: name.slice(0, 200),
      sellerBranch: row.sellerBranch ? formatSellerBranch(row.sellerBranch) : prev?.sellerBranch,
      ...(invoiceNos ? { invoiceNos } : {}),
      ...(nets ? { nets } : {}),
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
  const currentName = String(row.sellerName || '').trim()
  const useProfileName = !currentName || looksLikeJunkSellerName(currentName)
  return {
    ...row,
    sellerName: useProfileName ? String(hit.sellerName).trim().slice(0, 200) : currentName,
    sellerBranch: row.sellerBranch || (hit.sellerBranch ? formatSellerBranch(hit.sellerBranch) : undefined),
  }
}

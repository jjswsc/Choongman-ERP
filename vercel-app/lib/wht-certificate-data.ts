/** 원천징수 증명서(หนังสือรับรอง) 인쇄용 당사자·금액 */

import {
  concatExpenseWhtIncomeTypes,
  expenseWhtItemsFromTotals,
  primaryExpenseWhtRate,
  sumExpenseWhtBase,
  sumExpenseWhtTax,
  type ExpenseWhtItem,
} from '@/lib/expense-wht-items'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStore } from '@/lib/permissions'
import {
  purchaseOrderMetaOrderDate,
  resolveAccountingPoIssuerStore,
} from '@/lib/purchase-order-cart'
import { cleanTaxEntityDisplayName } from '@/lib/tax-entity-scope-label'
import { resolveWhtPndFormHint } from '@/lib/wht-pnd-form-hint'

export type WhtCertificateParty = {
  name: string
  taxId: string
  address?: string
}

export type WhtCertificateIncomeLine = {
  incomeType: string
  paymentDate: string
  grossAmount: number
  whtAmount: number
  whtRate?: number | null
}

export type WhtCertificateData = {
  certificateNo: string
  formHint: string
  paymentDate: string
  taxMonth: string
  incomeType: string
  grossAmount: number
  whtRate: number | null
  whtAmount: number
  direction: 'inbound' | 'outbound'
  withholdingAgent: WhtCertificateParty
  incomeRecipient: WhtCertificateParty
  memo?: string
  storeName?: string
  /** 50 ทวิ 표에 여러 행 (ค่าเช่า 5% + ค่าบริการ 3% 등) */
  incomeLines?: WhtCertificateIncomeLine[]
}

export type HeadOfficeCompany = {
  companyName: string
  taxId: string
  address: string
  phone?: string
}

/** 매장 세무 프로필(클라이언트 DTO·서버 profile 공통 최소 필드) */
export type WhtStoreAgentProfile = {
  taxpayerName?: string | null
  taxId?: string | null
  branchNo?: string | null
  placeOfBusiness?: string | null
  phone?: string | null
  ssoPhone?: string | null
}

function normalizeWhtTaxId(raw: unknown): string {
  return String(raw || '')
    .replace(/\D/g, '')
    .trim()
    .slice(0, 13)
}

function isHqScopeStoreForWht(storeName: string): boolean {
  const s = String(storeName || '').trim()
  if (!s || s === 'All' || s === '*') return true
  return isOfficeStore(s) || isHeadOfficeLikeStoreName(s)
}

/**
 * 50 ทวิ ผู้มีหน้าที่หัก — 지출/원장 매장 기준 표시명.
 * 본사·Office면 본사명 유지. 그 외는 법인명 + (สาขา {매장}).
 */
export function formatWhtAgentDisplayName(params: {
  taxpayerName?: string | null
  headOfficeName: string
  storeLabel: string
}): string {
  const store = String(params.storeLabel || '').trim()
  const fromProfile = String(params.taxpayerName || '').trim()
  if (fromProfile && /(\(สาขา|\(branch\b|\(สำนักงาน)/i.test(fromProfile)) {
    return fromProfile
  }
  const base =
    cleanTaxEntityDisplayName(fromProfile || params.headOfficeName) ||
    fromProfile ||
    String(params.headOfficeName || '').trim() ||
    '—'
  if (!store || isHqScopeStoreForWht(store)) {
    return fromProfile || String(params.headOfficeName || '').trim() || base
  }
  return `${base} (สาขา ${store})`
}

/**
 * 지출 등록 매장·세무 프로필로 원천징수자(상단) 회사 블록 결정.
 * Tax ID는 프로필 13자리 우선, 없으면 본사. 주소는 place_of_business 우선.
 * payeeTaxId가 넘어오고 프로필 TIN과 같으면(가맹점=거래처 오인) 본사로 둔다.
 * hqEntityBranchesOnly면 프로필 TIN이 본사와 다를 때(가맹 법인) 본사만 사용.
 */
export function resolveWhtWithholdingAgentCompany(params: {
  headOffice: HeadOfficeCompany
  storeName?: string | null
  profile?: WhtStoreAgentProfile | null
  /** 소득자(하단) TIN — 상단 프로필과 동일하면 본사 폴백 */
  payeeTaxId?: string | null
  /** 발주 원장 등: 직영(본사와 동일 TIN) 지점만 매장 표기 */
  hqEntityBranchesOnly?: boolean
}): HeadOfficeCompany {
  const ho = params.headOffice
  const store = String(params.storeName || '').trim()
  if (!store || isHqScopeStoreForWht(store)) {
    return { ...ho }
  }

  const profile = params.profile
  const profileTin = normalizeWhtTaxId(profile?.taxId)
  const hoTin = normalizeWhtTaxId(ho.taxId)
  if (
    params.hqEntityBranchesOnly &&
    profileTin.length === 13 &&
    hoTin.length === 13 &&
    profileTin !== hoTin
  ) {
    return { ...ho }
  }

  const taxId = profileTin.length === 13 ? profileTin : hoTin || String(ho.taxId || '')
  const place = String(profile?.placeOfBusiness || '').trim()
  const address = place || String(ho.address || '')
  const phone =
    String(profile?.phone || profile?.ssoPhone || '').trim() || (ho.phone ? String(ho.phone) : undefined)

  const agent: HeadOfficeCompany = {
    companyName: formatWhtAgentDisplayName({
      taxpayerName: profile?.taxpayerName,
      headOfficeName: ho.companyName,
      storeLabel: store,
    }),
    taxId,
    address,
    phone,
  }

  const payeeTin = normalizeWhtTaxId(params.payeeTaxId)
  if (payeeTin.length === 13 && normalizeWhtTaxId(agent.taxId) === payeeTin) {
    return { ...ho }
  }
  return agent
}

/**
 * 발주 50 ทวิ 상단(원천징수자) 매장 키.
 * 발행 주체(issuerStore)만 사용 — relatedStore(청구·귀속 매장)는 거래처 쪽이라 쓰면 안 됨.
 * 비어 있으면 본사(S&J).
 */
export function resolvePoWhtAgentStoreKey(po: { cart_json?: unknown }): string {
  return resolveAccountingPoIssuerStore(po) || ''
}

export function resolveWhtCertificateParties(params: {
  direction: 'inbound' | 'outbound'
  payeeName: string
  payeeTaxId: string
  payeeAddress?: string
  headOffice: HeadOfficeCompany
}): { withholdingAgent: WhtCertificateParty; incomeRecipient: WhtCertificateParty } {
  const hqParty: WhtCertificateParty = {
    name: params.headOffice.companyName || '—',
    taxId: params.headOffice.taxId || '—',
    address: params.headOffice.address || undefined,
  }
  const counterparty: WhtCertificateParty = {
    name: String(params.payeeName || '').trim() || '—',
    taxId: String(params.payeeTaxId || '').trim() || '—',
    address: String(params.payeeAddress || '').trim() || undefined,
  }
  if (params.direction === 'inbound') {
    return { withholdingAgent: counterparty, incomeRecipient: hqParty }
  }
  return { withholdingAgent: hqParty, incomeRecipient: counterparty }
}

export function whtCertificateFromPurchaseOrder(
  po: {
    po_no?: string | null
    vendor_name?: string | null
    vendor_code?: string | null
    total?: number | null
    vat?: number | null
    withholding_tax_amount?: number | null
    withholding_tax_rate?: number | null
    cart_json?: unknown
    created_at?: string | null
  },
  headOffice: HeadOfficeCompany,
  vendorTaxId?: string,
  vendorAddress?: string
): WhtCertificateData | null {
  const wht = Math.max(0, Number(po.withholding_tax_amount) || 0)
  if (wht <= 0) return null
  const total = Math.max(0, Number(po.total) || 0)
  const vat = Math.max(0, Number(po.vat) || 0)
  const gross = Math.round((total - vat) * 100) / 100
  const rateRaw = Number(po.withholding_tax_rate)
  const metaDate = purchaseOrderMetaOrderDate(po.cart_json)
  const docDate =
    metaDate && /^\d{4}-\d{2}-\d{2}$/.test(metaDate)
      ? metaDate
      : po.created_at && !isNaN(Date.parse(String(po.created_at)))
        ? new Date(po.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
        : ''
  if (!docDate) return null
  return whtCertificateFromLedgerRow(
    {
      payment_date: docDate,
      tax_month: docDate.slice(0, 7),
      payee_name: String(po.vendor_name || po.vendor_code || ''),
      payee_tax_id: vendorTaxId || '',
      payee_address: vendorAddress || '',
      income_type: '로열티·용역 수입',
      gross_amount: gross > 0 ? gross : total,
      wht_rate: rateRaw,
      wht_amount: wht,
      certificate_no: po.po_no ? `PO-${po.po_no}` : undefined,
      // 발주 WHT 증명서는 당사(본사)가 원천징수·발급 → S&J 상단(ผู้มีหน้าที่หักภาษี)
      direction: 'outbound',
    },
    headOffice
  )
}

function incomeLinesFromWhtItems(
  items: ExpenseWhtItem[],
  paymentDate: string
): WhtCertificateIncomeLine[] | undefined {
  if (items.length <= 1) return undefined
  return items.map((it) => ({
    incomeType: it.incomeType,
    paymentDate,
    grossAmount: it.baseAmount,
    whtAmount: it.taxAmount,
    whtRate: it.rate > 0 ? it.rate : null,
  }))
}

/** 같은 증명서번호(또는 같은 지급일·거래처)의 원장 행을 50 ทวิ 한 장으로 합침 */
export function mergeWhtCertificatesForPrint(items: WhtCertificateData[]): WhtCertificateData[] {
  const list = (items || []).filter((d) => d && Number(d.whtAmount) > 0)
  if (list.length <= 1) return list
  const groups = new Map<string, WhtCertificateData[]>()
  const order: string[] = []
  for (const d of list) {
    const cert = String(d.certificateNo || '').trim()
    const key =
      cert && cert !== '—'
        ? `cert:${cert}`
        : `payee:${String(d.incomeRecipient?.name || '').trim()}|${String(d.paymentDate || '').slice(0, 10)}|${String(d.storeName || '')}`
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(d)
  }
  return order.map((key) => {
    const g = groups.get(key) || []
    if (g.length === 1) return g[0]
    const first = g[0]
    const lines: WhtCertificateIncomeLine[] = g.flatMap((row) =>
      row.incomeLines && row.incomeLines.length > 0
        ? row.incomeLines
        : [
            {
              incomeType: row.incomeType,
              paymentDate: row.paymentDate,
              grossAmount: row.grossAmount,
              whtAmount: row.whtAmount,
              whtRate: row.whtRate,
            },
          ]
    )
    const itemsAsWht: ExpenseWhtItem[] = lines.map((ln) => ({
      incomeType: ln.incomeType,
      rate: Number(ln.whtRate) || 0,
      baseAmount: ln.grossAmount,
      taxAmount: ln.whtAmount,
    }))
    return {
      ...first,
      incomeType: concatExpenseWhtIncomeTypes(itemsAsWht) || first.incomeType,
      grossAmount: sumExpenseWhtBase(itemsAsWht),
      whtAmount: sumExpenseWhtTax(itemsAsWht),
      whtRate: primaryExpenseWhtRate(itemsAsWht),
      incomeLines: lines,
    }
  })
}

/** 지출 등록 직후 50 ทวิ형 증명서 — outbound(당사 원천징수) */
export function whtCertificateFromExpenseRegister(
  params: {
    certificateNo: string
    paymentDate: string
    payeeName: string
    payeeTaxId?: string
    payeeAddress?: string
    grossInclVat: number
    vatAmount: number
    whtRate: number | null
    whtAmount: number
    memo?: string
    storeName?: string
    incomeType?: string
    whtItems?: ExpenseWhtItem[] | unknown
  },
  headOffice: HeadOfficeCompany
): WhtCertificateData | null {
  const paymentDate = String(params.paymentDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return null
  const grossIncl = Math.max(0, Number(params.grossInclVat) || 0)
  const vat = Math.max(0, Number(params.vatAmount) || 0)
  const grossExVat = Math.round(Math.max(0, grossIncl - vat) * 100) / 100
  const items = expenseWhtItemsFromTotals({
    items: params.whtItems,
    taxAmount: params.whtAmount,
    baseAmount: grossExVat > 0 ? grossExVat : grossIncl,
    rate: params.whtRate,
    incomeType: params.incomeType,
  })
  const wht = sumExpenseWhtTax(items)
  if (wht <= 0) return null
  const baseSum = sumExpenseWhtBase(items)
  const cert = whtCertificateFromLedgerRow(
    {
      payment_date: paymentDate,
      tax_month: paymentDate.slice(0, 7),
      payee_name: String(params.payeeName || '').trim(),
      payee_tax_id: String(params.payeeTaxId || '').trim(),
      payee_address: String(params.payeeAddress || '').trim(),
      income_type: concatExpenseWhtIncomeTypes(items) || String(params.incomeType || '').trim() || 'ค่าบริการ',
      gross_amount: baseSum > 0 ? baseSum : grossExVat > 0 ? grossExVat : grossIncl,
      wht_rate: primaryExpenseWhtRate(items) ?? params.whtRate,
      wht_amount: wht,
      certificate_no: String(params.certificateNo || '').trim() || undefined,
      memo: params.memo,
      store_name: params.storeName,
      direction: 'outbound',
    },
    headOffice
  )
  const lines = incomeLinesFromWhtItems(items, paymentDate)
  return lines ? { ...cert, incomeLines: lines } : cert
}

/** 거래처 마스터로 50 ทวิ 수취인 TIN·주소 보강 (장부/인쇄 공통) */
function normalizeVendorNameKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/บริษัท\s*/g, '')
    .replace(/\s*จำกัด\s*$/g, '')
    .replace(/\s*co\.?\s*,?\s*ltd\.?\s*$/g, '')
    .trim()
}

export function resolveVendorPayeeForWht(
  vendors: { code?: string; name?: string; taxId?: string; address?: string }[],
  codeRaw: string,
  nameRaw: string
): { taxId: string; address: string } {
  const code = String(codeRaw || '').trim()
  const name = String(nameRaw || '').trim()
  const nameKey = normalizeVendorNameKey(name)
  const found =
    vendors.find((v) => code && String(v.code || '').trim() === code) ||
    vendors.find((v) => name && String(v.name || '').trim() === name) ||
    (nameKey
      ? vendors.find((v) => normalizeVendorNameKey(String(v.name || '')) === nameKey)
      : undefined)
  return {
    taxId: String(found?.taxId || '').trim(),
    address: String(found?.address || '').trim(),
  }
}

export function whtCertificateFromLedgerRow(
  row: {
    payment_date?: string
    tax_month?: string
    payee_name?: string
    payee_tax_id?: string
    payee_address?: string
    income_type?: string
    gross_amount?: string | number | null
    wht_rate?: string | number | null
    wht_amount?: string | number | null
    form_hint?: string
    certificate_no?: string
    memo?: string
    store_name?: string
    direction?: string
  },
  headOffice: HeadOfficeCompany
): WhtCertificateData {
  const direction = String(row.direction || '').toLowerCase() === 'inbound' ? 'inbound' : 'outbound'
  const gross = Math.max(0, Number(row.gross_amount) || 0)
  const wht = Math.max(0, Number(row.wht_amount) || 0)
  const rateRaw = Number(row.wht_rate)
  const whtRate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : gross > 0 && wht > 0 ? (wht / gross) * 100 : null
  const parties = resolveWhtCertificateParties({
    direction,
    payeeName: String(row.payee_name || ''),
    payeeTaxId: String(row.payee_tax_id || ''),
    payeeAddress: String(row.payee_address || ''),
    headOffice,
  })
  const incomeType = String(row.income_type || '').trim()
  const manualHint = String(row.form_hint || '').trim()
  return {
    certificateNo: String(row.certificate_no || '').trim() || '—',
    formHint:
      manualHint ||
      resolveWhtPndFormHint({
        payeeName: parties.incomeRecipient.name,
        incomeType,
        payeeTaxId: parties.incomeRecipient.taxId,
      }),
    paymentDate: String(row.payment_date || '').slice(0, 10),
    taxMonth: String(row.tax_month || '').slice(0, 7),
    incomeType: String(row.income_type || '').trim() || '—',
    grossAmount: gross,
    whtRate: whtRate != null ? Math.round(whtRate * 100) / 100 : null,
    whtAmount: wht,
    direction,
    ...parties,
    memo: String(row.memo || '').trim() || undefined,
    storeName: String(row.store_name || '').trim() || undefined,
  }
}

import type { PosTaxInvoiceRecipientRow } from '@/lib/api-client'
import { parsePosOrderMemo, upsertPosOrderTaxInvoiceMemo } from '@/lib/pos-tax-invoice'

export type TaxSearchField = 'memberNo' | 'phone' | 'name' | 'taxId'

export type TaxInvoiceCustomerType = 'person' | 'company'

export type TaxInvoiceProfile = {
  type: 'individual' | 'corporate'
  name: string
  taxId: string
  branchCode: string
  phone: string
  email: string
  address: string
}

export type NormalizedTaxInvoiceFields = {
  name: string
  taxId: string
  branchNo: string
  phone: string
  email: string
  address: string
  effectiveBranchNo: string
  emailValid: boolean
}

/** 로컬 레지스트리 키: 회원번호 우선, 없으면 taxId_branch (비회원) */
export function taxRegistryLocalKey(
  memberNoInput: string,
  linkedMemberNo: string | undefined,
  taxId: string,
  branchNo: string
): string {
  const m = (memberNoInput || linkedMemberNo || '').trim()
  if (m) return m
  return `${taxId}_${branchNo}`
}

export function isSyntheticTaxRegistryKey(key: string): boolean {
  return /^\d{13}_\d{5}$/.test(key)
}

export function rowToTaxProfile(row: PosTaxInvoiceRecipientRow): TaxInvoiceProfile {
  return {
    type: row.customer_type === 'company' ? 'corporate' : 'individual',
    name: row.name || '',
    taxId: row.tax_id || '',
    branchCode: row.branch_no || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
  }
}

export function normalizeTaxInvoiceFields(input: {
  taxName: string
  taxId: string
  taxBranchNo: string
  taxPhone: string
  taxEmail: string
  taxAddress: string
  invoiceCustomerType: TaxInvoiceCustomerType
}): NormalizedTaxInvoiceFields {
  const taxId = input.taxId.replace(/\D/g, '').slice(0, 13)
  const branchNo = input.taxBranchNo.replace(/\D/g, '').slice(0, 5)
  const phone = input.taxPhone.replace(/\D/g, '').slice(0, 10)
  const email = input.taxEmail.trim()
  const address = input.taxAddress.trim()
  const name = input.taxName.trim()
  const branchRequired = input.invoiceCustomerType === 'company'
  const effectiveBranchNo = branchRequired ? branchNo : branchNo || '00000'
  const emailValid = email.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  return { name, taxId, branchNo, phone, email, address, effectiveBranchNo, emailValid }
}

export type TaxInvoiceValidationError = 'name' | 'taxId' | 'branch' | 'phone' | 'address' | 'email'

export function validateTaxInvoiceFields(params: {
  needTaxInvoice: boolean
  normalized: NormalizedTaxInvoiceFields
  invoiceCustomerType: TaxInvoiceCustomerType
}): { errors: TaxInvoiceValidationError[]; invalid: boolean } {
  const errors: TaxInvoiceValidationError[] = []
  if (!params.needTaxInvoice) return { errors, invalid: false }

  const n = params.normalized
  const branchRequired = params.invoiceCustomerType === 'company'
  if (!n.name) errors.push('name')
  if (n.taxId.length !== 13) errors.push('taxId')
  if (branchRequired && n.effectiveBranchNo.length !== 5) errors.push('branch')
  if (!branchRequired && n.branchNo && n.branchNo.length !== 5) errors.push('branch')
  if (n.phone.length < 9 || n.phone.length > 10) errors.push('phone')
  if (!n.address) errors.push('address')
  if (!n.emailValid) errors.push('email')
  return { errors, invalid: errors.length > 0 }
}

export type CartPanelTaxInvoiceUiSeed = {
  needTaxInvoice: boolean
  showTaxInvoiceDetails: boolean
  invoiceCustomerType: TaxInvoiceCustomerType
  taxMemberNo: string
  taxName: string
  taxId: string
  taxBranchNo: string
  taxPhone: string
  taxEmail: string
  taxAddress: string
}

/** 기존 주문 memo에 저장된 세금계산서 → 결제 모달 UI 초기값 */
export function cartPanelTaxInvoiceUiSeedFromOrderMemo(
  memo?: string | null
): CartPanelTaxInvoiceUiSeed | null {
  const ti = parsePosOrderMemo(memo).taxInvoice
  if (!ti) return null
  return {
    needTaxInvoice: true,
    showTaxInvoiceDetails: true,
    invoiceCustomerType: ti.customerType === 'company' ? 'company' : 'person',
    taxMemberNo: String(ti.memberNo || '').trim(),
    taxName: String(ti.name || '').trim(),
    taxId: String(ti.taxId || '').replace(/\D/g, '').slice(0, 13),
    taxBranchNo: String(ti.branchNo || '').replace(/\D/g, '').slice(0, 5),
    taxPhone: String(ti.phone || '').replace(/\D/g, '').slice(0, 10),
    taxEmail: String(ti.email || '').trim(),
    taxAddress: String(ti.address || '').trim(),
  }
}

export function buildCartPanelOrderMemoWithTaxInvoice(params: {
  baseMemo: string
  includeTaxInvoice: boolean
  taxMemberNo: string
  invoiceCustomerType: TaxInvoiceCustomerType
  normalized: NormalizedTaxInvoiceFields
  isMemberOrder: boolean
}): string {
  if (!params.includeTaxInvoice) return params.baseMemo
  return upsertPosOrderTaxInvoiceMemo(params.baseMemo, {
    memberNo: params.taxMemberNo.trim(),
    customerType: params.invoiceCustomerType === 'company' ? 'company' : 'person',
    name: params.normalized.name,
    taxId: params.normalized.taxId,
    branchNo: params.normalized.effectiveBranchNo,
    phone: params.normalized.phone,
    email: params.normalized.email,
    address: params.normalized.address,
    member: params.isMemberOrder,
  })
}

export function profileToTaxInvoiceSavePayload(params: {
  profile: TaxInvoiceProfile
  invoiceCustomerType: TaxInvoiceCustomerType
  normalized: NormalizedTaxInvoiceFields
}): TaxInvoiceProfile {
  return {
    type: params.invoiceCustomerType === 'company' ? 'corporate' : 'individual',
    name: params.normalized.name,
    taxId: params.normalized.taxId,
    branchCode: params.normalized.effectiveBranchNo,
    phone: params.normalized.phone,
    email: params.normalized.email,
    address: params.normalized.address,
  }
}

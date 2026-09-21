import { isTaxSettlementWithdrawalCategory } from '@/lib/bank-transaction-note-meta'
import { resolveVendorCodeLoose } from '@/lib/vendor-code-policy'

export const EXPENSE_PAYMENT_VENDOR_CODE_REQUIRED_MESSAGE =
  '거래처 코드가 없습니다. 지급 예정의 지급처를 거래처 마스터에 등록·연결한 뒤 다시 시도해 주세요.'

export function isPlaceholderPayeeCode(payeeCode: string | null | undefined): boolean {
  const c = String(payeeCode || '').trim()
  return !c || c.startsWith('auto_') || c.startsWith('card_')
}

/** 세금·고정자산 자리표시 지급처는 거래처 마스터 없이도 통장 연결을 허용한다. */
export function pickExpensePaymentVendorCode(params: {
  payeeCode: string
  withdrawalCategory: string
  resolvedFromMaster?: string | null
}): string {
  const payeeCode = String(params.payeeCode || '').trim()
  const cat = String(params.withdrawalCategory || '').trim().toLowerCase()
  if (!isPlaceholderPayeeCode(payeeCode)) return payeeCode
  if (isTaxSettlementWithdrawalCategory(cat)) return payeeCode || `tax_${cat}`
  const fromMaster = String(params.resolvedFromMaster || '').trim()
  if (fromMaster) return fromMaster
  if (cat === 'fixed_asset') return payeeCode || 'auto_fixed_asset'
  return ''
}

export async function resolveExpensePaymentVendorCode(params: {
  payeeCode: string
  payeeName?: string | null
  withdrawalCategory: string
}): Promise<string> {
  const payeeCode = String(params.payeeCode || '').trim()
  const payeeName = String(params.payeeName || '').trim()
  const withdrawalCategory = String(params.withdrawalCategory || '').trim().toLowerCase()
  let resolvedFromMaster = ''
  if (isPlaceholderPayeeCode(payeeCode) && !isTaxSettlementWithdrawalCategory(withdrawalCategory)) {
    resolvedFromMaster =
      (await resolveVendorCodeLoose(payeeCode)) || (await resolveVendorCodeLoose(payeeName)) || ''
  }
  return pickExpensePaymentVendorCode({
    payeeCode,
    withdrawalCategory,
    resolvedFromMaster,
  })
}

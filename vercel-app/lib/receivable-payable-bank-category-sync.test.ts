import { describe, expect, it } from 'vitest'

/** syncPayableLedgerAfterBankWithdrawCategoryChange 의 순수 분기 (테스트용) */
export function resolvePayableSyncAfterBankCategoryChange(params: {
  prevCategory: string
  nextCategory: string
  hasLinkedPayment: boolean
  vendorCode: string
}): { deleteStandalonePayment: boolean; upsertPayment: boolean } {
  const prev = String(params.prevCategory || '').toLowerCase()
  const next = String(params.nextCategory || '').toLowerCase()
  const wasPurchasePay = prev === 'purchase_payment'
  const isPurchasePay = next === 'purchase_payment'
  const vendor = String(params.vendorCode || '').trim()
  const deleteStandalonePayment = wasPurchasePay && !isPurchasePay
  const upsertPayment = Boolean(vendor) && (isPurchasePay || params.hasLinkedPayment)
  return { deleteStandalonePayment, upsertPayment }
}

describe('resolvePayableSyncAfterBankCategoryChange', () => {
  it('creates payable when expense becomes purchase_payment', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'expense',
        nextCategory: 'purchase_payment',
        hasLinkedPayment: false,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: false, upsertPayment: true })
  })

  it('removes standalone payable when purchase_payment becomes expense', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'purchase_payment',
        nextCategory: 'expense',
        hasLinkedPayment: false,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: true, upsertPayment: false })
  })

  it('skips upsert without vendor', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'expense',
        nextCategory: 'purchase_payment',
        hasLinkedPayment: false,
        vendorCode: '',
      })
    ).toEqual({ deleteStandalonePayment: false, upsertPayment: false })
  })
})

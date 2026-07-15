import { describe, expect, it } from 'vitest'
import {
  buildPaymentReceiptMemberFooterHtml,
  formatMemberTierForReceipt,
  maskMemberPhoneForReceipt,
  pickMemberReceiptFieldsFromApi,
} from '@/lib/pos-receipt-member-block'

describe('pos-receipt-member-block', () => {
  it('masks phone keeping last 4 digits', () => {
    expect(maskMemberPhoneForReceipt('0812345951')).toBe('XXXXXX5951')
    expect(maskMemberPhoneForReceipt('5951')).toBe('5951')
  })

  it('formats empty tier as Member', () => {
    expect(formatMemberTierForReceipt('')).toBe('Member')
    expect(formatMemberTierForReceipt('GOLD')).toBe('GOLD')
  })

  it('picks API loyalty fields for receipt', () => {
    const fields = pickMemberReceiptFieldsFromApi(
      {
        pointEarned: 4,
        memberPhone: '0812345951',
        memberTierCode: 'Member',
        memberPointBalance: 127,
      },
      { memberId: 9, memberNo: 'M001' }
    )
    expect(fields).toMatchObject({
      memberId: 9,
      memberNo: 'M001',
      memberPhone: '0812345951',
      memberTierCode: 'Member',
      memberPointEarned: 4,
      memberPointBalance: 127,
    })
  })

  it('builds QR + member footer html', () => {
    const html = buildPaymentReceiptMemberFooterHtml({
      receiptData: {
        orderNo: 'O1',
        storeCode: 'S1',
        orderType: 'dine_in',
        items: [],
        subtotal: 100,
        discountAmt: 0,
        total: 100,
        memberPhone: '0812345951',
        memberTierCode: 'Member',
        memberPointBalance: 127,
        memberPointEarned: 4,
      },
      showMembershipQr: true,
      membershipQrSrc: 'data:image/png;base64,xx',
      membershipQrText: 'เช็คสิทธิพิเศษที่นี่',
      tr: (_k, fb) => fb,
    })
    expect(html).toContain('receipt-member-block--split')
    expect(html).toContain('XXXXXX5951')
    expect(html).toContain('+4')
    expect(html).toContain('ข้อมูลสมาชิก')
    expect(html).toContain('เช็คสิทธิพิเศษที่นี่')
  })
})

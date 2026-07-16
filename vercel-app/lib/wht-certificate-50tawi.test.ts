import { describe, expect, it } from 'vitest'
import { thaiBahtInWords } from '@/lib/thai-baht-text'
import { resolveWht50Tawi } from '@/lib/wht-certificate-50tawi'
import type { WhtCertificateData } from '@/lib/wht-certificate-data'

describe('thaiBahtInWords', () => {
  it('formats whole baht', () => {
    expect(thaiBahtInWords(279)).toContain('บาท')
    expect(thaiBahtInWords(279)).toContain('ถ้วน')
  })
})

describe('resolveWht50Tawi', () => {
  const base: WhtCertificateData = {
    certificateNo: 'EAW-42',
    formHint: 'PND3',
    paymentDate: '2026-07-16',
    taxMonth: '2026-07',
    incomeType: 'ค่าบริการ',
    grossAmount: 9300,
    whtRate: 3,
    whtAmount: 279,
    direction: 'outbound',
    withholdingAgent: { name: 'บริษัท ทดสอบ', taxId: '0123456789012', address: 'กรุงเทพฯ' },
    incomeRecipient: { name: 'ผู้รับเงิน', taxId: '9876543210987' },
  }

  it('maps service income to row 5 and PND3', () => {
    const r = resolveWht50Tawi(base)
    expect(r.incomeRow).toBe('r5')
    expect(r.pndChecks.pnd3).toBe(true)
    expect(r.bookNo).toBe('EAW')
    expect(r.certNo).toBe('42')
    expect(r.paymentDateDisplay).toBe('16/7/2569')
  })
})

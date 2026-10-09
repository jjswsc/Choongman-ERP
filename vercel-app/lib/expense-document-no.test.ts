import { describe, expect, it } from 'vitest'
import {
  buildExpenseDocumentNo,
  expenseDocumentPrefixForVat,
  expenseDocumentSeqKey,
  isExpenseDocumentNo,
  isPvPpDocumentNo,
  normalizeVoucherDocumentNo,
  parseExpenseDocumentNo,
  remapExpDocumentNoToPvPp,
} from '@/lib/expense-document-no'

describe('expense-document-no PV/PP', () => {
  it('VAT>0 → PV, else PP', () => {
    expect(expenseDocumentPrefixForVat(7)).toBe('PV')
    expect(expenseDocumentPrefixForVat(0)).toBe('PP')
    expect(expenseDocumentPrefixForVat(null)).toBe('PP')
  })

  it('builds and parses PV/PP', () => {
    expect(buildExpenseDocumentNo('202610', 3, 'PV')).toBe('PV2026100003')
    expect(buildExpenseDocumentNo('202610', 12, 'PP')).toBe('PP2026100012')
    expect(parseExpenseDocumentNo('PV2026100003')).toEqual({
      prefix: 'PV',
      yyyymm: '202610',
      seq: 3,
    })
    expect(isExpenseDocumentNo('EXP2026080476')).toBe(true)
    expect(isExpenseDocumentNo('PV2026080476')).toBe(true)
  })

  it('seq key is prefix+yyyymm', () => {
    expect(expenseDocumentSeqKey('PV', '202610')).toBe('PV202610')
    expect(expenseDocumentSeqKey('PP', '2026-10')).toBe('PP202610')
  })

  it('remaps EXP by VAT', () => {
    expect(remapExpDocumentNoToPvPp('EXP2026080476', 100)).toBe('PV2026080476')
    expect(remapExpDocumentNoToPvPp('EXP2026080476', 0)).toBe('PP2026080476')
    expect(remapExpDocumentNoToPvPp('PV2026080476', 0)).toBe('PV2026080476')
  })

  it('locks only PV/PP numbers, case-insensitive', () => {
    expect(isPvPpDocumentNo(' pv2026100004 ')).toBe(true)
    expect(isPvPpDocumentNo('PP2026100013')).toBe(true)
    expect(isPvPpDocumentNo('RV2026100001')).toBe(false)
    expect(isPvPpDocumentNo('SV2026100001')).toBe(false)
    expect(normalizeVoucherDocumentNo(' pv2026100004 ')).toBe('PV2026100004')
  })
})

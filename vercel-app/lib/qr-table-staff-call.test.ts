import { describe, expect, it } from 'vitest'
import { qrGuestLangs, qrGuestT } from '@/lib/i18n-qr-table-guest'
import {
  QR_STAFF_CALL_BILL,
  QR_STAFF_CALL_HELP,
  normalizeQrStaffCallKind,
  qrStaffCallKindLabel,
} from '@/lib/qr-table-staff-call'

describe('normalizeQrStaffCallKind', () => {
  it('maps stable codes', () => {
    expect(normalizeQrStaffCallKind(QR_STAFF_CALL_BILL)).toBe('bill')
    expect(normalizeQrStaffCallKind(QR_STAFF_CALL_HELP)).toBe('help')
    expect(normalizeQrStaffCallKind('water')).toBe('water')
    expect(normalizeQrStaffCallKind('CHECK')).toBe('bill')
  })

  it('maps leftover guest-language labels', () => {
    for (const lang of qrGuestLangs()) {
      expect(normalizeQrStaffCallKind(qrGuestT(lang, 'callBill')), lang).toBe('bill')
      expect(normalizeQrStaffCallKind(qrGuestT(lang, 'callHelp')), lang).toBe('help')
      expect(normalizeQrStaffCallKind(qrGuestT(lang, 'callWater')), lang).toBe('water')
    }
  })

  it('falls back when empty or unknown', () => {
    expect(normalizeQrStaffCallKind('')).toBe('other')
    expect(normalizeQrStaffCallKind(null)).toBe('other')
    expect(normalizeQrStaffCallKind('something else')).toBe('other')
  })

  it('labels kinds in POS language', () => {
    const t = (_k: string, fb: string) => fb
    expect(qrStaffCallKindLabel('bill', t)).toBe('계산 요청')
    expect(qrStaffCallKindLabel('help', t)).toBe('도움 요청')
  })
})

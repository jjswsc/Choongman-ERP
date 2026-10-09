import { describe, expect, it } from 'vitest'
import {
  computeVatInputClaimable,
  computeVatSettlement,
  emptyVat,
  mapPnd54Entries,
  mapPp36Entries,
  mapVatEntries,
  mapWhtEntries,
  mergeWhtAmountPatch,
  round2,
  shouldShowPnd353RdPrepTxtDownload,
  withheldFromGrossAndRate,
} from './admin-accounting-compliance-utils'
import type { VatDraft } from './admin-accounting-compliance-types'

const vatRow = (patch: Partial<VatDraft>): VatDraft => ({ ...emptyVat('2026-09'), ...patch })

describe('ledger entry mappers', () => {
  it('maps VAT rows with defaults from the tax month', () => {
    const [row] = mapVatEntries(
      [{ id: '7', doc_date: '2026-09-15T00:00:00Z', direction: 'INPUT ', net_amount: 100, vat_amount: 7, filing_status: 'SUBMITTED' }],
      '2026-09'
    )
    expect(row.id).toBe(7)
    expect(row.doc_date).toBe('2026-09-15')
    expect(row.tax_month).toBe('2026-09')
    expect(row.direction).toBe('input')
    expect(row.net_amount).toBe('100')
    expect(row.total_amount).toBe('')
    expect(row.invoice_evidence_status).toBe('required_pending')
    expect(row.filing_status).toBe('submitted')
  })

  it('keeps known invoice evidence statuses and defaults direction to output', () => {
    const [row] = mapVatEntries([{ invoice_evidence_status: 'unobtainable', tax_month: '2026-08-31' }], '2026-09')
    expect(row.id).toBeUndefined()
    expect(row.invoice_evidence_status).toBe('unobtainable')
    expect(row.direction).toBe('output')
    expect(row.tax_month).toBe('2026-08')
  })

  it('maps WHT rows including direction and source id', () => {
    const [row] = mapWhtEntries([{ direction: 'Inbound', source_id: '12', wht_rate: 3 }], '2026-09')
    expect(row.direction).toBe('inbound')
    expect(row.source_id).toBe(12)
    expect(row.wht_rate).toBe('3')
    expect(row.filing_status).toBe('draft')
    expect(mapWhtEntries([{ source_id: 'x' }], '2026-09')[0].source_id).toBe(0)
  })

  it('maps PP.36 rows with a 7% default rate and PND.54 rows', () => {
    expect(mapPp36Entries([{}], '2026-09')[0].vat_rate).toBe('7')
    expect(mapPp36Entries([{ vat_rate: 0 }], '2026-09')[0].vat_rate).toBe('0')
    const [pnd54] = mapPnd54Entries([{ payee_country: 'KR', gross_amount: 1000 }], '2026-09')
    expect(pnd54.payee_country).toBe('KR')
    expect(pnd54.gross_amount).toBe('1000')
    expect(pnd54.tax_month).toBe('2026-09')
  })
})

describe('round2', () => {
  it('rounds half up to 2 decimals', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(0.1 + 0.2)).toBe(0.3)
  })
})

describe('VAT settlement', () => {
  const inputs = [
    vatRow({ direction: 'input', net_amount: '1000', vat_amount: '70', invoice_evidence_status: 'received' }),
    vatRow({ direction: 'input', net_amount: '500', vat_amount: '35', invoice_evidence_status: 'not_required' }),
    vatRow({ direction: 'input', net_amount: '200', vat_amount: '14', invoice_evidence_status: 'required_pending' }),
    vatRow({ direction: 'input', net_amount: '100', vat_amount: '7', invoice_evidence_status: 'unobtainable' }),
  ]
  const outputs = [
    vatRow({ direction: 'output', net_amount: '3000', vat_amount: '210', total_amount: '3210', memo: '[AUTO:POS_ORDER:1]' }),
    vatRow({ direction: 'output', net_amount: '1000', vat_amount: '70', total_amount: '1070', counterparty_name: 'B2B' }),
  ]

  it('only counts received / not-required input VAT as claimable', () => {
    expect(computeVatInputClaimable(inputs)).toEqual({
      claimableVat: 105,
      claimableNet: 1500,
      pendingVat: 14,
      unobtainableVat: 7,
      claimableCount: 2,
      pendingCount: 1,
      unobtainableCount: 1,
    })
  })

  it('computes payable VAT from output minus claimable input and splits POS output', () => {
    const s = computeVatSettlement(outputs, inputs, computeVatInputClaimable(inputs), 999)
    expect(s.outputVat).toBe(280)
    expect(s.inputVat).toBe(126)
    expect(s.claimableInputVat).toBe(105)
    expect(s.payableVat).toBe(175)
    expect(s.dueVat).toBe(175)
    expect(s.creditVat).toBe(0)
    expect(s.posOutputVat).toBe(210)
    expect(s.posOutputCount).toBe(1)
    expect(s.otherOutputVat).toBe(70)
    expect(s.summaryPayableVat).toBe(999)
  })

  it('reports a credit when claimable input exceeds output', () => {
    const s = computeVatSettlement([], inputs, computeVatInputClaimable(inputs), undefined)
    expect(s.payableVat).toBe(-105)
    expect(s.dueVat).toBe(0)
    expect(s.creditVat).toBe(105)
    expect(s.summaryPayableVat).toBe(0)
  })
})

describe('withheldFromGrossAndRate', () => {
  it('matches PND.3 rent/service examples', () => {
    expect(withheldFromGrossAndRate('170000', '5')).toBe('8500')
    expect(withheldFromGrossAndRate('5000', '0.9')).toBe('45')
  })

  it('recalculates withheld when gross or rate changes', () => {
    const row = { gross_amount: '1000', wht_rate: '3', wht_amount: '30', payee_name: 'A' }
    expect(mergeWhtAmountPatch(row, { gross_amount: '2000' }).wht_amount).toBe('60')
    expect(mergeWhtAmountPatch(row, { wht_rate: '5' }).wht_amount).toBe('50')
    expect(mergeWhtAmountPatch(row, { wht_amount: '12' }).wht_amount).toBe('12')
  })
})

describe('shouldShowPnd353RdPrepTxtDownload', () => {
  const whtBase = {
    pp30Mode: 'wht_only',
    showPnd1Area: false,
    showPnd353Tools: true,
    isPnd5354CompactList: false,
    pnd5354SubView: 'pnd53' as const,
  }

  it('shows TXT on dedicated PND.3 and PND.53 tabs', () => {
    expect(shouldShowPnd353RdPrepTxtDownload({ ...whtBase, whtFocusMode: 'pnd53' })).toBe(true)
    expect(shouldShowPnd353RdPrepTxtDownload({ ...whtBase, whtFocusMode: 'pnd3' })).toBe(true)
  })

  it('shows TXT on legacy combined 53/54 tab when 53 is selected', () => {
    expect(
      shouldShowPnd353RdPrepTxtDownload({
        ...whtBase,
        whtFocusMode: 'pnd5354',
        isPnd5354CompactList: true,
        pnd5354SubView: 'pnd53',
      })
    ).toBe(true)
    expect(
      shouldShowPnd353RdPrepTxtDownload({
        ...whtBase,
        whtFocusMode: 'pnd5354',
        isPnd5354CompactList: true,
        pnd5354SubView: 'pnd54',
      })
    ).toBe(false)
  })

  it('hides TXT on PND.1 / PP.30 / PND.54 tabs', () => {
    expect(
      shouldShowPnd353RdPrepTxtDownload({ ...whtBase, showPnd1Area: true, whtFocusMode: 'pnd1' })
    ).toBe(false)
    expect(
      shouldShowPnd353RdPrepTxtDownload({ ...whtBase, pp30Mode: 'vat_only', whtFocusMode: 'pnd53' })
    ).toBe(false)
    expect(shouldShowPnd353RdPrepTxtDownload({ ...whtBase, whtFocusMode: 'pnd54' })).toBe(false)
  })
})

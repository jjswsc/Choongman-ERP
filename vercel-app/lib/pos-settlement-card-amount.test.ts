import { describe, expect, it } from 'vitest'
import {
  classifySettlementCardMismatch,
  resolveSettlementCardAmount,
  shouldApplyAutoCardBreakdown,
} from '@/lib/pos-settlement-card-amount'

describe('shouldApplyAutoCardBreakdown', () => {
  it('does not apply incomplete LinkPOS Other over POS card total', () => {
    expect(
      shouldApplyAutoCardBreakdown({
        preferLiveAuto: true,
        savedBreakdownEmpty: true,
        autoCardTotal: 398,
        posCardOrdersTotal: 14185,
      })
    ).toBe(false)
  })

  it('applies when AUTO matches POS card total', () => {
    expect(
      shouldApplyAutoCardBreakdown({
        preferLiveAuto: true,
        savedBreakdownEmpty: false,
        autoCardTotal: 14185,
        posCardOrdersTotal: 14185,
      })
    ).toBe(true)
  })

  it('applies AUTO when POS has no card', () => {
    expect(
      shouldApplyAutoCardBreakdown({
        preferLiveAuto: true,
        savedBreakdownEmpty: true,
        autoCardTotal: 398,
        posCardOrdersTotal: 0,
      })
    ).toBe(true)
  })

  it('does not overwrite a saved closed breakdown', () => {
    expect(
      shouldApplyAutoCardBreakdown({
        preferLiveAuto: false,
        savedBreakdownEmpty: false,
        autoCardTotal: 14185,
        posCardOrdersTotal: 14185,
      })
    ).toBe(false)
  })
})

describe('resolveSettlementCardAmount', () => {
  it('uses brand sum when any brand is filled', () => {
    expect(resolveSettlementCardAmount({ brandSum: 398, posCardOrdersTotal: 14185 })).toBe(398)
  })

  it('falls back to POS card when brands are empty', () => {
    expect(resolveSettlementCardAmount({ brandSum: 0, posCardOrdersTotal: 14185, cardAmtFallback: 398 })).toBe(
      14185
    )
  })
})

describe('classifySettlementCardMismatch', () => {
  it('flags Other-only 398 vs POS 14185 as incomplete', () => {
    const r = classifySettlementCardMismatch({
      brandSum: 398,
      posCardOrdersTotal: 14185,
      filledBrandCount: 1,
    })
    expect(r.kind).toBe('incomplete')
    expect(r.diff).toBe(-13787)
  })

  it('flags EDC 14583 vs POS 14185 as edc_diff', () => {
    const r = classifySettlementCardMismatch({
      brandSum: 14583,
      posCardOrdersTotal: 14185,
      filledBrandCount: 3,
    })
    expect(r.kind).toBe('edc_diff')
    expect(r.diff).toBe(398)
  })

  it('treats Visa+Master matching POS as none', () => {
    const r = classifySettlementCardMismatch({
      brandSum: 14185,
      posCardOrdersTotal: 14185,
      filledBrandCount: 2,
    })
    expect(r.kind).toBe('none')
  })

  it('treats empty brands as none (POS fallback)', () => {
    const r = classifySettlementCardMismatch({
      brandSum: 0,
      posCardOrdersTotal: 14185,
      filledBrandCount: 0,
    })
    expect(r.kind).toBe('none')
  })

  it('flags brands with no POS card as edc_diff', () => {
    const r = classifySettlementCardMismatch({
      brandSum: 398,
      posCardOrdersTotal: 0,
      filledBrandCount: 1,
    })
    expect(r.kind).toBe('edc_diff')
    expect(r.diff).toBe(398)
  })
})

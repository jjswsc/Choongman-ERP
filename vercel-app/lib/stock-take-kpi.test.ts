import { describe, expect, it } from 'vitest'
import {
  buildStockTakeKpiRows,
  buildStockTakeOpsLineCopy,
  isStockTakeComplete,
  managerBelongsToMissingStore,
  matchAdjustmentStore,
  resolveStockTakeKpiMonth,
  resolveStockTakeNoticePhase,
  shiftYearMonth,
  STOCK_TAKE_MIN_DISTINCT_ITEMS,
  stockTakeWindowsForYearMonth,
  summarizeVarianceKpi,
} from './stock-take-kpi'

describe('stock-take-kpi', () => {
  it('shifts year-month across year boundary', () => {
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftYearMonth('2025-12', 1)).toBe('2026-01')
  })

  it('uses current month in last 3 days', () => {
    const r = resolveStockTakeKpiMonth('2026-08-30')
    expect(r.yearMonth).toBe('2026-08')
    expect(r.endYmd).toBe('2026-08-31')
    expect(r.dueStartYmd).toBe('2026-08-29')
    expect(r.dueEndYmd).toBe('2026-09-05')
    expect(r.windowStartYmd).toBe(r.dueStartYmd)
    expect(r.windowEndYmd).toBe(r.dueEndYmd)
    expect(r.inDueWindow).toBe(true)
  })

  it('uses previous month on Sep 3 (just closed)', () => {
    const r = resolveStockTakeKpiMonth('2026-09-03')
    expect(r.yearMonth).toBe('2026-08')
    expect(r.inDueWindow).toBe(true)
    expect(r.dueEndYmd).toBe('2026-09-05')
  })

  it('due window ends on the 5th of next month', () => {
    expect(resolveStockTakeKpiMonth('2026-09-05').inDueWindow).toBe(true)
    expect(resolveStockTakeKpiMonth('2026-09-06').inDueWindow).toBe(false)
  })

  it('aligns explicit yearMonth windows with due dates', () => {
    const r = stockTakeWindowsForYearMonth('2026-08', '2026-08-15')
    expect(r.windowStartYmd).toBe('2026-08-29')
    expect(r.windowEndYmd).toBe('2026-09-05')
    expect(r.inDueWindow).toBe(false)
  })

  it('uses previous month mid-month for HQ review', () => {
    const r = resolveStockTakeKpiMonth('2026-08-15')
    expect(r.yearMonth).toBe('2026-07')
    expect(r.inDueWindow).toBe(false)
  })

  it('requires enough distinct items for complete', () => {
    expect(isStockTakeComplete(STOCK_TAKE_MIN_DISTINCT_ITEMS, 5)).toBe(true)
    expect(isStockTakeComplete(2, 3)).toBe(false)
    expect(isStockTakeComplete(2, 10)).toBe(true)
  })

  it('matches CM prefix store to location', () => {
    expect(matchAdjustmentStore('CM Ekkamai', ['Ekkamai', 'Silom'])).toBe('Ekkamai')
    expect(matchAdjustmentStore('본사', ['Ekkamai'])).toBe(null)
  })

  it('marks stores with enough adjustments as done', () => {
    const stores = ['A', 'B']
    const adjs = Array.from({ length: 5 }, (_, i) => ({
      store: 'A',
      itemCode: `I${i}`,
      date: '2026-08-31',
    }))
    const rows = buildStockTakeKpiRows(stores, adjs)
    expect(rows.find((r) => r.store === 'A')?.done).toBe(true)
    expect(rows.find((r) => r.store === 'B')?.done).toBe(false)
  })

  it('notice start/nudge uses calendar month not KPI cycle', () => {
    const start = resolveStockTakeNoticePhase('2026-08-29', 2)
    expect(start?.phase).toBe('start')
    expect(start?.month.yearMonth).toBe('2026-08')
    expect(resolveStockTakeNoticePhase('2026-08-30', 2)).toBeNull()
    expect(resolveStockTakeNoticePhase('2026-08-28', 2)).toBeNull()
    const nudge = resolveStockTakeNoticePhase('2026-09-01', 2)
    expect(nudge?.phase).toBe('nudge')
    expect(nudge?.month.yearMonth).toBe('2026-08')
    const early = resolveStockTakeNoticePhase('2026-08-28', 3)
    expect(early?.phase).toBe('start')
    expect(early?.month.yearMonth).toBe('2026-08')
  })

  it('matches manager store to missing list with CM prefix', () => {
    expect(managerBelongsToMissingStore('CM Ekkamai', ['Ekkamai', 'Silom'])).toBe(true)
    expect(managerBelongsToMissingStore('Silom', ['Ekkamai'])).toBe(false)
    expect(managerBelongsToMissingStore('', ['Ekkamai'])).toBe(false)
  })

  it('builds LINE paste copy without tables', () => {
    const ko = buildStockTakeOpsLineCopy({
      yearMonth: '2026-08',
      endYmd: '2026-08-31',
      dueStartYmd: '2026-08-29',
      dueEndYmd: '2026-09-05',
      missingStores: ['Ekkamai', 'Silom'],
      lang: 'ko',
    })
    expect(ko).toContain('아직 안 한 매장')
    expect(ko).toContain('1. Ekkamai')
    expect(ko).not.toContain('|')
    const th = buildStockTakeOpsLineCopy({
      yearMonth: '2026-08',
      endYmd: '2026-08-31',
      dueStartYmd: '2026-08-29',
      dueEndYmd: '2026-09-05',
      missingStores: [],
      lang: 'th',
    })
    expect(th).toContain('ครบแล้วครับ')
    expect(th).not.toContain('|')
  })

  it('summarizes food variance KPI and low coverage', () => {
    const s = summarizeVarianceKpi([
      {
        ingredientType: 'food',
        theoreticalQty: 10,
        variancePct: 20,
        varianceCost: -100,
        hasAdjustment: true,
      },
      {
        ingredientType: 'food',
        theoreticalQty: 5,
        variancePct: 10,
        varianceCost: 50,
        hasAdjustment: false,
      },
      { ingredientType: 'packaging', theoreticalQty: 1, variancePct: 90, varianceCost: 999, hasAdjustment: false },
      { ingredientType: 'unknown', theoreticalQty: 0, variancePct: null, varianceCost: 0, hasAdjustment: false },
    ])
    expect(s.foodCount).toBe(2)
    expect(s.absVarianceCost).toBe(150)
    expect(s.avgAbsVariancePct).toBe(15)
    expect(s.highVarCount).toBe(1)
    expect(s.coverageLow).toBe(true)
  })
})

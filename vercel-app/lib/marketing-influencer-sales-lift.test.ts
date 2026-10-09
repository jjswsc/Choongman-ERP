import { describe, expect, it } from 'vitest'
import {
  addDaysYmd,
  computeSalesLift,
  detectSalesLiftOverlaps,
  influencerPostCost,
  normalizeSalesLiftWindow,
  salesLiftSeries,
  salesLiftWindows,
  summarizeSalesLiftRows,
  type DailyStoreSales,
} from './marketing-influencer-sales-lift'

function dailyRange(from: string, days: number, sales: number, orders = 10): Map<string, DailyStoreSales> {
  const m = new Map<string, DailyStoreSales>()
  for (let i = 0; i < days; i++) m.set(addDaysYmd(from, i), { sales, orders })
  return m
}

describe('salesLiftWindows', () => {
  it('전 N일·후 N일 구간', () => {
    expect(salesLiftWindows('2026-09-24', 7)).toEqual({
      preFrom: '2026-09-17',
      preTo: '2026-09-23',
      postFrom: '2026-09-24',
      postTo: '2026-09-30',
    })
    expect(normalizeSalesLiftWindow('14')).toBe(14)
    expect(normalizeSalesLiftWindow(5)).toBe(7)
  })
})

describe('computeSalesLift', () => {
  it('완료 구간: 증감률·증분 매출·ROI', () => {
    const daily = new Map([
      ...dailyRange('2026-09-17', 7, 10000, 20),
      ...dailyRange('2026-09-24', 7, 12000, 25),
    ])
    const r = computeSalesLift({ publishYmd: '2026-09-24', windowDays: 7, todayYmd: '2026-10-09', daily, cost: 7000 })
    expect(r.pending).toBe(false)
    expect(r.preAvg).toBe(10000)
    expect(r.postAvg).toBe(12000)
    expect(r.liftPct).toBeCloseTo(20)
    expect(r.ordersLiftPct).toBeCloseTo(25)
    expect(r.incrementalSales).toBe(14000)
    expect(r.roi).toBeCloseTo(2)
    expect(r.noSales).toBe(false)
  })

  it('집계중: 오늘은 제외하고 어제까지만', () => {
    const daily = new Map([
      ...dailyRange('2026-09-30', 7, 10000),
      ...dailyRange('2026-10-07', 3, 15000),
    ])
    const r = computeSalesLift({ publishYmd: '2026-10-07', windowDays: 7, todayYmd: '2026-10-09', daily, cost: 0 })
    expect(r.pending).toBe(true)
    expect(r.postDaysCounted).toBe(2)
    expect(r.postAvg).toBe(15000)
    expect(r.roi).toBeNull()
  })

  it('업로드일이 미래면 notStarted', () => {
    const r = computeSalesLift({ publishYmd: '2026-10-24', windowDays: 7, todayYmd: '2026-10-09', daily: new Map(), cost: 100 })
    expect(r.notStarted).toBe(true)
    expect(r.liftPct).toBeNull()
    expect(r.roi).toBeNull()
    expect(r.noSales).toBe(true)
  })

  it('전 구간 매출 0이면 증감률 null (0 나눗셈 방지)', () => {
    const daily = dailyRange('2026-09-24', 7, 5000)
    const r = computeSalesLift({ publishYmd: '2026-09-24', windowDays: 7, todayYmd: '2026-10-09', daily, cost: 1000 })
    expect(r.liftPct).toBeNull()
    expect(r.incrementalSales).toBe(35000)
  })
})

describe('computeSalesLift 대조군 보정', () => {
  it('다른 매장도 같이 오르면 순증감은 그만큼 작아진다', () => {
    const daily = new Map([
      ...dailyRange('2026-09-17', 7, 10000),
      ...dailyRange('2026-09-24', 7, 12000),
    ])
    const controlDaily = new Map([
      ...dailyRange('2026-09-17', 7, 100000),
      ...dailyRange('2026-09-24', 7, 110000),
    ])
    const r = computeSalesLift({ publishYmd: '2026-09-24', windowDays: 7, todayYmd: '2026-10-09', daily, cost: 7000, controlDaily })
    expect(r.liftPct).toBeCloseTo(20)
    expect(r.controlLiftPct).toBeCloseTo(10)
    expect(r.netIncrementalSales).toBeCloseTo((12000 - 11000) * 7)
    expect(r.netLiftPct).toBeCloseTo((12000 / 11000 - 1) * 100)
    expect(r.netRoi).toBeCloseTo(1)
  })

  it('대조군 없으면 순지표 null', () => {
    const daily = dailyRange('2026-09-17', 14, 10000)
    const r = computeSalesLift({ publishYmd: '2026-09-24', windowDays: 7, todayYmd: '2026-10-09', daily, cost: 1 })
    expect(r.netLiftPct).toBeNull()
    expect(r.netIncrementalSales).toBeNull()
  })
})

describe('salesLiftSeries · summarizeSalesLiftRows', () => {
  it('시리즈는 전 N일 + 후(어제까지), 대조군은 전 구간 합에 맞춰 스케일', () => {
    const daily = dailyRange('2026-09-30', 10, 1000)
    const controlDaily = dailyRange('2026-09-30', 10, 10000)
    const s = salesLiftSeries({ publishYmd: '2026-10-07', windowDays: 7, todayYmd: '2026-10-09', daily, controlDaily })
    expect(s).toHaveLength(9)
    expect(s[0]).toMatchObject({ date: '2026-09-30', post: false, sales: 1000, control: 1000 })
    expect(s[7]!.post).toBe(true)
    expect(s[8]!.date).toBe('2026-10-08')
  })

  it('KPI는 집계 완료·비겹침 행만 합산', () => {
    const daily = new Map([
      ...dailyRange('2026-09-17', 7, 10000),
      ...dailyRange('2026-09-24', 7, 12000),
    ])
    const done = computeSalesLift({ publishYmd: '2026-09-24', windowDays: 7, todayYmd: '2026-10-09', daily, cost: 7000 })
    const overlap = { ...done, overlap: true }
    const base = { profileId: null, campaignId: null, name: '', contactName: '', store: 'A', publishDate: '2026-09-24', actualCost: 0, unavailable: false }
    const k = summarizeSalesLiftRows([
      { ...base, id: '1', lift: done },
      { ...base, id: '2', lift: overlap },
    ])
    expect(k.total).toBe(2)
    expect(k.settled).toBe(1)
    expect(k.incremental).toBe(14000)
    expect(k.roi).toBeCloseTo(2)
    expect(k.netRoi).toBeNull()
  })
})

describe('detectSalesLiftOverlaps', () => {
  it('같은 매장 N일 이내 업로드만 겹침', () => {
    const s = detectSalesLiftOverlaps(
      [
        { id: 'a', store: 'CM Union Mall', publishYmd: '2026-09-24' },
        { id: 'b', store: 'CM Union Mall', publishYmd: '2026-09-25' },
        { id: 'c', store: 'CM Union Mall', publishYmd: '2026-10-20' },
        { id: 'd', store: 'CM Silom', publishYmd: '2026-09-24' },
      ],
      7
    )
    expect([...s].sort()).toEqual(['a', 'b'])
  })
})

describe('influencerPostCost', () => {
  it('실지출 + 제공 메뉴', () => {
    expect(
      influencerPostCost({
        actualCost: 2000,
        providedMenus: [
          { price: 199, quantity: 2 },
          { price: 100, quantity: 0 },
        ],
      })
    ).toBe(2498)
  })
})

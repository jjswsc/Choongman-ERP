import { describe, expect, it } from 'vitest'
import {
  addDaysYmd,
  computeSalesLift,
  detectSalesLiftOverlaps,
  influencerPostCost,
  normalizeSalesLiftWindow,
  salesLiftWindows,
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

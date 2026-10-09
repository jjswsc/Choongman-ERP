import { describe, expect, it } from "vitest"
import {
  computePlanTimeline,
  hmToMin,
  lateMinutes,
  minToHm,
  planDayStart,
  suggestVisitStores,
  type TimelineItemInput,
} from "@/lib/daily-plan-timeline"

const item = (id: number, p: Partial<TimelineItemInput>): TimelineItemInput => ({
  id,
  source: "routine",
  storeName: "",
  timeSlot: "",
  estMinutes: 10,
  ...p,
})

describe("daily-plan-timeline", () => {
  it("hm 변환", () => {
    expect(hmToMin("09:15")).toBe(555)
    expect(hmToMin("x")).toBeNull()
    expect(minToHm(555)).toBe("09:15")
    expect(minToHm(1440 + 30)).toBe("00:30")
  })

  it("근무 시작 > 첫 고정 시각 > 09:00", () => {
    expect(planDayStart("16:00", [{ timeSlot: "09:00" }])).toBe(960)
    expect(planDayStart("", [{ timeSlot: "" }, { timeSlot: "08:30" }])).toBe(510)
    expect(planDayStart("", [])).toBe(540)
  })

  it("고정 시각·이동 시간·방문 구간 배치", () => {
    const items = [
      item(1, { timeSlot: "09:00", estMinutes: 15 }),
      item(2, { source: "visit", storeName: "A", estMinutes: 0 }),
      item(3, { storeName: "A", estMinutes: 20 }),
      item(4, { storeName: "A", estMinutes: 10 }),
      item(5, { source: "visit", storeName: "B", estMinutes: 0 }),
      item(6, { storeName: "B", estMinutes: 15 }),
      item(7, { timeSlot: "16:30", estMinutes: 15 }),
    ]
    const { slots, dayEnd } = computePlanTimeline(items, { travelMinutes: 30 })
    expect(slots.get(1)).toMatchObject({ start: 540, end: 555 })
    expect(slots.get(2)).toMatchObject({ start: 585, end: 615, travel: 30 })
    expect(slots.get(3)).toMatchObject({ start: 585, end: 605 })
    expect(slots.get(5)).toMatchObject({ start: 645, end: 660 })
    expect(slots.get(7)).toMatchObject({ start: 990, end: 1005, pushed: false })
    expect(dayEnd).toBe(1005)
  })

  it("고정 시각보다 밀리면 pushed", () => {
    const { slots } = computePlanTimeline(
      [item(1, { estMinutes: 120 }), item(2, { timeSlot: "10:00", estMinutes: 10 })],
      { shiftIn: "09:00", travelMinutes: 0 }
    )
    expect(slots.get(2)).toMatchObject({ start: 660, pushed: true })
  })

  it("지연 분", () => {
    const slot = { start: 600, end: 615, travel: 0, pushed: false }
    expect(lateMinutes(slot, "todo", 640, 30)).toBe(40)
    expect(lateMinutes(slot, "todo", 620, 30)).toBe(0)
    expect(lateMinutes(slot, "doing", 700, 30)).toBe(0)
  })

  it("방문 매장 추천 — 과제·미방문 일수 가중, 제외 매장", () => {
    const r = suggestVisitStores({
      candidates: ["A", "B", "C", "D"],
      actions: [
        { store: "A", status: "open", dueDate: "2026-10-01" },
        { store: "B", status: "pending_verify", dueDate: "2026-10-20" },
        { store: "C", status: "open", dueDate: "2026-10-11" },
      ],
      lastVisitByStore: new Map([
        ["A", "2026-10-09"],
        ["B", "2026-10-09"],
        ["C", "2026-10-09"],
      ]),
      dateYmd: "2026-10-10",
      exclude: ["B"],
      max: 3,
    })
    expect(r.map((x) => x.store)).toEqual(["A", "D", "C"])
    expect(r[0]).toMatchObject({ overdue: 1, daysSinceVisit: 1 })
    expect(r[1].daysSinceVisit).toBeNull()
  })
})

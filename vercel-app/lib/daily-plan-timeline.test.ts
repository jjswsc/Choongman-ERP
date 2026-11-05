import { describe, expect, it } from "vitest"
import {
  computePlanTimeline,
  hmToMin,
  lateMinutes,
  minToHm,
  overnightPlanStillActive,
  overnightShiftEndMin,
  planDayStart,
  shouldKeepOvernightPlan,
  suggestVisitStores,
  timelineNowMin,
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

  it("출근 스캔으로 shift_in이 바뀌면 상대 항목 타임라인이 따라 밀림", () => {
    const items = [item(1, { estMinutes: 30 }), item(2, { estMinutes: 30 })]
    const scheduled = computePlanTimeline(items, { shiftIn: "09:00", travelMinutes: 0 })
    expect(scheduled.slots.get(1)).toMatchObject({ start: hmToMin("09:00"), end: hmToMin("09:30") })
    const afterClockIn = computePlanTimeline(items, { shiftIn: "12:00", travelMinutes: 0 })
    expect(afterClockIn.slots.get(1)).toMatchObject({ start: hmToMin("12:00"), end: hmToMin("12:30") })
    expect(afterClockIn.slots.get(2)).toMatchObject({ start: hmToMin("12:30"), end: hmToMin("13:00") })
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

describe("야간 근무표 — 자정 이후에도 출근일 표를 유지", () => {
  const at = (hm: string) => hmToMin(hm) as number

  it("22:00–08:00과 32:00 표기 모두 익일 08:00에 끝난다", () => {
    expect(overnightShiftEndMin("22:00", "08:00")).toBe(at("08:00"))
    expect(overnightShiftEndMin("22:00", "32:00")).toBe(at("08:00"))
    expect(overnightShiftEndMin("18:00", "02:00")).toBe(at("02:00"))
    expect(overnightShiftEndMin("09:00", "18:00")).toBeNull()
    expect(overnightShiftEndMin("13:00", "22:00")).toBeNull()
  })

  it("더 스트리트 심야는 07:58에 열려 있고 09:00에는 닫힌다", () => {
    expect(overnightPlanStillActive("22:00", "08:00", at("07:58"))).toBe(true)
    expect(overnightPlanStillActive("22:00", "08:00", at("08:59"))).toBe(true)
    expect(overnightPlanStillActive("22:00", "08:00", at("09:00"))).toBe(false)
    expect(overnightPlanStillActive("22:00", "08:00", at("00:10"))).toBe(true)
    expect(overnightPlanStillActive("18:00", "02:00", at("02:30"))).toBe(true)
    expect(overnightPlanStillActive("18:00", "02:00", at("03:00"))).toBe(false)
    expect(overnightPlanStillActive("09:00", "18:00", at("07:58"))).toBe(false)
  })

  it("달력상 오늘 조회일 때만 전날 미마감 야간 표를 고른다", () => {
    expect(
      shouldKeepOvernightPlan({
        requestedYmd: "2026-11-05",
        calendarTodayYmd: "2026-11-05",
        nowMin: at("07:58"),
        yesterdayStatus: "in_progress",
        shiftIn: "22:00",
        shiftOut: "08:00",
      })
    ).toBe(true)
    expect(
      shouldKeepOvernightPlan({
        requestedYmd: "2026-11-05",
        calendarTodayYmd: "2026-11-05",
        nowMin: at("07:58"),
        yesterdayStatus: "closed",
        shiftIn: "22:00",
        shiftOut: "08:00",
      })
    ).toBe(false)
    expect(
      shouldKeepOvernightPlan({
        requestedYmd: "2026-11-04",
        calendarTodayYmd: "2026-11-05",
        nowMin: at("07:58"),
        yesterdayStatus: "in_progress",
        shiftIn: "22:00",
        shiftOut: "08:00",
      })
    ).toBe(false)
  })

  it("아침 벽시계는 야간 타임라인(24:00+)과 비교된다", () => {
    expect(timelineNowMin("22:00", "08:00", at("07:58"))).toBe(at("07:58") + 24 * 60)
    expect(timelineNowMin("22:00", "08:00", at("22:30"))).toBe(at("22:30"))
    expect(timelineNowMin("09:00", "18:00", at("07:58"))).toBe(at("07:58"))
    const slotStart = at("23:00")
    const late = lateMinutes(
      { start: slotStart, end: slotStart + 10, travel: 0, pushed: false },
      "todo",
      timelineNowMin("22:00", "08:00", at("07:58")),
      30
    )
    expect(late).toBeGreaterThan(30)
  })
})

import { describe, expect, it } from "vitest"
import {
  attendanceBusinessDateStrBangkok,
  attendanceBusinessDayBoundsMs,
  plannedWorkMinutesFromPlans,
  resolveScheduleForAttendanceDay,
  resolveScheduleForEmployeeDay,
  segmentOverlapsAttendanceBusinessDay,
} from "@/lib/attendance-utils"
import { clockOutCountsForPayroll, otMinutesForPayroll } from "@/lib/payroll-utils"
import { formatReceivableInvoiceNo } from "@/lib/receivable-invoice-format"

type ReceivableEvent =
  | { kind: "invoice"; ref: string; amount: number }
  | { kind: "receive"; ref: string; amount: number }

function applyReceivableEvents(events: ReceivableEvent[]): { balance: number; seenRefs: Set<string> } {
  let balance = 0
  const seenRefs = new Set<string>()
  for (const e of events) {
    if (e.amount <= 0) throw new Error(`invalid amount: ${e.kind} ${e.amount}`)
    if (seenRefs.has(e.ref)) continue // 재전송(idempotency) 방지
    seenRefs.add(e.ref)
    if (e.kind === "invoice") balance += e.amount
    if (e.kind === "receive") balance -= e.amount
    if (balance < 0) throw new Error(`negative receivable balance: ${balance}`)
  }
  return { balance, seenRefs }
}

describe("ERP data harness - 직원 데이터", () => {
  it("방콕 00~07시는 전날 근무일로 집계", () => {
    const at0130 = new Date("2026-04-10T01:30:00+07:00")
    const businessDate = attendanceBusinessDateStrBangkok(at0130)
    expect(businessDate).toBe("2026-04-09")
  })

  it("야간 근무 계획(18:00~02:00) 분 계산이 정확", () => {
    const minutes = plannedWorkMinutesFromPlans("18:00", "02:00", "22:00", "22:30", true)
    expect(minutes).toBe(450)
  })

  it("심야 근무 22:00–07:00(휴게 27:00–28:30) 분이 잘리지 않는다", () => {
    const minutes = plannedWorkMinutesFromPlans("22:00", "07:00", "27:00", "28:30", true)
    expect(minutes).toBe(450)
  })

  it("plan_in_prev_day=false인 오전출근+익일퇴근 계획은 0분 처리되고 true면 정상 계산", () => {
    const offMinutes = plannedWorkMinutesFromPlans("10:00", "02:00", "", "", false)
    const onMinutes = plannedWorkMinutesFromPlans("10:00", "02:00", "", "", true)
    expect(offMinutes).toBe(0)
    expect(onMinutes).toBe(960)
  })

  it("휴게 종료가 시작보다 빠르거나 동일하면 휴게 차감하지 않는다", () => {
    const base = plannedWorkMinutesFromPlans("09:00", "18:00", "", "", false)
    const same = plannedWorkMinutesFromPlans("09:00", "18:00", "13:00", "13:00", false)
    const reversed = plannedWorkMinutesFromPlans("09:00", "18:00", "14:00", "13:00", false)
    expect(base).toBe(540)
    expect(same).toBe(540)
    expect(reversed).toBe(540)
  })

  it("근태 승인 상태가 급여 반영 규칙과 일치", () => {
    expect(clockOutCountsForPayroll("승인", "")).toBe(true)
    expect(clockOutCountsForPayroll("승인완료", "")).toBe(true)
    expect(clockOutCountsForPayroll("대기", "위치미확인·승인대기")).toBe(false)
    expect(clockOutCountsForPayroll("반려", "")).toBe(false)
  })

  it("연장근무 30분 미만은 급여 계산에서 제외", () => {
    expect(otMinutesForPayroll(29)).toBe(0)
    expect(otMinutesForPayroll(30)).toBe(30)
    expect(otMinutesForPayroll(75)).toBe(75)
  })

  it("스케줄 조회는 employee_id 키를 우선 사용", () => {
    const map = {
      "2026-04-09|CM Rama9|#101": {
        plan_in: "10:00",
        plan_out: "19:00",
        break_start: "14:00",
        break_end: "14:30",
      },
      "2026-04-09|CM Rama9|김철수": {
        plan_in: "09:00",
        plan_out: "18:00",
        break_start: "13:00",
        break_end: "13:30",
      },
    }
    const chosen = resolveScheduleForEmployeeDay("2026-04-09", "CM Rama9", 101, "김철수", map, 510, "payroll")
    expect(chosen?.plan_in).toBe("10:00")
    expect(chosen?.plan_out).toBe("19:00")
  })

  it("급여 모드에서 퍼지 후보가 모호하면 스케줄을 강제 선택하지 않는다", () => {
    const map = {
      "2026-04-09|CM Rama9|철수A": {
        plan_in: "09:00",
        plan_out: "18:00",
        break_start: "13:00",
        break_end: "13:30",
      },
      "2026-04-09|CM Rama9|철수B": {
        plan_in: "10:00",
        plan_out: "19:00",
        break_start: "14:00",
        break_end: "14:30",
      },
    }
    const chosen = resolveScheduleForAttendanceDay("2026-04-09", "CM Rama9", "철수", map, 510, "payroll")
    expect(chosen).toBeNull()
  })

  it("근무일 경계(다음날 08:00 미만) 구간만 해당 근무일에 겹친다", () => {
    const { startMs, endMsExclusive } = attendanceBusinessDayBoundsMs("2026-04-09")
    const insideStart = startMs + 5 * 60 * 1000
    const insideEnd = endMsExclusive - 1
    const outsideStart = endMsExclusive
    const outsideEnd = endMsExclusive + 10 * 60 * 1000

    expect(
      segmentOverlapsAttendanceBusinessDay(
        insideStart,
        insideEnd,
        false,
        startMs,
        endMsExclusive,
        insideEnd
      )
    ).toBe(true)
    expect(
      segmentOverlapsAttendanceBusinessDay(
        outsideStart,
        outsideEnd,
        false,
        startMs,
        endMsExclusive,
        outsideEnd
      )
    ).toBe(false)
  })
})

describe("ERP data harness - 거래처(원장) 데이터", () => {
  it("인보이스 번호 형식이 안정적으로 생성", () => {
    expect(formatReceivableInvoiceNo(123, "2026-04-09")).toBe("IV20260409-123")
    expect(formatReceivableInvoiceNo(77, "2026/04/09")).toBe("IV20260409-77")
  })

  it("청구-수금 흐름에서 미수 잔액이 정확", () => {
    const { balance } = applyReceivableEvents([
      { kind: "invoice", ref: "INV-1001", amount: 1000 },
      { kind: "receive", ref: "RCV-1001-A", amount: 400 },
      { kind: "receive", ref: "RCV-1001-B", amount: 600 },
    ])
    expect(balance).toBe(0)
  })

  it("동일 ref 재전송은 한 번만 반영(idempotency)", () => {
    const { balance, seenRefs } = applyReceivableEvents([
      { kind: "invoice", ref: "INV-2001", amount: 1500 },
      { kind: "invoice", ref: "INV-2001", amount: 1500 }, // duplicate
      { kind: "receive", ref: "RCV-2001-A", amount: 300 },
      { kind: "receive", ref: "RCV-2001-A", amount: 300 }, // duplicate
    ])
    expect(seenRefs.size).toBe(2)
    expect(balance).toBe(1200)
  })

  it("과수금으로 잔액 음수가 되면 실패", () => {
    expect(() =>
      applyReceivableEvents([
        { kind: "invoice", ref: "INV-3001", amount: 500 },
        { kind: "receive", ref: "RCV-3001-A", amount: 600 },
      ])
    ).toThrow("negative receivable balance")
  })
})

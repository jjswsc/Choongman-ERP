import { describe, expect, it } from "vitest"
import {
  attendanceBusinessDateStrBangkok,
  resolveScheduleForEmployeeDay,
  plannedWorkMinutesFromPlans,
} from "@/lib/attendance-utils"
import { clockOutCountsForPayroll, otMinutesForPayroll } from "@/lib/payroll-utils"

type Employee = {
  employeeCode: string
  name: string
  joinDate: string
  resignDate?: string | null
}

function normalizeEmployeeCode(code: string): string {
  return String(code || "").trim().toUpperCase()
}

function indexEmployeesByCode(rows: Employee[]): Record<string, Employee> {
  const out: Record<string, Employee> = {}
  for (const row of rows) {
    const key = normalizeEmployeeCode(row.employeeCode)
    if (!key) throw new Error("employee_code is required")
    if (out[key]) throw new Error(`duplicate employee_code: ${key}`)
    out[key] = row
  }
  return out
}

function isActiveOnDate(emp: Employee, ymd: string): boolean {
  if (!emp.joinDate || ymd < emp.joinDate) return false
  if (emp.resignDate && ymd > emp.resignDate) return false
  return true
}

describe("HR flow harness - 코드 중심 인사 처리", () => {
  it("직원코드는 대소문자/공백 정규화 후 유일해야 한다", () => {
    expect(() =>
      indexEmployeesByCode([
        { employeeCode: " emp-001 ", name: "Kim", joinDate: "2026-01-01" },
        { employeeCode: "EMP-001", name: "Lee", joinDate: "2026-02-01" },
      ])
    ).toThrow("duplicate employee_code: EMP-001")
  })

  it("퇴사일 이후 근태는 급여 대상에서 제외된다", () => {
    const byCode = indexEmployeesByCode([
      { employeeCode: "EMP-010", name: "Park", joinDate: "2026-01-01", resignDate: "2026-04-15" },
    ])
    expect(isActiveOnDate(byCode["EMP-010"]!, "2026-04-15")).toBe(true)
    expect(isActiveOnDate(byCode["EMP-010"]!, "2026-04-16")).toBe(false)
  })

  it("방콕 새벽 로그는 전날 근무일로 귀속되어 직원코드 집계와 일치한다", () => {
    const logAt = new Date("2026-05-02T01:20:00+07:00")
    const businessDate = attendanceBusinessDateStrBangkok(logAt)
    expect(businessDate).toBe("2026-05-01")
  })

  it("근무일 귀속 경계는 07:59까지 전날, 08:00부터 당일이다", () => {
    const at0759 = new Date("2026-05-02T07:59:00+07:00")
    const at0800 = new Date("2026-05-02T08:00:00+07:00")
    expect(attendanceBusinessDateStrBangkok(at0759)).toBe("2026-05-01")
    expect(attendanceBusinessDateStrBangkok(at0800)).toBe("2026-05-02")
  })

  it("employee_id 키 스케줄 매칭 + 승인/OT 규칙으로 급여 반영 분을 산출한다", () => {
    const scheduleMap = {
      "2026-05-01|CM Rama9|#77": {
        plan_in: "10:00",
        plan_out: "19:00",
        break_start: "14:00",
        break_end: "14:30",
      },
    }
    const schedule = resolveScheduleForEmployeeDay(
      "2026-05-01",
      "CM Rama9",
      77,
      "홍길동",
      scheduleMap,
      520,
      "payroll"
    )
    const plannedMin = plannedWorkMinutesFromPlans(
      String(schedule?.plan_in || ""),
      String(schedule?.plan_out || ""),
      String(schedule?.break_start || ""),
      String(schedule?.break_end || ""),
      Boolean(schedule?.plan_in_prev_day)
    )
    const approved = clockOutCountsForPayroll("승인완료", "")
    const otMin = otMinutesForPayroll(29)
    const payableMin = approved ? plannedMin + otMin : 0

    expect(plannedMin).toBe(510)
    expect(approved).toBe(true)
    expect(otMin).toBe(0) // 30분 미만 OT 미반영
    expect(payableMin).toBe(510)
  })
})

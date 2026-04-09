import { describe, expect, it } from "vitest"
import {
  clampNonNegativeMinutes,
  computeDayEarlyMinutes,
  resolveClockInApprovalLate,
  resolveEarlyExplicitForPayroll,
  shouldRecordAdjustment,
} from "@/lib/attendance-adjustment-utils"

describe("Attendance adjustment harness", () => {
  it("지각 면제(waiveLate)는 상태와 분값을 동시에 정상화한다", () => {
    const r = resolveClockInApprovalLate(18, { waiveLate: true, optLateMinutes: null })
    expect(r.afterLate).toBe(0)
    expect(r.status).toBe("정상(승인)")
    expect(r.requested).toBe(true)
  })

  it("지각 입력값이 있으면 반올림/범위보정 후 지각(승인) 상태를 반환한다", () => {
    const r = resolveClockInApprovalLate(0, { waiveLate: false, optLateMinutes: 12.8 })
    expect(r.afterLate).toBe(13)
    expect(r.status).toBe("지각(승인)")
    expect(r.requested).toBe(true)
  })

  it("조정 요청이 명시되면 before=after여도 이력 기록 대상으로 본다", () => {
    expect(shouldRecordAdjustment(0, 0, true)).toBe(true)
    expect(shouldRecordAdjustment(0, 0, false)).toBe(false)
    expect(shouldRecordAdjustment(5, 0, false)).toBe(true)
  })

  it("급여 조퇴 explicit은 정상(승인)+조정이력 조건에서만 0을 허용한다", () => {
    const byAdjustment = resolveEarlyExplicitForPayroll({
      outApproved: true,
      outStatus: "정상(승인)",
      rawEarlyNum: 0,
      hasEarlyAdjustment: true,
    })
    const noAdjustment = resolveEarlyExplicitForPayroll({
      outApproved: true,
      outStatus: "정상(승인)",
      rawEarlyNum: 0,
      hasEarlyAdjustment: false,
    })
    expect(byAdjustment).toBe(0)
    expect(noAdjustment).toBeNull()
  })

  it("dayEarly 계산은 explicit이 있으면 상한(computedEarly) 내에서 반영한다", () => {
    const dayEarlyExplicit = computeDayEarlyMinutes({
      plannedWorkMin: 510,
      diffMin: -40,
      outApproved: true,
      outStatus: "정상(승인)",
      earlyMinExplicit: 5,
    })
    const dayEarlyFallback = computeDayEarlyMinutes({
      plannedWorkMin: 510,
      diffMin: -40,
      outApproved: true,
      outStatus: "정상(승인)",
      earlyMinExplicit: null,
    })
    expect(dayEarlyExplicit).toBe(5)
    expect(dayEarlyFallback).toBe(40)
  })

  it("분 보정 유틸은 음수/초과를 안전 범위(0~9999)로 고정한다", () => {
    expect(clampNonNegativeMinutes(-10)).toBe(0)
    expect(clampNonNegativeMinutes(10000)).toBe(9999)
    expect(clampNonNegativeMinutes(22.6)).toBe(23)
  })
})

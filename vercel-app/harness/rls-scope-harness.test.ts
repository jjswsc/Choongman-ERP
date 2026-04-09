import { describe, expect, it } from "vitest"
import { userCanAccessEmployeeStore } from "@/lib/admin-employee-store-access"
import {
  canManageReceivablePayableAllStores,
  canPosStaffAccessPath,
  canUpdateReceivableReceiveCheck,
  canAccessPosCostAnalysis,
} from "@/lib/permissions"
import { attendanceStoreNamePostgrestFilter } from "@/lib/attendance-utils"

describe("RLS/권한 스코프 harness", () => {
  it("director/accounting은 전체 매장 미수/미지급 관리 가능", () => {
    expect(canManageReceivablePayableAllStores("director")).toBe(true)
    expect(canManageReceivablePayableAllStores("accounting_staff")).toBe(true)
    expect(canManageReceivablePayableAllStores("manager")).toBe(false)
  })

  it("manager는 자기 매장 수금 확인만 가능", () => {
    expect(canUpdateReceivableReceiveCheck("manager", "CM Rama9", "CM Rama9")).toBe(true)
    expect(canUpdateReceivableReceiveCheck("manager", "CM Rama9", "CM Ladprao")).toBe(false)
  })

  it("officer는 기본적으로 Office 대상 접근 불가 (예외 옵션 없을 때)", () => {
    expect(userCanAccessEmployeeStore("officer", "Office", "CM Rama9")).toBe(true)
    expect(userCanAccessEmployeeStore("officer", "Office", "CM Office")).toBe(false)
  })

  it("franchisee는 allowedStores 목록 범위로만 접근", () => {
    const opts = { allowedStores: ["CM Rama9", "CM Ladprao"] }
    expect(userCanAccessEmployeeStore("franchisee", "CM Any", "CM Rama9", opts)).toBe(true)
    expect(userCanAccessEmployeeStore("franchisee", "CM Any", "CM Silom", opts)).toBe(false)
  })

  it("POS 주문전용 역할은 원가분석 경로 접근이 차단된다", () => {
    expect(canPosStaffAccessPath("/pos", "pos_staff")).toBe(true)
    expect(canPosStaffAccessPath("/admin/pos-cost-analysis", "pos_staff")).toBe(false)
    expect(canAccessPosCostAnalysis("pos_staff")).toBe(false)
    expect(canAccessPosCostAnalysis("officer")).toBe(true)
  })

  it("매장 필터는 단일 ilike 형태로 안전하게 생성된다", () => {
    const q = attendanceStoreNamePostgrestFilter("Office")
    expect(q).toContain("store_name=ilike.")
    expect(q).not.toContain("or=(")
    expect(q).not.toContain("ilike(any)")
  })
})

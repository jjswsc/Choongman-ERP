import { describe, expect, it } from "vitest"
import { userCanAccessEmployeeStore } from "@/lib/admin-employee-store-access"
import {
  canManageReceivablePayableAllStores,
  canPosStaffAccessPath,
  canUpdateReceivableReceiveCheck,
  canAccessPosCostAnalysis,
  canAccessPosPrinters,
  canAccessPosTerminalSettings,
  canPickPosTerminalStore,
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

  it("오피스 소속은 직무와 무관하게 전체 매장·Office 직원 접근", () => {
    expect(userCanAccessEmployeeStore("supervisor", "Office", "CM Rama9")).toBe(true)
    expect(userCanAccessEmployeeStore("supervisor", "Office", "CM Silom")).toBe(true)
    expect(userCanAccessEmployeeStore("supervisor", "Office", "Office")).toBe(true)
    expect(userCanAccessEmployeeStore("officer", "Office", "CM Office")).toBe(true)
    expect(userCanAccessEmployeeStore("accounting", "본사", "CM Ladprao")).toBe(true)
  })

  it("franchisee는 allowedStores 목록 범위로만 접근", () => {
    const opts = { allowedStores: ["CM Rama9", "CM Ladprao"] }
    expect(userCanAccessEmployeeStore("franchisee", "CM Any", "CM Rama9", opts)).toBe(true)
    expect(userCanAccessEmployeeStore("franchisee", "CM Any", "CM Silom", opts)).toBe(false)
  })

  it("오피스 소속이 아닌 supervisor는 allowedStores 범위만", () => {
    const opts = { allowedStores: ["CM Rama9", "CM Ladprao"] }
    expect(userCanAccessEmployeeStore("supervisor", "CM Rama9", "CM Rama9", opts)).toBe(true)
    expect(userCanAccessEmployeeStore("supervisor", "CM Rama9", "CM Ladprao", opts)).toBe(true)
    expect(userCanAccessEmployeeStore("supervisor", "CM Rama9", "CM Silom", opts)).toBe(false)
  })

  it("한글 매장 관리자 표기도 POS 프린터 설정 권한으로 인식된다", () => {
    expect(canAccessPosPrinters("매니저")).toBe(true)
    expect(canAccessPosPrinters("점장")).toBe(true)
    expect(canAccessPosPrinters("가맹점주")).toBe(true)
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

  it("supervisor는 POS 단말 설정·매장 선택 가능", () => {
    expect(canAccessPosTerminalSettings("supervisor")).toBe(true)
    expect(canPickPosTerminalStore("supervisor", "CM Rama9")).toBe(true)
    expect(canPosStaffAccessPath("/admin/pos-screen-config?tab=terminal", "supervisor")).toBe(true)
  })

  it("POS 주문 전용 역할은 단말 설정 불가", () => {
    expect(canAccessPosTerminalSettings("pos_staff")).toBe(false)
    expect(canPosStaffAccessPath("/admin/pos-screen-config", "pos_staff")).toBe(false)
  })
})

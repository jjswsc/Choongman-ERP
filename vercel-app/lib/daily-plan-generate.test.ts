import { describe, expect, it } from "vitest"
import {
  buildDailyPlanItems,
  buildDailyPlanWorkLogContent,
  collectAssignedRoutineItems,
  computeActualMinutes,
  diffPersonalAgainstSharedTemplate,
  canCancelDailyPlanItem,
  dailyPlanDismissBlock,
  isDailyPlanProgressDone,
  isoWeekdayOfYmd,
  dailyPlanDeptFromJob,
  dailyPlanDeptKey,
  managerDailyPlanPosition,
  mergeDailyPlanPhotoUrls,
  mergeRoutineTemplatesForPlan,
  pickRoutineTemplate,
  withAssignedRoutineItems,
  pickRoutineTemplatesForPlan,
  routineItemAppliesToEmployee,
  selectActionsForPlan,
  selectCarryItems,
  summarizePlanItems,
  type OpenActionLite,
  type RoutineTemplate,
  type RoutineTemplateItem,
} from "./daily-plan-generate"

function item(p: Partial<RoutineTemplateItem>): RoutineTemplateItem {
  return {
    sortOrder: 10,
    timeSlot: "",
    block: "",
    category: "기타",
    title: "t",
    description: "",
    estMinutes: 15,
    weekdays: "1234567",
    photoRequired: false,
    linkType: "none",
    perStore: false,
    employeeId: 0,
    ...p,
  }
}

function tpl(p: Partial<RoutineTemplate>): RoutineTemplate {
  return {
    id: 1,
    name: "t",
    roleScope: "supervisor",
    position: "all",
    storeName: "",
    employeeId: 0,
    status: "pilot",
    version: 1,
    note: "",
    travelMinutes: 30,
    updatedBy: "",
    updatedAt: "",
    items: [],
    ...p,
  }
}

function action(p: Partial<OpenActionLite>): OpenActionLite {
  return {
    id: 1,
    store: "A",
    title: "고장",
    status: "open",
    dueDate: "2026-10-08",
    ownerName: "",
    ownerUserId: "",
    verifierName: "",
    verifierUserId: "",
    ...p,
  }
}

const emp = { id: 7, name: "Somchai", nick: "Chai" }

describe("managerDailyPlanPosition", () => {
  it("maps Service/Kitchen job and leaves others as all", () => {
    expect(managerDailyPlanPosition("Kitchen")).toBe("kitchen")
    expect(managerDailyPlanPosition("ครัว")).toBe("kitchen")
    expect(managerDailyPlanPosition("Service")).toBe("service")
    expect(managerDailyPlanPosition("")).toBe("all")
    expect(managerDailyPlanPosition("Officer")).toBe("all")
  })
})

describe("dailyPlanDeptFromJob", () => {
  it("maps kitchen, service, office and leaves officer or blank as all", () => {
    expect(dailyPlanDeptFromJob("Kitchen")).toBe("kitchen")
    expect(dailyPlanDeptFromJob("ครัว")).toBe("kitchen")
    expect(dailyPlanDeptFromJob("Service")).toBe("service")
    expect(dailyPlanDeptFromJob("Office")).toBe("office")
    expect(dailyPlanDeptFromJob("ออฟฟิศ")).toBe("office")
    expect(dailyPlanDeptFromJob("Officer")).toBe("all")
    expect(dailyPlanDeptFromJob("")).toBe("all")
    expect(dailyPlanDeptKey("", "kitchen")).toBe("kitchen")
    expect(dailyPlanDeptKey("Service", "kitchen")).toBe("service")
  })
})

describe("pickRoutineTemplate", () => {
  const list = [
    tpl({ id: 1, roleScope: "staff", position: "all" }),
    tpl({ id: 2, roleScope: "staff", position: "kitchen" }),
    tpl({ id: 3, roleScope: "staff", position: "kitchen", storeName: "Silom" }),
    tpl({ id: 4, roleScope: "staff", position: "kitchen", storeName: "MBK", status: "draft" }),
    tpl({ id: 5, roleScope: "manager", position: "service", storeName: "CM Silom", status: "active" }),
    tpl({
      id: 6,
      roleScope: "manager",
      position: "all",
      status: "active",
      items: [item({ title: "공통브리핑", sortOrder: 5 }), item({ title: "주방점검", sortOrder: 10 })],
    }),
    tpl({
      id: 7,
      roleScope: "manager",
      position: "kitchen",
      status: "active",
      items: [item({ title: "주방점검", sortOrder: 10 })],
    }),
  ]
  it("prefers store > position > generic and ignores drafts", () => {
    expect(pickRoutineTemplate(list, { role: "staff", position: "kitchen", store: "Silom" })?.id).toBe(3)
    expect(pickRoutineTemplate(list, { role: "staff", position: "kitchen", store: "MBK" })?.id).toBe(2)
    expect(pickRoutineTemplate(list, { role: "staff", position: "service", store: "MBK" })?.id).toBe(1)
    expect(pickRoutineTemplate(list, { role: "manager", position: "all", store: "MBK" })?.id).toBe(6)
  })
  it("does not match manager position=all to department-scoped templates", () => {
    expect(pickRoutineTemplate(list, { role: "manager", position: "all", store: "CM Silom" })?.id).toBe(6)
    expect(pickRoutineTemplate(list, { role: "manager", position: "service", store: "CM Silom" })?.id).toBe(5)
  })
  it("merges manager area template with shared all template", () => {
    const picked = pickRoutineTemplatesForPlan(list, { role: "manager", position: "kitchen", store: "MBK" })
    expect(picked.map((t) => t.id)).toEqual([7, 6])
    const merged = mergeRoutineTemplatesForPlan(picked)
    expect(merged?.id).toBe(7)
    expect(merged?.items.map((i) => i.title)).toEqual(["주방점검", "공통브리핑"])
  })
  it("service manager gets store service template plus shared all", () => {
    const picked = pickRoutineTemplatesForPlan(list, {
      role: "manager",
      position: "service",
      store: "CM Silom",
    })
    expect(picked.map((t) => t.id)).toEqual([5, 6])
  })
  it("prefers personal employee template over role/store templates", () => {
    const withPersonal = [
      ...list,
      tpl({
        id: 20,
        roleScope: "staff",
        position: "kitchen",
        storeName: "Silom",
        employeeId: 7,
        status: "active",
        items: [item({ title: "개인점검" })],
      }),
    ]
    const picked = pickRoutineTemplatesForPlan(withPersonal, {
      role: "staff",
      position: "kitchen",
      store: "Silom",
      employeeId: 7,
    })
    expect(picked.map((t) => t.id)).toEqual([20])
    expect(
      pickRoutineTemplatesForPlan(withPersonal, {
        role: "staff",
        position: "kitchen",
        store: "Silom",
        employeeId: 99,
      }).map((t) => t.id)
    ).toEqual([3, 1])
  })
})

describe("routineItemAppliesToEmployee / diffPersonalAgainstSharedTemplate", () => {
  it("filters item-level employee ids", () => {
    expect(routineItemAppliesToEmployee(item({ employeeId: 0 }), 7)).toBe(true)
    expect(routineItemAppliesToEmployee(item({ employeeId: 7 }), 7)).toBe(true)
    expect(routineItemAppliesToEmployee(item({ employeeId: 7 }), 9)).toBe(false)
  })
  it("excludes other-person items when building plan", () => {
    const items = buildDailyPlanItems({
      template: tpl({
        roleScope: "staff",
        items: [
          item({ title: "공통", employeeId: 0 }),
          item({ title: "개인만", employeeId: 7 }),
          item({ title: "다른사람", employeeId: 99 }),
        ],
      }),
      role: "staff",
      dateYmd: "2026-10-08",
      homeStore: "Silom",
      routeStores: [],
      employee: emp,
      actions: [],
      carry: [],
      hqTasks: [],
    })
    expect(items.map((i) => i.title)).toEqual(["공통", "개인만"])
  })
  it("moves a manager-template line onto the named staff plan for that weekday", () => {
    const managerTpl = tpl({
      id: 8,
      roleScope: "manager",
      position: "service",
      storeName: "CM Huamak",
      status: "active",
      items: [
        item({ title: "전원", employeeId: 0, weekdays: "1234567" }),
        item({ title: "월요일 담당", employeeId: 50, weekdays: "1" }),
        item({ title: "같은 매장 둘째", employeeId: 50, weekdays: "1" }),
      ],
    })
    const otherStore = tpl({
      id: 9,
      roleScope: "manager",
      storeName: "CM Silom",
      status: "active",
      items: [item({ title: "실롬만", employeeId: 50, weekdays: "1" })],
    })
    const draft = tpl({
      id: 10,
      roleScope: "manager",
      storeName: "CM Huamak",
      status: "draft",
      items: [item({ title: "초안", employeeId: 50, weekdays: "1" })],
    })
    const assigned = collectAssignedRoutineItems([managerTpl, otherStore, draft], {
      employeeId: 50,
      store: "CM Huamak",
    })
    expect(assigned.map((i) => i.title)).toEqual(["월요일 담당", "같은 매장 둘째"])
    expect(
      collectAssignedRoutineItems([managerTpl], {
        employeeId: 50,
        store: "CM Huamak",
        excludeTemplateIds: [8],
      })
    ).toEqual([])

    const merged = withAssignedRoutineItems(null, assigned, "staff")
    const wd = isoWeekdayOfYmd("2026-10-05")
    expect(wd).toBe(1)
    const plan = buildDailyPlanItems({
      template: merged,
      role: "staff",
      dateYmd: "2026-10-05",
      homeStore: "CM Huamak",
      routeStores: [],
      employee: { id: 50, name: "Staff" },
      actions: [],
      carry: [],
      hqTasks: [],
    })
    expect(plan.map((i) => i.title)).toEqual(["월요일 담당", "같은 매장 둘째"])
    const tuesday = buildDailyPlanItems({
      template: merged,
      role: "staff",
      dateYmd: "2026-10-06",
      homeStore: "CM Huamak",
      routeStores: [],
      employee: { id: 50, name: "Staff" },
      actions: [],
      carry: [],
      hqTasks: [],
    })
    expect(tuesday.map((i) => i.title)).toEqual([])
  })
  it("diffs personal vs shared by title", () => {
    const personal = tpl({
      employeeId: 7,
      items: [item({ title: "A", estMinutes: 20 }), item({ title: "B", estMinutes: 10 })],
    })
    const shared = tpl({
      employeeId: 0,
      items: [item({ title: "A", estMinutes: 15 }), item({ title: "C", estMinutes: 5 })],
    })
    const diff = diffPersonalAgainstSharedTemplate(personal, shared)
    expect(diff.find((d) => d.title === "A")?.kind).toBe("both_changed")
    expect(diff.find((d) => d.title === "B")?.kind).toBe("personal_only")
    expect(diff.find((d) => d.title === "C")?.kind).toBe("shared_only")
  })
})

describe("selectActionsForPlan", () => {
  it("includes owner actions due by tomorrow and SV verify items on route", () => {
    const actions = [
      action({ id: 1, ownerUserId: "7", dueDate: "2026-10-09" }),
      action({ id: 2, ownerName: "chai", dueDate: "2026-10-20" }),
      action({ id: 3, status: "pending_verify", store: "B" }),
      action({ id: 4, status: "pending_verify", store: "Z", verifierName: "Somchai" }),
      action({ id: 5, status: "open", store: "B", dueDate: "2026-10-01" }),
      action({ id: 6, status: "pending_verify", store: "Z" }),
    ]
    const sv = selectActionsForPlan({ actions, role: "supervisor", employee: emp, dateYmd: "2026-10-08", routeStores: ["B"] })
    expect(sv.map((x) => [x.action.id, x.kind])).toEqual([
      [1, "owner"],
      [3, "verify"],
      [4, "verify"],
      [5, "verify"],
    ])
    const staff = selectActionsForPlan({ actions, role: "staff", employee: emp, dateYmd: "2026-10-08", routeStores: [] })
    expect(staff.map((x) => x.action.id)).toEqual([1])
  })
})

describe("buildDailyPlanItems", () => {
  const svTpl = tpl({
    items: [
      item({ sortOrder: 10, title: "브리핑", timeSlot: "09:00" }),
      item({ sortOrder: 30, title: "인원", perStore: true }),
      item({ sortOrder: 40, title: "청결", perStore: true, weekdays: "135" }),
      item({ sortOrder: 90, title: "보고", timeSlot: "16:30" }),
    ],
  })

  it("expands per-store items with a visit per route store (Thursday skips Mon/Wed/Fri item)", () => {
    expect(isoWeekdayOfYmd("2026-10-08")).toBe(4)
    const items = buildDailyPlanItems({
      template: svTpl,
      role: "supervisor",
      dateYmd: "2026-10-08",
      homeStore: "Office",
      routeStores: ["A", "B"],
      employee: emp,
      actions: [action({ id: 9, store: "B", status: "pending_verify" })],
      carry: [],
      hqTasks: [{ title: "신메뉴 교육", storeName: "A", estMinutes: 40 }, { title: "보고서" }],
    })
    expect(items.map((i) => `${i.source}:${i.storeName}:${i.title}`)).toEqual([
      "routine:Office:브리핑",
      "hq_task::보고서",
      "visit:A:A",
      "routine:A:인원",
      "hq_task:A:신메뉴 교육",
      "visit:B:B",
      "routine:B:인원",
      "action:B:[재확인] 고장",
      "routine:Office:보고",
    ])
    expect(items.map((i) => i.sortOrder)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90])
  })

  it("puts store tasks into the general block for single-store staff and dedupes carry", () => {
    const items = buildDailyPlanItems({
      template: null,
      role: "staff",
      dateYmd: "2026-10-08",
      homeStore: "A",
      routeStores: [],
      employee: emp,
      actions: [],
      carry: [
        { id: 5, source: "hq_task", refId: "", storeName: "A", title: "x", category: "당일 과제", description: "", estMinutes: 10, linkType: "none" },
        { id: 5, source: "hq_task", refId: "", storeName: "A", title: "x", category: "당일 과제", description: "", estMinutes: 10, linkType: "none" },
      ],
      hqTasks: [],
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ source: "carry", refId: "5", storeName: "A" })
  })
})

describe("cancel and dismiss guards", () => {
  it("cancels only untouched non-visit items", () => {
    expect(canCancelDailyPlanItem({ status: "todo", source: "routine" })).toBe(true)
    expect(canCancelDailyPlanItem({ status: "todo", source: "hq_task" })).toBe(true)
    expect(canCancelDailyPlanItem({ status: "todo", source: "visit" })).toBe(false)
    expect(canCancelDailyPlanItem({ status: "doing", source: "routine", startedAt: "2026-11-06T02:00:00Z" })).toBe(false)
    expect(canCancelDailyPlanItem({ status: "todo", source: "routine", delegatedToEmployeeId: 4 })).toBe(false)
  })
  it("blocks a day when anything has started, and ignores already cancelled lines", () => {
    expect(dailyPlanDismissBlock("planned", [{ status: "todo", source: "routine" }, { status: "cancelled", source: "hq_task" }])).toBeNull()
    expect(dailyPlanDismissBlock("planned", [{ status: "doing", source: "routine" }])).toBe("in_progress")
    expect(dailyPlanDismissBlock("closed", [])).toBe("closed")
    expect(dailyPlanDismissBlock("cancelled", [])).toBe("cancelled")
  })
})

describe("delegate progress helpers", () => {
  it("mergeDailyPlanPhotoUrls dedupes and keeps last max", () => {
    expect(isDailyPlanProgressDone("delegated")).toBe(false)
    expect(isDailyPlanProgressDone("awaiting_verify")).toBe(true)
    expect(mergeDailyPlanPhotoUrls(["a", "b"], ["b", "c"], 6)).toEqual(["a", "b", "c"])
    expect(mergeDailyPlanPhotoUrls(["1", "2", "3"], ["4", "5", "6", "7"], 4)).toEqual(["4", "5", "6", "7"])
  })
})

describe("summary and work log", () => {
  const items = [
    { source: "visit", status: "done", title: "A", storeName: "A", estMinutes: 0, actualMinutes: 50, skipReason: "" },
    { source: "routine", status: "done", title: "인원", storeName: "A", estMinutes: 10, actualMinutes: 15, skipReason: "" },
    { source: "routine", status: "skipped", title: "청결", storeName: "A", estMinutes: 20, actualMinutes: null, skipReason: "정전" },
    { source: "hq_task", status: "todo", title: "교육", storeName: "", estMinutes: 30, actualMinutes: null, skipReason: "" },
  ]
  it("excludes visit items from totals", () => {
    expect(summarizePlanItems(items)).toEqual({
      total: 3,
      done: 1,
      skipped: 1,
      cancelled: 0,
      open: 1,
      estTotal: 60,
      actualTotal: 15,
      doneRate: 33,
    })
  })
  it("counts awaiting_verify as done; delegated stays open until assignee finishes", () => {
    const withDelegated = [
      ...items,
      { source: "hq_task", status: "delegated", title: "위임", storeName: "", estMinutes: 10, actualMinutes: null, skipReason: "" },
    ]
    const open = summarizePlanItems(withDelegated)
    expect(open.total).toBe(4)
    expect(open.done).toBe(1)
    expect(open.open).toBe(2)
    expect(open.doneRate).toBe(25)

    const verified = summarizePlanItems([
      ...items,
      {
        source: "hq_task",
        status: "awaiting_verify",
        title: "위임",
        storeName: "",
        estMinutes: 10,
        actualMinutes: 8,
        skipReason: "",
      },
    ])
    expect(verified.done).toBe(2)
    expect(verified.open).toBe(1)
    expect(verified.doneRate).toBe(50)
    expect(verified.actualTotal).toBe(23)
  })
  it("lists unfinished items with reasons", () => {
    const text = buildDailyPlanWorkLogContent({ dateYmd: "2026-10-08", items, auto: true })
    expect(text).toContain("완료 · เสร็จ 1/3 (33%)")
    expect(text).toContain("자동 마감")
    expect(text).toContain("- A · 청결 (사유 · เหตุผล: 정전)")
    expect(text).toContain("ปิดอัตโนมัติ")
    expect(text).toContain("- 교육")
  })
  it("drops cancelled items from the completion rate and the not-done list", () => {
    const withCancel = [
      ...items,
      { source: "routine", status: "cancelled", title: "오배정", storeName: "A", estMinutes: 40, actualMinutes: null, skipReason: "wrong_person" },
    ]
    const s = summarizePlanItems(withCancel)
    expect(s.total).toBe(3)
    expect(s.cancelled).toBe(1)
    expect(s.doneRate).toBe(33)
    expect(s.skipped).toBe(1)
    expect(s.estTotal).toBe(60)
    const text = buildDailyPlanWorkLogContent({ dateYmd: "2026-10-08", items: withCancel })
    expect(text).toContain("취소 · ยกเลิก 1")
    expect(text).not.toContain("오배정")
  })
  it("carries only unfinished hq/carry items", () => {
    const rows = [
      { source: "hq_task", status: "todo" },
      { source: "carry", status: "doing" },
      { source: "hq_task", status: "skipped" },
      { source: "routine", status: "todo" },
    ]
    expect(selectCarryItems(rows)).toHaveLength(2)
  })
  it("computes actual minutes from start time, else estimate", () => {
    const start = "2026-10-08T02:00:00.000Z"
    expect(computeActualMinutes(start, Date.parse("2026-10-08T02:25:00.000Z"), 10)).toBe(25)
    expect(computeActualMinutes(null, Date.now(), 12)).toBe(12)
  })
})

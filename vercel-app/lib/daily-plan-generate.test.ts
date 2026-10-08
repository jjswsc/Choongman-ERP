import { describe, expect, it } from "vitest"
import {
  buildDailyPlanItems,
  buildDailyPlanWorkLogContent,
  computeActualMinutes,
  isoWeekdayOfYmd,
  pickRoutineTemplate,
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
    status: "pilot",
    version: 1,
    note: "",
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

describe("pickRoutineTemplate", () => {
  const list = [
    tpl({ id: 1, roleScope: "staff", position: "all" }),
    tpl({ id: 2, roleScope: "staff", position: "kitchen" }),
    tpl({ id: 3, roleScope: "staff", position: "kitchen", storeName: "Silom" }),
    tpl({ id: 4, roleScope: "staff", position: "kitchen", storeName: "MBK", status: "draft" }),
  ]
  it("prefers store > position > generic and ignores drafts", () => {
    expect(pickRoutineTemplate(list, { role: "staff", position: "kitchen", store: "Silom" })?.id).toBe(3)
    expect(pickRoutineTemplate(list, { role: "staff", position: "kitchen", store: "MBK" })?.id).toBe(2)
    expect(pickRoutineTemplate(list, { role: "staff", position: "service", store: "MBK" })?.id).toBe(1)
    expect(pickRoutineTemplate(list, { role: "manager", position: "all", store: "MBK" })).toBeNull()
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
      open: 1,
      estTotal: 60,
      actualTotal: 15,
      doneRate: 33,
    })
  })
  it("lists unfinished items with reasons", () => {
    const text = buildDailyPlanWorkLogContent({ dateYmd: "2026-10-08", items, auto: true })
    expect(text).toContain("완료 1/3 (33%)")
    expect(text).toContain("자동 마감")
    expect(text).toContain("- A · 청결 (사유: 정전)")
    expect(text).toContain("- 교육")
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

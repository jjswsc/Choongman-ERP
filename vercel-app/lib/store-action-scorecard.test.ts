import { describe, expect, it } from "vitest"
import { buildStoreActionScorecard, bangkokYmdFromIso } from "@/lib/store-action-scorecard"
import { storeActionDefaultDueDays, storeCheckItemKey } from "@/lib/store-action-items"

const base = {
  store: "Silom",
  ownerName: "Somchai",
  verifierName: "SV Kim",
  createdAt: "2026-10-01T02:00:00.000Z",
  completedAt: "",
  repeatCount: 0,
}

describe("buildStoreActionScorecard", () => {
  it("counts on-time completion by Bangkok date and overdue open items", () => {
    const card = buildStoreActionScorecard(
      [
        // 10-05 23:30 Bangkok = 10-05 16:30Z → on time for due 10-05
        { ...base, status: "completed", dueDate: "2026-10-05", completedAt: "2026-10-05T16:30:00.000Z" },
        // 10-06 00:30 Bangkok → late for due 10-05
        { ...base, status: "completed", dueDate: "2026-10-05", completedAt: "2026-10-05T17:30:00.000Z" },
        { ...base, status: "in_progress", dueDate: "2026-10-03", repeatCount: 1 },
        { ...base, status: "cancelled", dueDate: "2026-10-03" },
      ],
      "2026-10-08"
    )
    expect(card.total.total).toBe(3)
    expect(card.total.completed).toBe(2)
    expect(card.total.onTime).toBe(1)
    expect(card.total.overdueOpen).toBe(1)
    expect(card.total.repeat).toBe(1)
    expect(card.total.onTimeRate).toBeCloseTo(33.3, 1)
    expect(card.byStore[0].key).toBe("Silom")
    expect(card.byVerifier[0].key).toBe("SV Kim")
  })

  it("converts ISO to Bangkok YMD", () => {
    expect(bangkokYmdFromIso("2026-10-05T17:30:00.000Z")).toBe("2026-10-06")
    expect(bangkokYmdFromIso("")).toBe("")
  })
})

describe("store action helpers", () => {
  it("default due days per category", () => {
    expect(storeActionDefaultDueDays("청결")).toBe(1)
    expect(storeActionDefaultDueDays("교육")).toBe(7)
    expect(storeActionDefaultDueDays("unknown")).toBe(3)
  })

  it("builds check item key from raw path", () => {
    expect(storeCheckItemKey("주방", "", "냉장고 온도")).toBe("주방 > 냉장고 온도")
  })
})

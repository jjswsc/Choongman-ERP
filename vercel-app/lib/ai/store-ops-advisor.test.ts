import { describe, expect, it } from "vitest"
import { isStoreOpsQuestion } from "@/lib/ai/store-ops-advisor"

describe("store-ops-advisor", () => {
  it("detects sales vs purchase questions", () => {
    expect(isStoreOpsQuestion("최근 매출 대비 본사매입 비율")).toBe(true)
    expect(isStoreOpsQuestion("hello")).toBe(false)
  })
})

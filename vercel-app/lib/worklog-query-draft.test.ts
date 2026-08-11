import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import {
  clearWorklogQueryDraft,
  isWorklogDraftDate,
  readWorklogQueryDraft,
  worklogQueryDraftKey,
  writeWorklogQueryDraft,
} from "./worklog-query-draft"

function installMemorySessionStorage() {
  const map = new Map<string, string>()
  const storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key)
    },
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
  }
  vi.stubGlobal("sessionStorage", storage)
  return storage
}

describe("worklog-query-draft", () => {
  beforeEach(() => {
    installMemorySessionStorage()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("builds a stable storage key", () => {
    expect(worklogQueryDraftKey("approval", "Kim / HQ")).toBe(
      "worklog_query_draft_v1:approval:Kim___HQ"
    )
  })

  it("validates date strings", () => {
    expect(isWorklogDraftDate("2026-08-11")).toBe(true)
    expect(isWorklogDraftDate("2026/08/11")).toBe(false)
    expect(isWorklogDraftDate(null)).toBe(false)
  })

  it("round-trips draft JSON", () => {
    const key = worklogQueryDraftKey("approval", "alice")
    writeWorklogQueryDraft(key, { startStr: "2026-08-01", hasSearched: true })
    expect(readWorklogQueryDraft<{ startStr: string; hasSearched: boolean }>(key)).toEqual({
      startStr: "2026-08-01",
      hasSearched: true,
    })
    clearWorklogQueryDraft(key)
    expect(readWorklogQueryDraft(key)).toBeNull()
  })

  it("returns null on corrupt JSON", () => {
    const key = worklogQueryDraftKey("weekly", "bob")
    sessionStorage.setItem(key, "{not-json")
    expect(readWorklogQueryDraft(key)).toBeNull()
  })

  it("swallows quota errors on write", () => {
    const key = worklogQueryDraftKey("audit", "c")
    const spy = vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    expect(() => writeWorklogQueryDraft(key, { a: 1 })).not.toThrow()
    spy.mockRestore()
  })
})

import { describe, expect, it } from "vitest"

/**
 * keep-alive 숨김 탭에서 URL effect 가드 규칙(문서화 테스트).
 * - 조회 초기화: pageActive를 deps에 넣지 말고 ref로만 가드 (복귀 시 재실행으로 결과 삭제 방지)
 * - URL 동기화/replace: pageActive false면 no-op
 */
describe("erp keep-alive active guard rules", () => {
  it("skips filter-clear when page is inactive even if filter key changed", () => {
    let cleared = false
    const pageActiveRef = { current: false }
    const runClear = (dataFilterKey: string) => {
      void dataFilterKey
      if (!pageActiveRef.current) return
      cleared = true
    }
    runClear("a|b")
    expect(cleared).toBe(false)
    pageActiveRef.current = true
    runClear("a|c")
    expect(cleared).toBe(true)
  })

  it("does not clear merely because page became active again", () => {
    let clearCount = 0
    const pageActiveRef = { current: true }
    let lastKey = "k1"
    const onFilterKeyEffect = (dataFilterKey: string) => {
      if (!pageActiveRef.current) return
      if (dataFilterKey === lastKey) return
      lastKey = dataFilterKey
      clearCount += 1
    }
    onFilterKeyEffect("k1")
    expect(clearCount).toBe(0)
    pageActiveRef.current = false
    onFilterKeyEffect("k1")
    expect(clearCount).toBe(0)
    pageActiveRef.current = true
    onFilterKeyEffect("k1")
    expect(clearCount).toBe(0)
  })
})

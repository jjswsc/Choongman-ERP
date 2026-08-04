import { describe, expect, it } from 'vitest'

/**
 * submitQrCart 메뉴 스코프 판정과 동일한 순수 로직 — DB 없이 회귀 방지.
 * (서버 loadCartMenusByIdsForStore 의 allowed 필터 미러)
 */
function filterCartMenusByStoreScope(opts: {
  menuIds: number[]
  storeUsesScopes: boolean
  scopedMenuIds: number[]
}): number[] {
  const allowed = opts.storeUsesScopes ? new Set(opts.scopedMenuIds) : null
  return opts.menuIds.filter((id) => (allowed ? allowed.has(id) : true))
}

describe('qr cart menu scope filter', () => {
  it('allows all requested ids when store has no scopes', () => {
    expect(
      filterCartMenusByStoreScope({
        menuIds: [1, 2, 3],
        storeUsesScopes: false,
        scopedMenuIds: [],
      })
    ).toEqual([1, 2, 3])
  })

  it('keeps only scoped ids when store uses scopes', () => {
    expect(
      filterCartMenusByStoreScope({
        menuIds: [1, 2, 3],
        storeUsesScopes: true,
        scopedMenuIds: [2],
      })
    ).toEqual([2])
  })
})

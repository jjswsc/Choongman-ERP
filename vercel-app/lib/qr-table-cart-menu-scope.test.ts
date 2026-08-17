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

function isQrExtraMenuAllowed(opts: {
  buffetIncluded: boolean
  extraRestricted: boolean
  extraAllowed: Set<number>
  menuId: number
}): boolean {
  if (opts.buffetIncluded) return true
  if (!opts.extraRestricted) return true
  return opts.extraAllowed.has(opts.menuId)
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

describe('qr extra menu allow list', () => {
  it('allows included buffet lines even if extras are restricted', () => {
    expect(
      isQrExtraMenuAllowed({
        buffetIncluded: true,
        extraRestricted: true,
        extraAllowed: new Set(),
        menuId: 9,
      })
    ).toBe(true)
  })

  it('rejects extras not on the allow list when restricted', () => {
    expect(
      isQrExtraMenuAllowed({
        buffetIncluded: false,
        extraRestricted: true,
        extraAllowed: new Set([2]),
        menuId: 9,
      })
    ).toBe(false)
  })

  it('allows extras when the tier has no extra allow list', () => {
    expect(
      isQrExtraMenuAllowed({
        buffetIncluded: false,
        extraRestricted: false,
        extraAllowed: new Set(),
        menuId: 9,
      })
    ).toBe(true)
  })
})

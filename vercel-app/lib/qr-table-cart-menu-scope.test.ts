import { describe, expect, it } from 'vitest'
import { shouldMenuBeVisibleForStore } from '@/lib/pos-menu-store-scope'

/**
 * QR 카트/목록 — POS getPosMenus 와 같은 shouldMenuBeVisibleForStore 규칙.
 * (빈 스코프 + 호환 모드면 매장에 스코프가 있어도 노출)
 */
function filterCartMenusByStoreScope(opts: {
  menuIds: number[]
  requestedStoreCode: string
  /** menuId → 그 메뉴에 저장된 매장 스코프 */
  scopesByMenuId: Record<number, string[]>
  compatibilityMode: boolean
}): number[] {
  return opts.menuIds.filter((id) =>
    shouldMenuBeVisibleForStore({
      requestedStoreCode: opts.requestedStoreCode,
      scopedStores: opts.scopesByMenuId[id] || [],
      compatibilityMode: opts.compatibilityMode,
      scopeSchemaReady: true,
    })
  )
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
  it('allows unscoped menus in compatibility mode even when other menus are scoped', () => {
    expect(
      filterCartMenusByStoreScope({
        menuIds: [1, 2, 3],
        requestedStoreCode: 'Jayle',
        scopesByMenuId: {
          1: ['Jayle'],
          // 2: empty → Kimchi Day 미러처럼 스코프 미저장
          3: ['Other'],
        },
        compatibilityMode: true,
      })
    ).toEqual([1, 2])
  })

  it('hides unscoped menus when compatibility mode is off (Omni)', () => {
    expect(
      filterCartMenusByStoreScope({
        menuIds: [1, 2, 3],
        requestedStoreCode: 'Jayle',
        scopesByMenuId: {
          1: ['Jayle'],
          2: [],
          3: ['Other'],
        },
        compatibilityMode: false,
      })
    ).toEqual([1])
  })

  it('keeps only menus scoped to the requested store when they have scopes', () => {
    expect(
      filterCartMenusByStoreScope({
        menuIds: [1, 2, 3],
        requestedStoreCode: 'Jayle',
        scopesByMenuId: {
          1: ['Rama9'],
          2: ['Jayle'],
          3: ['Jayle', 'Asoke'],
        },
        compatibilityMode: true,
      })
    ).toEqual([2, 3])
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

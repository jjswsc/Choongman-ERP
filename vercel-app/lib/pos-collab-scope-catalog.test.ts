import { describe, expect, it } from 'vitest'
import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'
import { emptyMarketingCollabDetail } from '@/lib/marketing-collab-detail'
import {
  findCollabScopeCoverageGaps,
  mergeCollabScopeMainCategories,
  subsForCollabScopeMain,
} from './pos-collab-scope-catalog'

function detail(partial: Partial<MarketingCollabDetail>): MarketingCollabDetail {
  return { ...emptyMarketingCollabDetail(), ...partial }
}

const menus = [
  { id: '1', categoryMain: 'Chicken', category: 'SNOW', isActive: true },
  { id: '2', categoryMain: 'Korean', category: 'Hot Pot', isActive: true },
  { id: '3', categoryMain: 'Korean', category: 'Dosirak', isActive: true },
  { id: '4', categoryMain: 'Dosirak', category: 'Dosirak', isActive: true },
]

describe('pos-collab-scope-catalog', () => {
  it('subsForCollabScopeMain은 설정과 메뉴 소분류를 합친다', () => {
    const subs = subsForCollabScopeMain(
      'Korean',
      { Korean: ['Hot Pot', 'KOREAN SOUP'] },
      menus
    )
    expect(subs).toContain('Hot Pot')
    expect(subs).toContain('Dosirak')
    expect(subs).toContain('KOREAN SOUP')
  })

  it('mergeCollabScopeMainCategories는 메뉴 대분류 탭을 포함한다', () => {
    const merged = mergeCollabScopeMainCategories(['Chicken', 'Korean'], menus)
    expect(merged).toContain('Dosirak')
    expect(merged).toContain('Chicken')
  })

  it('선택 대분류에 Dosirak이 없으면 gap으로 잡는다', () => {
    const gap = findCollabScopeCoverageGaps({
      detail: detail({
        scopeMainCategories: ['Chicken', 'Korean'],
        scopeCategoryKeys: ['Korean::Hot Pot'],
      }),
      mainCategories: ['Chicken', 'Korean', 'Dosirak'],
      menus,
    })
    expect(gap.uncoveredMainTabs).toContain('Dosirak')
    expect(gap.uncoveredSubcategories.some((r) => r.key === 'Korean::Dosirak')).toBe(true)
  })

  it('범위 미설정이면 gap 없음', () => {
    const gap = findCollabScopeCoverageGaps({
      detail: detail({}),
      mainCategories: ['Chicken'],
      menus,
    })
    expect(gap.uncoveredMainTabs).toEqual([])
    expect(gap.uncoveredSubcategories).toEqual([])
  })
})

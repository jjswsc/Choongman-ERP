import { describe, expect, it } from 'vitest'
import {
  isPlCogsPurchaseAccountSubject,
  isPlExpenseAccountSubject,
} from '@/lib/accounting-reports'

type Meta = {
  code: string
  name: string
  nameEn: string | null
  nameTh: string | null
  type: string
  pAndLSection: string | null
  statementType: string | null
}

function subjectsWith(
  rows: { id: number; code: string; type: string; pAndLSection: string | null }[]
): Map<number, Meta> {
  return new Map(
    rows.map((r) => [
      r.id,
      {
        code: r.code,
        name: r.code,
        nameEn: null,
        nameTh: null,
        type: r.type,
        pAndLSection: r.pAndLSection,
        statementType: null,
      },
    ])
  )
}

describe('isPlExpenseAccountSubject', () => {
  it('routes cost accounts to purchases (not PL expense)', () => {
    const subjects = subjectsWith([{ id: 1, code: '5111', type: 'expense', pAndLSection: 'cost' }])
    expect(isPlExpenseAccountSubject(1, subjects)).toBe(false)
    expect(isPlCogsPurchaseAccountSubject(1, subjects)).toBe(true)
  })

  it('routes expense accounts to PL expense', () => {
    const subjects = subjectsWith([{ id: 2, code: '5520', type: 'expense', pAndLSection: 'expense' }])
    expect(isPlExpenseAccountSubject(2, subjects)).toBe(true)
    expect(isPlCogsPurchaseAccountSubject(2, subjects)).toBe(false)
  })

  it('treats unclassified account as expense', () => {
    expect(isPlExpenseAccountSubject(null, subjectsWith([]))).toBe(true)
  })

  it('does not treat transfer/asset accounts as PL expense or COGS', () => {
    const subjects = subjectsWith([
      { id: 3, code: '1110', type: 'asset', pAndLSection: null },
      { id: 4, code: '2100', type: 'liability', pAndLSection: null },
    ])
    expect(isPlExpenseAccountSubject(3, subjects)).toBe(false)
    expect(isPlCogsPurchaseAccountSubject(3, subjects)).toBe(false)
    expect(isPlExpenseAccountSubject(4, subjects)).toBe(false)
  })
})

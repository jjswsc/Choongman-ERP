import { describe, expect, it } from 'vitest'
import { isPlExpenseAccountSubject } from '@/lib/accounting-reports'

type Meta = {
  code: string
  name: string
  nameEn: string | null
  nameTh: string | null
  type: string
  pAndLSection: string | null
  statementType: string | null
}

function meta(pAndLSection: string | null): Map<number, Meta> {
  return new Map([
    [
      1,
      {
        code: '5111',
        name: '식품원재료',
        nameEn: null,
        nameTh: null,
        type: 'expense',
        pAndLSection,
        statementType: null,
      },
    ],
    [
      2,
      {
        code: '5520',
        name: '기타경비',
        nameEn: null,
        nameTh: null,
        type: 'expense',
        pAndLSection,
        statementType: null,
      },
    ],
  ])
}

describe('isPlExpenseAccountSubject', () => {
  it('routes cost accounts to purchases (not PL expense)', () => {
    const subjects = meta('cost')
    expect(isPlExpenseAccountSubject(1, subjects)).toBe(false)
  })

  it('routes expense accounts to PL expense', () => {
    const subjects = meta('expense')
    expect(isPlExpenseAccountSubject(2, subjects)).toBe(true)
  })

  it('treats unclassified account as expense', () => {
    expect(isPlExpenseAccountSubject(null, meta('cost'))).toBe(true)
  })
})

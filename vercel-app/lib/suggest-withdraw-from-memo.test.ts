import { describe, expect, it } from 'vitest'
import { suggestWithdrawFromMemo } from '@/lib/suggest-withdraw-from-memo'

const subjects = [
  { id: 6, code: '5420' },
  { id: 7, code: '5430' },
  { id: 8, code: '5440' },
]

describe('suggestWithdrawFromMemo building utilities', () => {
  it('maps Thai electricity / combined utility memos to 5430 not 5420', () => {
    expect(suggestWithdrawFromMemo('ค่าไฟฟ้า', subjects)?.accountSubjectId).toBe(7)
    expect(suggestWithdrawFromMemo('ค่าแก๊스,ค่าน้ำประปา,ค่าไฟฟ้า', subjects)?.accountSubjectId).toBe(7)
    expect(suggestWithdrawFromMemo('ค่าแก๊ส,ค่าน้ำประปา,ค่าไฟฟ้า', subjects)?.accountSubjectId).toBe(7)
    expect(suggestWithdrawFromMemo('Utilities July 2026', subjects)?.accountSubjectId).toBe(7)
  })
})

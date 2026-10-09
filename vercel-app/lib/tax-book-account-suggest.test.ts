import { describe, expect, it } from 'vitest'
import { suggestAccountCodes } from './tax-book-account-suggest'

const options = [
  { code: '1110', name: '현금', nameTh: 'เงินสด' },
  { code: '4110', name: '매출', nameTh: 'รายได้จากการขาย' },
  { code: '4120', name: '배달 매출', nameTh: 'รายได้เดลิเวอรี' },
  { code: '5100', name: '매출원가', nameTh: 'ต้นทุนขาย' },
]
const shown = (row: { nameTh?: string | null; name?: string | null }) => String(row.nameTh || row.name || '')

describe('suggestAccountCodes', () => {
  it('narrows by leading digits', () => {
    expect(suggestAccountCodes(options, '4', shown).map((r) => r.code)).toEqual(['4110', '4120'])
    expect(suggestAccountCodes(options, '411', shown).map((r) => r.code)).toEqual(['4110'])
    expect(suggestAccountCodes(options, '9', shown)).toEqual([])
  })

  it('searches account names when letters are typed', () => {
    expect(suggestAccountCodes(options, 'รายได้', shown).map((r) => r.code)).toEqual(['4110', '4120'])
    expect(suggestAccountCodes(options, '매출원가', shown).map((r) => r.code)).toEqual(['5100'])
  })

  it('returns nothing for an empty query', () => {
    expect(suggestAccountCodes(options, '  ', shown)).toEqual([])
  })
})

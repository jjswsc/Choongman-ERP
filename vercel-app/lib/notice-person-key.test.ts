import { describe, expect, it } from 'vitest'
import { normalizeNoticePersonName, noticePersonNamesMatch } from './notice-person-key'

describe('noticePersonNamesMatch', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeNoticePersonName('  Oreo  K. ')).toBe('Oreo K.')
    expect(noticePersonNamesMatch('Oreo', ' Oreo ')).toBe(true)
  })

  it('matches latin case-insensitively', () => {
    expect(noticePersonNamesMatch('Oreo', 'oreo')).toBe(true)
  })

  it('does not match different names', () => {
    expect(noticePersonNamesMatch('Oreo', 'Oreo2')).toBe(false)
  })
})

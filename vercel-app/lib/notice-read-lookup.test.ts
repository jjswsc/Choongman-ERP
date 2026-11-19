import { describe, expect, it } from 'vitest'
import {
  buildNoticeReadStatusMap,
  employeeHasConfirmedNoticeRead,
  resolveNoticeReadStatusForEmployee,
} from './notice-read-lookup'

describe('resolveNoticeReadStatusForEmployee', () => {
  const rows = [
    { notice_id: 1, store: 'CM The Street', name: 'Oreo', status: '확인' },
    { notice_id: 2, store: 'Other Store', name: 'Oreo', status: '확인' },
    { notice_id: 3, store: 'CM Union Mall', name: 'oreo', status: '확인' },
  ]

  it('matches CM prefix store variants', () => {
    expect(resolveNoticeReadStatusForEmployee(rows, 1, 'The Street', 'Oreo')).toBe('확인')
  })

  it('does NOT credit another store with the same name', () => {
    expect(resolveNoticeReadStatusForEmployee(rows, 2, 'CM The Street', 'Oreo')).toBe('')
    expect(employeeHasConfirmedNoticeRead(rows, 2, 'CM The Street', 'Oreo')).toBe(false)
  })

  it('matches latin name case', () => {
    expect(resolveNoticeReadStatusForEmployee(rows, 3, 'CM Union Mall', 'Oreo')).toBe('확인')
  })

  it('build map', () => {
    const map = buildNoticeReadStatusMap(rows, 'The Street', 'Oreo')
    expect(map[1]).toBe('확인')
    expect(map[2]).toBeUndefined()
  })
})

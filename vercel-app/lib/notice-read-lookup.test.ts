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
  ]

  it('matches CM prefix store variants', () => {
    expect(resolveNoticeReadStatusForEmployee(rows, 1, 'The Street', 'Oreo')).toBe('확인')
  })

  it('falls back to same-name confirmed row when store drifted', () => {
    expect(resolveNoticeReadStatusForEmployee(rows, 2, 'CM The Street', 'Oreo')).toBe('확인')
  })

  it('build map and confirmed helper', () => {
    const map = buildNoticeReadStatusMap(rows, 'The Street', 'Oreo')
    expect(map[1]).toBe('확인')
    expect(employeeHasConfirmedNoticeRead(rows, 1, 'The Street', 'Oreo')).toBe(true)
  })
})

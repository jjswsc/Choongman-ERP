import { describe, expect, it } from 'vitest'
import {
  attendanceStoreNamePostgrestFilter,
  employeeStorePostgrestFilter,
} from '@/lib/attendance-utils'

describe('attendanceStoreNamePostgrestFilter', () => {
  it('단일 store_name=ilike.*…* (or / ilike(any) 미사용)', () => {
    expect(attendanceStoreNamePostgrestFilter('Office')).toBe(
      'store_name=ilike.' + encodeURIComponent('*Office*')
    )
    expect(attendanceStoreNamePostgrestFilter('CM Office')).toBe(
      'store_name=ilike.' + encodeURIComponent('*CM Office*')
    )
    expect(attendanceStoreNamePostgrestFilter('Office')).not.toContain('or=(')
    expect(attendanceStoreNamePostgrestFilter('Office')).not.toContain('ilike(any)')
  })
})

describe('employeeStorePostgrestFilter', () => {
  it('컬럼명 store, 동일 단일 ilike', () => {
    expect(employeeStorePostgrestFilter('Office')).toBe('store=ilike.' + encodeURIComponent('*Office*'))
  })
})

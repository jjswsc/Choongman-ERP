import { describe, expect, it } from 'vitest'
import {
  attendanceStoreNamePostgrestFilter,
  attendanceStoreNamePostgrestFilterFragments,
  attendanceStoreNamePostgrestVariantsFilter,
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

describe('attendanceStoreNamePostgrestVariantsFilter', () => {
  it('CM 접두 변형이 여러 개면 or=(store_name.ilike.*…*)', () => {
    const q = attendanceStoreNamePostgrestVariantsFilter('CM Silom')
    expect(q).toContain('or=(')
    expect(q).toContain('store_name.ilike.' + encodeURIComponent('*CM Silom*'))
    expect(q).toContain('store_name.ilike.' + encodeURIComponent('*Silom*'))
  })
  it('Office 는 CM 접두 변형까지 OR (단일 store_name=ilike 아님)', () => {
    const q = attendanceStoreNamePostgrestVariantsFilter('Office')
    expect(q).toContain('or=(')
    expect(q).toContain('store_name.ilike.' + encodeURIComponent('*Office*'))
    expect(q).toContain('store_name.ilike.' + encodeURIComponent('*CM Office*'))
  })
})

describe('attendanceStoreNamePostgrestFilterFragments', () => {
  it('CM Office 는 변형별 단일 ilike 조각', () => {
    const frags = attendanceStoreNamePostgrestFilterFragments('CM Office')
    expect(frags.length).toBeGreaterThan(1)
    expect(frags.some((f) => f.includes(encodeURIComponent('*CM Office*')))).toBe(true)
    expect(frags.some((f) => f.includes(encodeURIComponent('*Office*')))).toBe(true)
    expect(frags.every((f) => !f.startsWith('or=('))).toBe(true)
  })
})

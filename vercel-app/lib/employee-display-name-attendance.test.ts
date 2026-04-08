import { describe, expect, it } from 'vitest'
import {
  buildAttendanceDisplayMapsFromEmployees,
  resolveEmployeeDisplayNameForAttendanceGrid,
} from '@/lib/employee-display-name'

describe('attendance grid display name', () => {
  it('employee_id 로 마스터 호칭+이름', () => {
    const { displayByEmployeeId, displayByStoreAndBareName } = buildAttendanceDisplayMapsFromEmployees([
      { id: 10, store: 'CM Office', name: 'Somchai', name_title: 'Mr.' },
    ])
    expect(
      resolveEmployeeDisplayNameForAttendanceGrid('CM Office', 'Somchai', 10, displayByEmployeeId, displayByStoreAndBareName)
    ).toBe('Mr. Somchai')
  })

  it('로그에 Ms.만 붙어 있고 id 없으면 매장·이름으로 마스터 매칭', () => {
    const { displayByEmployeeId, displayByStoreAndBareName } = buildAttendanceDisplayMapsFromEmployees([
      { id: 2, store: 'Office', name: 'Jane', name_title: 'Ms.' },
    ])
    expect(
      resolveEmployeeDisplayNameForAttendanceGrid(
        'CM Office',
        'Ms. Jane',
        0,
        displayByEmployeeId,
        displayByStoreAndBareName
      )
    ).toBe('Ms. Jane')
  })

  it('마스터 매칭 실패 시 로그 문자열에서 호칭 조합', () => {
    const empty = buildAttendanceDisplayMapsFromEmployees([])
    expect(
      resolveEmployeeDisplayNameForAttendanceGrid('X', 'Mr. Nobody', 0, empty.displayByEmployeeId, empty.displayByStoreAndBareName)
    ).toBe('Mr. Nobody')
  })
})

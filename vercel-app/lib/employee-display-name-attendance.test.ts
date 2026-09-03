import { describe, expect, it } from 'vitest'
import {
  attachEmployeeNickToPayrollRows,
  buildAttendanceDisplayMapsFromEmployees,
  resolveEmployeeDisplayNameForAttendanceGrid,
} from '@/lib/employee-display-name'

describe('attendance grid display name', () => {
  it('닉네임 있으면 닉네임 (풀네임)으로 표시', () => {
    const { displayByEmployeeId, displayByStoreAndBareName } = buildAttendanceDisplayMapsFromEmployees([
      { id: 10, store: 'CM Office', name: 'Somchai', name_title: 'Mr.', nick: '챠이' },
    ])
    expect(
      resolveEmployeeDisplayNameForAttendanceGrid('CM Office', 'Somchai', 10, displayByEmployeeId, displayByStoreAndBareName)
    ).toBe('챠이 (Mr. Somchai)')
  })

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

describe('attachEmployeeNickToPayrollRows', () => {
  it('employee_id 로 닉네임을 붙인다', () => {
    const rows = attachEmployeeNickToPayrollRows(
      [{ store: 'CM Office', name: 'Somchai', employee_id: 10 }],
      [{ id: 10, store: 'CM Office', name: 'Somchai', nick: '챠이' }]
    )
    expect(rows[0].nick).toBe('챠이')
  })

  it('id 없으면 매장·이름으로 매칭하고 CM 접두 차이를 허용한다', () => {
    const rows = attachEmployeeNickToPayrollRows(
      [{ store: 'CM Office', name: 'Ms. Jane' }],
      [{ id: 2, store: 'Office', name: 'Jane', nick: '제인' }]
    )
    expect(rows[0].nick).toBe('제인')
  })

  it('마스터에 닉이 없으면 빈 문자열', () => {
    const rows = attachEmployeeNickToPayrollRows(
      [{ store: 'X', name: 'Nobody' }],
      [{ id: 1, store: 'X', name: 'Nobody' }]
    )
    expect(rows[0].nick).toBe('')
  })
})

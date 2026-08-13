import { describe, expect, it } from 'vitest'
import {
  TIMESHEET_ALL_STORE,
  filterHrAttendanceStorePickerOptions,
  resolveTimesheetQueryStore,
  timesheetPickedStoreFromViewStore,
} from './timesheet-store-filter'

describe('filterHrAttendanceStorePickerOptions', () => {
  it('keeps CM Office and branch stores, drops test/HQ', () => {
    expect(
      filterHrAttendanceStorePickerOptions(['CM Silom', 'CM Office', 'test', 'HQ', 'Office', ''])
    ).toEqual(['CM Office', 'CM Silom'])
  })
})

describe('resolveTimesheetQueryStore', () => {
  const resolveStoreKey = (raw: string) => raw

  it('office staff can query CM Office (not remapped to All)', () => {
    expect(
      resolveTimesheetQueryStore({
        authStore: 'CM Office',
        isOfficeStaff: true,
        pickedStore: 'CM Office',
        resolveStoreKey,
      })
    ).toBe('CM Office')
  })

  it('office staff All stays All', () => {
    expect(
      resolveTimesheetQueryStore({
        authStore: 'CM Office',
        isOfficeStaff: true,
        pickedStore: TIMESHEET_ALL_STORE,
        resolveStoreKey,
      })
    ).toBe(TIMESHEET_ALL_STORE)
  })

  it('branch staff is locked to login store', () => {
    expect(
      resolveTimesheetQueryStore({
        authStore: 'CM Silom',
        isOfficeStaff: false,
        pickedStore: 'CM Office',
        resolveStoreKey,
      })
    ).toBe('CM Silom')
  })
})

describe('timesheetPickedStoreFromViewStore', () => {
  it('maps empty/office top-bar values to All', () => {
    expect(timesheetPickedStoreFromViewStore(null)).toBe(TIMESHEET_ALL_STORE)
    expect(timesheetPickedStoreFromViewStore('CM Office')).toBe(TIMESHEET_ALL_STORE)
  })

  it('keeps a branch store from the top bar', () => {
    expect(timesheetPickedStoreFromViewStore('CM Silom')).toBe('CM Silom')
  })
})

import { describe, expect, it, afterEach } from 'vitest'
import {
  canEmployeeUseAttendanceQr,
  isAttendanceQrPilotOfficeOnly,
  isAttendanceQrRequiredForAllStores,
} from '@/lib/attendance-qr-pilot'

describe('attendance-qr-pilot', () => {
  const prev = process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY

  afterEach(() => {
    if (prev === undefined) delete process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY
    else process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY = prev
  })

  it('defaults to all-store QR (pilot off)', () => {
    delete process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY
    expect(isAttendanceQrPilotOfficeOnly()).toBe(false)
    expect(isAttendanceQrRequiredForAllStores()).toBe(true)
    expect(canEmployeeUseAttendanceQr('CM Office')).toBe(true)
    expect(canEmployeeUseAttendanceQr('Siam Paragon')).toBe(true)
  })

  it('allows all stores when pilot flag is off', () => {
    process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY = '0'
    expect(isAttendanceQrPilotOfficeOnly()).toBe(false)
    expect(canEmployeeUseAttendanceQr('Any Store')).toBe(true)
  })

  it('office-only rollback when pilot flag is on', () => {
    process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY = '1'
    expect(isAttendanceQrPilotOfficeOnly()).toBe(true)
    expect(isAttendanceQrRequiredForAllStores()).toBe(false)
    expect(canEmployeeUseAttendanceQr('CM Office')).toBe(true)
    expect(canEmployeeUseAttendanceQr('Siam Paragon')).toBe(false)
  })
})

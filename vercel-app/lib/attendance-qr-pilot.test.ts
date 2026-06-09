import { describe, expect, it, afterEach } from 'vitest'
import {
  canEmployeeUseAttendanceQr,
  isAttendanceQrPilotOfficeOnly,
} from '@/lib/attendance-qr-pilot'

describe('attendance-qr-pilot', () => {
  const prev = process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY

  afterEach(() => {
    if (prev === undefined) delete process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY
    else process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY = prev
  })

  it('defaults to office-only pilot', () => {
    delete process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY
    expect(isAttendanceQrPilotOfficeOnly()).toBe(true)
    expect(canEmployeeUseAttendanceQr('CM Office')).toBe(true)
    expect(canEmployeeUseAttendanceQr('Siam Paragon')).toBe(false)
  })

  it('allows all stores when pilot flag is off', () => {
    process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY = '0'
    expect(isAttendanceQrPilotOfficeOnly()).toBe(false)
    expect(canEmployeeUseAttendanceQr('Any Store')).toBe(true)
  })
})

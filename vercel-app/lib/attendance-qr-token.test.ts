import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_QR_BUCKET_HOURS,
  attendanceQrBucketStartMs,
  buildAttendanceQrPayload,
  verifyAttendanceQrPayload,
} from '@/lib/attendance-qr-token'

describe('attendance-qr-token', () => {
  it('builds and verifies payload within same bucket', () => {
    const at = new Date('2026-06-08T14:30:00+07:00')
    const { qrPayload, bucketStartMs } = buildAttendanceQrPayload('CM Ekkamai', at)
    expect(qrPayload.startsWith('cmatt1.')).toBe(true)
    expect(bucketStartMs).toBe(attendanceQrBucketStartMs(at))
    const v = verifyAttendanceQrPayload(qrPayload, at)
    expect(v.ok).toBe(true)
    expect(v.storeCode).toBe('CM Ekkamai')
  })

  it('rejects expired bucket', () => {
    const built = buildAttendanceQrPayload('CM Test', new Date('2026-06-08T10:00:00+07:00'))
    const later = new Date(
      built.bucketStartMs + ATTENDANCE_QR_BUCKET_HOURS * 60 * 60 * 1000 + 60_000
    )
    const v = verifyAttendanceQrPayload(built.qrPayload, later)
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('expired_bucket')
  })

  it('rejects a fixed QR while the store is rotating', () => {
    const fixed = buildAttendanceQrPayload('CM Test', new Date('2026-06-08T10:00:00+07:00'), 'fixed')
    expect(fixed.expiresAt).toBeNull()
    expect(fixed.bucketStartMs).toBe(0)
    const v = verifyAttendanceQrPayload(fixed.qrPayload, new Date('2026-06-08T11:00:00+07:00'))
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('mode_mismatch')
  })

  it('accepts a fixed QR only while the store stays fixed', () => {
    const at = new Date('2026-06-08T10:00:00+07:00')
    const later = new Date('2026-12-01T03:15:00+07:00')
    const fixed = buildAttendanceQrPayload('CM Ekkamai', at, 'fixed')
    expect(verifyAttendanceQrPayload(fixed.qrPayload, later, 'fixed').ok).toBe(true)
    const rotating = buildAttendanceQrPayload('CM Ekkamai', at, 'rotating')
    expect(verifyAttendanceQrPayload(rotating.qrPayload, at, 'fixed').ok).toBe(false)
    expect(verifyAttendanceQrPayload(rotating.qrPayload, at, 'fixed').reason).toBe('mode_mismatch')
  })

  it('binds a payload to one company so the same store code is not shared', () => {
    const at = new Date('2026-06-08T10:00:00+07:00')
    const abc = buildAttendanceQrPayload('1000', at, 'fixed', 'abc-company')
    const banjoo = buildAttendanceQrPayload('1000', at, 'fixed', 'banjoo')
    expect(abc.qrPayload.startsWith('cmatt2.')).toBe(true)
    expect(abc.qrPayload).not.toBe(banjoo.qrPayload)
    expect(
      verifyAttendanceQrPayload(abc.qrPayload, at, 'fixed', { expectedTenantId: 'abc-company' }).ok
    ).toBe(true)
    const cross = verifyAttendanceQrPayload(abc.qrPayload, at, 'fixed', {
      expectedTenantId: 'banjoo',
    })
    expect(cross.ok).toBe(false)
    expect(cross.reason).toBe('tenant_mismatch')
  })

  it('aligns bucket to 2-hour windows in Bangkok', () => {
    const bucket759 = attendanceQrBucketStartMs(new Date('2026-06-08T07:59:00+07:00'))
    const bucket600 = attendanceQrBucketStartMs(new Date('2026-06-08T06:00:00+07:00'))
    expect(bucket759).toBe(bucket600)
    const bucket800 = attendanceQrBucketStartMs(new Date('2026-06-08T08:00:00+07:00'))
    expect(bucket800).not.toBe(bucket759)
  })
})

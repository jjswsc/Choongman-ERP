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

  it('aligns bucket to 2-hour windows in Bangkok', () => {
    const bucket759 = attendanceQrBucketStartMs(new Date('2026-06-08T07:59:00+07:00'))
    const bucket600 = attendanceQrBucketStartMs(new Date('2026-06-08T06:00:00+07:00'))
    expect(bucket759).toBe(bucket600)
    const bucket800 = attendanceQrBucketStartMs(new Date('2026-06-08T08:00:00+07:00'))
    expect(bucket800).not.toBe(bucket759)
  })
})

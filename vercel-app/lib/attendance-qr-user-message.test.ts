import { describe, expect, it } from 'vitest'
import { attendanceQrFailApiMessage } from '@/lib/attendance-qr-user-message'

describe('attendanceQrFailApiMessage', () => {
  it('tells the employee the QR belongs to another company', () => {
    expect(attendanceQrFailApiMessage('tenant_mismatch')).toContain('다른 회사')
  })

  it('does not call a changed QR or a setting mismatch an expiry', () => {
    expect(attendanceQrFailApiMessage('expired_bucket')).toContain('바뀌었습니다')
    expect(attendanceQrFailApiMessage('mode_mismatch')).toContain('설정')
    expect(attendanceQrFailApiMessage('expired_bucket')).not.toContain('다른 회사')
  })

  it('keeps a generic notice only when the code itself cannot be read', () => {
    expect(attendanceQrFailApiMessage('bad_signature')).toContain('유효하지 않거나')
    expect(attendanceQrFailApiMessage(undefined)).toContain('유효하지 않거나')
  })
})

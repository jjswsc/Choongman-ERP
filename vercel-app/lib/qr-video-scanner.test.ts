import { afterEach, describe, expect, it, vi } from 'vitest'
import { QrCameraAccessError, requestQrCameraStream } from '@/lib/qr-video-scanner'

describe('qr-video-scanner camera errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps NotAllowedError to denied', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    })

    await expect(requestQrCameraStream()).rejects.toMatchObject({
      reason: 'denied',
    } satisfies Partial<QrCameraAccessError>)
  })

  it('maps NotFoundError to unavailable', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('missing', 'NotFoundError'))
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    })

    await expect(requestQrCameraStream()).rejects.toMatchObject({
      reason: 'unavailable',
    } satisfies Partial<QrCameraAccessError>)
  })
})

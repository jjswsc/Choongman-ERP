/** 카메라 + QR 디코드 (BarcodeDetector → jsQR 폴백, iPhone Safari 대응) */

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
}

export function canUseQrCamera(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

export type QrCameraErrorReason = 'denied' | 'unavailable' | 'unknown'

export class QrCameraAccessError extends Error {
  readonly reason: QrCameraErrorReason

  constructor(reason: QrCameraErrorReason) {
    super(reason)
    this.name = 'QrCameraAccessError'
    this.reason = reason
  }
}

function classifyQrCameraError(error: unknown): QrCameraErrorReason {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError') {
    return 'unavailable'
  }
  return 'unknown'
}

export async function requestQrCameraStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
  } catch (error) {
    throw new QrCameraAccessError(classifyQrCameraError(error))
  }
}

/** 디코더 없으면 no-op cleanup 반환 */
export function startQrScanLoop(params: {
  video: HTMLVideoElement
  onScan: (raw: string) => void
}): () => void {
  let rafId: number | null = null
  let cancelled = false
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let jsQrLoad: Promise<typeof import('jsqr')> | null = null

  const BarcodeDetectorCtor =
    typeof window !== 'undefined'
      ? (window as Window & { BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike })
          .BarcodeDetector
      : undefined
  const detector = BarcodeDetectorCtor ? new BarcodeDetectorCtor({ formats: ['qr_code'] }) : null
  if (!detector && !ctx) {
    return () => {
      cancelled = true
    }
  }

  const tick = async () => {
    if (cancelled) return
    const video = params.video
    if (video.readyState < 2) {
      rafId = requestAnimationFrame(() => {
        void tick()
      })
      return
    }
    try {
      if (detector) {
        const codes = await detector.detect(video)
        const raw = String(codes?.[0]?.rawValue ?? '').trim()
        if (raw) {
          params.onScan(raw)
          return
        }
      } else if (ctx) {
        const w = video.videoWidth
        const h = video.videoHeight
        if (w > 0 && h > 0) {
          if (!jsQrLoad) jsQrLoad = import('jsqr')
          const mod = await jsQrLoad
          const jsQR = mod.default
          canvas.width = w
          canvas.height = h
          ctx.drawImage(video, 0, 0, w, h)
          const imageData = ctx.getImageData(0, 0, w, h)
          const result = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' })
          const raw = String(result?.data ?? '').trim()
          if (raw) {
            params.onScan(raw)
            return
          }
        }
      }
    } catch {
      /* ignore frame errors */
    }
    rafId = requestAnimationFrame(() => {
      void tick()
    })
  }

  void tick()

  return () => {
    cancelled = true
    if (rafId != null) cancelAnimationFrame(rafId)
  }
}

/** BarcodeDetector 또는 canvas(jsQR) 중 하나라도 사용 가능한지 */
export function canDecodeQrFromVideo(): boolean {
  if (typeof window === 'undefined') return false
  const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector
  if (BarcodeDetectorCtor) return true
  const canvas = document.createElement('canvas')
  return !!canvas.getContext('2d', { willReadFrequently: true })
}

'use client'

import * as React from 'react'
import { Camera, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

type AttendanceQrScannerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (raw: string) => void
}

export function AttendanceQrScannerDialog({
  open,
  onOpenChange,
  onScan,
}: AttendanceQrScannerDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const [error, setError] = React.useState('')
  const [supported, setSupported] = React.useState(true)

  const stopCamera = React.useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  React.useEffect(() => {
    if (!open) {
      stopCamera()
      setError('')
      return
    }

    let cancelled = false
    type BarcodeDetectorLike = {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
    }
    const BarcodeDetectorCtor =
      typeof window !== 'undefined'
        ? (window as Window & { BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike })
            .BarcodeDetector
        : undefined

    if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false)
      setError(t('attQrScanUnsupported'))
      return
    }

    setSupported(true)
    setError('')

    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] })
        const tick = async () => {
          if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(() => {
              void tick()
            })
            return
          }
          try {
            const codes = await detector.detect(videoRef.current)
            const raw = String(codes?.[0]?.rawValue ?? '').trim()
            if (raw) {
              onScan(raw)
              onOpenChange(false)
              return
            }
          } catch {
            /* ignore frame errors */
          }
          rafRef.current = requestAnimationFrame(() => {
            void tick()
          })
        }
        void tick()
      } catch {
        if (!cancelled) {
          setSupported(false)
          setError(t('attQrScanCameraDenied'))
        }
      }
    })()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open, onOpenChange, onScan, stopCamera, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            {t('attQrScanTitle')}
          </DialogTitle>
          <DialogDescription>{t('attQrScanHint')}</DialogDescription>
        </DialogHeader>
        <div className="relative overflow-hidden rounded-xl border bg-black">
          <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
          {!supported ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-white">
              {error}
            </div>
          ) : null}
        </div>
        {error && supported ? <p className="text-xs text-destructive">{error}</p> : null}
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          <X className="mr-1 h-4 w-4" />
          {t('posCancel')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

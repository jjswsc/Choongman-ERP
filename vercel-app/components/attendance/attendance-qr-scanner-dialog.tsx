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
import { canDecodeQrFromVideo, canUseQrCamera, requestQrCameraStream, startQrScanLoop } from '@/lib/qr-video-scanner'

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
  const stopScanRef = React.useRef<(() => void) | null>(null)
  const [error, setError] = React.useState('')
  const [supported, setSupported] = React.useState(true)

  const stopCamera = React.useCallback(() => {
    stopScanRef.current?.()
    stopScanRef.current = null
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

    if (!canUseQrCamera() || !canDecodeQrFromVideo()) {
      setSupported(false)
      setError(t('attQrScanUnsupported'))
      return
    }

    let cancelled = false
    setSupported(true)
    setError('')

    ;(async () => {
      try {
        const stream = await requestQrCameraStream()
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        stopScanRef.current = startQrScanLoop({
          video,
          onScan: (raw) => {
            onScan(raw)
            onOpenChange(false)
          },
        })
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

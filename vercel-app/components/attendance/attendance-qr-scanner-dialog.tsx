'use client'

import * as React from 'react'
import { Camera, RotateCcw, Settings, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ensureAndroidCameraPermission, isCapacitorAndroid, openNativeAppSettings } from '@/lib/cm-native-app'
import { useLang } from '@/lib/lang-context'
import { useT, type I18nKeys } from '@/lib/i18n'
import {
  queryWebCameraPermission,
  resolveCameraSettingsHintKey,
} from '@/lib/qr-camera-client'
import {
  canDecodeQrFromVideo,
  canUseQrCamera,
  QrCameraAccessError,
  requestQrCameraStream,
  startQrScanLoop,
} from '@/lib/qr-video-scanner'

type AttendanceQrScannerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (raw: string) => void
  titleKey?: I18nKeys
  hintKey?: I18nKeys
}

export function AttendanceQrScannerDialog({
  open,
  onOpenChange,
  onScan,
  titleKey = 'attQrScanTitle',
  hintKey = 'attQrScanHint',
}: AttendanceQrScannerDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const stopScanRef = React.useRef<(() => void) | null>(null)
  const [error, setError] = React.useState('')
  const [settingsHint, setSettingsHint] = React.useState('')
  const [supported, setSupported] = React.useState(true)
  const [cameraBlocked, setCameraBlocked] = React.useState(false)
  const [scanAttempt, setScanAttempt] = React.useState(0)

  const stopCamera = React.useCallback(() => {
    stopScanRef.current?.()
    stopScanRef.current = null
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const showCameraError = React.useCallback(
    (reason: 'denied' | 'unavailable' | 'unknown') => {
      setSupported(false)
      setCameraBlocked(reason === 'denied')
      if (reason === 'denied') {
        setSettingsHint(t(resolveCameraSettingsHintKey()))
        setError(t('attQrScanCameraDenied'))
        return
      }
      setSettingsHint('')
      if (reason === 'unavailable') {
        setError(t('attQrScanCameraUnavailable'))
      } else {
        setError(t('attQrScanUnsupported'))
      }
    },
    [t]
  )

  React.useEffect(() => {
    if (!open) {
      stopCamera()
      setError('')
      setSettingsHint('')
      setSupported(true)
      setCameraBlocked(false)
      return
    }

    if (!canUseQrCamera() || !canDecodeQrFromVideo()) {
      showCameraError('unknown')
      return
    }

    let cancelled = false
    setSupported(true)
    setError('')
    setSettingsHint('')
    setCameraBlocked(false)

    ;(async () => {
      const androidPerm = await ensureAndroidCameraPermission()
      if (cancelled) return
      if (androidPerm === false) {
        showCameraError('denied')
        return
      }

      const webPerm = await queryWebCameraPermission()
      if (cancelled) return
      if (webPerm === 'denied') {
        showCameraError('denied')
        return
      }

      try {
        const stream = await requestQrCameraStream()
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          for (const track of stream.getTracks()) track.stop()
          streamRef.current = null
          return
        }
        video.srcObject = stream
        await video.play()

        stopScanRef.current = startQrScanLoop({
          video,
          onScan: (raw) => {
            onScan(raw)
            onOpenChange(false)
          },
        })
      } catch (error) {
        if (cancelled) return
        if (error instanceof QrCameraAccessError) {
          showCameraError(error.reason)
          return
        }
        showCameraError('unknown')
      }
    })()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open, onOpenChange, onScan, scanAttempt, showCameraError, stopCamera])

  const handleRetry = () => {
    stopCamera()
    setError('')
    setSettingsHint('')
    setSupported(true)
    setCameraBlocked(false)
    setScanAttempt((n) => n + 1)
  }

  const handleOpenSettings = () => {
    void openNativeAppSettings()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            {t(titleKey)}
          </DialogTitle>
          <DialogDescription>{t(hintKey)}</DialogDescription>
        </DialogHeader>
        <div className="relative overflow-hidden rounded-xl border bg-black">
          <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
          {!supported ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-4 text-center text-sm text-white">
              <p>{error}</p>
              {cameraBlocked && settingsHint ? (
                <p className="text-xs leading-relaxed text-white/80">{settingsHint}</p>
              ) : null}
            </div>
          ) : null}
        </div>
        {error && supported ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {!supported ? (
            <>
              {cameraBlocked && isCapacitorAndroid() ? (
                <Button type="button" className="sm:flex-1" onClick={handleOpenSettings}>
                  <Settings className="mr-1 h-4 w-4" />
                  {t('attQrScanOpenSettings')}
                </Button>
              ) : null}
              <Button type="button" variant="secondary" className="sm:flex-1" onClick={handleRetry}>
                <RotateCcw className="mr-1 h-4 w-4" />
                {t('attQrScanRetry')}
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className={!supported ? 'sm:flex-1' : 'w-full'}
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-1 h-4 w-4" />
            {t('posCancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

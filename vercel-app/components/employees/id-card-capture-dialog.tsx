"use client"

import * as React from "react"
import { Camera, ImageIcon, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { ID_CARD_ASPECT, captureVideoIdCardFrame, cropFileToIdCardAspect } from "@/lib/id-card-image"
import { cn } from "@/lib/utils"

type IdCardCaptureDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (dataUrl: string) => void
}

export function IdCardCaptureDialog({ open, onOpenChange, onCapture }: IdCardCaptureDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const galleryInputRef = React.useRef<HTMLInputElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = React.useState(false)
  const [cameraBlocked, setCameraBlocked] = React.useState(false)
  const [capturing, setCapturing] = React.useState(false)

  const stopCamera = React.useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraReady(false)
  }, [])

  React.useEffect(() => {
    if (!open) {
      stopCamera()
      setCameraBlocked(false)
      setCapturing(false)
      return
    }

    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraBlocked(true)
      return
    }

    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
        await video.play().catch(() => undefined)
        setCameraReady(true)
        setCameraBlocked(false)
      } catch {
        if (!cancelled) setCameraBlocked(true)
      }
    })()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open, stopCamera])

  const handleShoot = React.useCallback(async () => {
    const video = videoRef.current
    if (!video || !cameraReady) return
    setCapturing(true)
    try {
      const dataUrl = captureVideoIdCardFrame(video)
      onCapture(dataUrl)
      onOpenChange(false)
    } catch {
      setCameraBlocked(true)
    } finally {
      setCapturing(false)
    }
  }, [cameraReady, onCapture, onOpenChange])

  const handleGalleryFile = React.useCallback(
    async (file: File | undefined) => {
      if (!file) return
      setCapturing(true)
      try {
        const dataUrl = await cropFileToIdCardAspect(file)
        onCapture(dataUrl)
        onOpenChange(false)
      } catch {
        /* ignore */
      } finally {
        setCapturing(false)
      }
    },
    [onCapture, onOpenChange]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3 p-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{t("emp_id_card_capture_title")}</DialogTitle>
          <DialogDescription className="text-xs">{t("emp_id_card_capture_hint")}</DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-black">
          {!cameraBlocked ? (
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              autoPlay
              playsInline
              muted
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              {t("emp_id_card_camera_denied")}
            </div>
          )}
          {!cameraBlocked ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={cn(
                  "rounded-sm border-2 border-dashed border-white/90",
                  "shadow-[0_0_0_9999px_rgba(0,0,0,0.48)]"
                )}
                style={{ width: "92%", aspectRatio: String(ID_CARD_ASPECT) }}
              />
            </div>
          ) : null}
        </div>

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            void handleGalleryFile(file)
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-w-0 flex-1"
            disabled={!cameraReady || capturing || cameraBlocked}
            onClick={() => void handleShoot()}
          >
            <Camera className="mr-1.5 h-4 w-4 shrink-0" />
            {t("emp_id_card_capture_shoot")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-w-0 flex-1"
            disabled={capturing}
            onClick={() => galleryInputRef.current?.click()}
          >
            <ImageIcon className="mr-1.5 h-4 w-4 shrink-0" />
            {t("emp_id_card_capture_gallery")}
          </Button>
        </div>

        {cameraBlocked ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={capturing}
            onClick={() => galleryInputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-4 w-4 shrink-0" />
            {t("emp_id_card_upload")}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

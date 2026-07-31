"use client"

import * as React from "react"
import { Camera, ImageIcon, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useErpOverlayBack } from "@/lib/erp-navigation"
import { appAlert } from "@/lib/app-message"
import { ID_CARD_ASPECT, captureVideoIdCardFrame, cropFileToIdCardAspect } from "@/lib/id-card-image"
import { cn } from "@/lib/utils"

type IdCardCaptureDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (dataUrl: string) => void
}

/**
 * Sheet(Radix Dialog) 안의 중첩 Dialog는 포커스·파일선택·갤러리 업로드가 깨질 수 있음.
 * 신분증 촬영은 고정 오버레이로 렌더해 Sheet와 Dialog를 중첩하지 않는다.
 */
export function IdCardCaptureDialog({ open, onOpenChange, onCapture }: IdCardCaptureDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const galleryInputRef = React.useRef<HTMLInputElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = React.useState(false)
  const [cameraBlocked, setCameraBlocked] = React.useState(false)
  const [capturing, setCapturing] = React.useState(false)

  useErpOverlayBack(open, onOpenChange)

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
      await appAlert(t("msg_upload_fail"))
    } finally {
      setCapturing(false)
    }
  }, [cameraReady, onCapture, onOpenChange, t])

  const handleGalleryFile = React.useCallback(
    async (file: File | undefined) => {
      if (!file) return
      setCapturing(true)
      try {
        const dataUrl = await cropFileToIdCardAspect(file)
        onCapture(dataUrl)
        onOpenChange(false)
      } catch {
        await appAlert(t("msg_upload_fail"))
      } finally {
        setCapturing(false)
      }
    },
    [onCapture, onOpenChange, t]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t("emp_id_card_capture_title")}
      onClick={() => onOpenChange(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onOpenChange(false)
      }}
    >
      <div
        className="relative w-full max-w-md rounded-lg border bg-background p-4 shadow-xl sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 space-y-1 pr-8">
          <h2 className="text-base font-semibold leading-none tracking-tight">
            {t("emp_id_card_capture_title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("emp_id_card_capture_hint")}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-2 top-2 h-8 w-8 rounded-full p-0"
          onClick={() => onOpenChange(false)}
          aria-label={t("close") || "✕"}
        >
          <X className="h-4 w-4" />
        </Button>

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

        {/* capture 속성 없음 — 데스크톱/갤러리 파일 선택용. 카메라 전용 capture는 별도 UX가 필요할 때만 */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            void handleGalleryFile(file)
          }}
        />

        <div className="mt-3 flex flex-wrap gap-2">
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
            className="mt-2 w-full"
            disabled={capturing}
            onClick={() => galleryInputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-4 w-4 shrink-0" />
            {t("emp_id_card_upload")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

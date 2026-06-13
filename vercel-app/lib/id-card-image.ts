/** ISO/IEC 7810 ID-1 (신용·신분증) 가로 비율 */
export const ID_CARD_ASPECT = 85.6 / 53.98

export type IdCardFrameRect = { x: number; y: number; w: number; h: number }

/** 카메라 프레임 안 신분증 가이드 영역(픽셀) */
export function computeIdCardFrameRect(vw: number, vh: number): IdCardFrameRect {
  const aspect = ID_CARD_ASPECT
  let w = vw * 0.92
  let h = w / aspect
  if (h > vh * 0.85) {
    h = vh * 0.85
    w = h * aspect
  }
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h }
}

function drawIdCardCrop(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  maxWidth = 1024,
  quality = 0.85
): string {
  const aspect = ID_CARD_ASPECT
  let outW = Math.round(sw)
  let outH = Math.round(sh)
  if (outW > maxWidth) {
    outW = maxWidth
    outH = Math.round(maxWidth / aspect)
  }
  const canvas = document.createElement("canvas")
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas not supported")
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH)
  return canvas.toDataURL("image/jpeg", quality)
}

/** 업로드 이미지를 신분증 비율로 중앙 크롭 */
export function cropLoadedImageToIdCardAspect(
  img: HTMLImageElement,
  maxWidth = 1024,
  quality = 0.85
): string {
  const sw = img.naturalWidth || img.width
  const sh = img.naturalHeight || img.height
  if (!sw || !sh) throw new Error("Invalid image size")
  const aspect = ID_CARD_ASPECT
  const imgAspect = sw / sh
  let cropW: number
  let cropH: number
  let cropX: number
  let cropY: number
  if (imgAspect > aspect) {
    cropH = sh
    cropW = sh * aspect
    cropX = (sw - cropW) / 2
    cropY = 0
  } else {
    cropW = sw
    cropH = sw / aspect
    cropX = 0
    cropY = (sh - cropH) / 2
  }
  return drawIdCardCrop(img, cropX, cropY, cropW, cropH, maxWidth, quality)
}

/** 라이브 카메라에서 가이드 영역만 잘라 신분증 비율로 저장 */
export function captureVideoIdCardFrame(
  video: HTMLVideoElement,
  maxWidth = 1024,
  quality = 0.85
): string {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) throw new Error("Video not ready")
  const { x, y, w, h } = computeIdCardFrameRect(vw, vh)
  return drawIdCardCrop(video, x, y, w, h, maxWidth, quality)
}

export function cropFileToIdCardAspect(file: File, maxWidth = 1024, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        resolve(cropLoadedImageToIdCardAspect(img, maxWidth, quality))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Image load failed"))
    }
    img.src = url
  })
}

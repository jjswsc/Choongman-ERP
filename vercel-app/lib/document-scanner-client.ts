/** 브라우저 전용 — OpenCV.js + jscanify 동적 로드 */

export type DocumentCornerPoints = {
  topLeftCorner: { x: number; y: number }
  topRightCorner: { x: number; y: number }
  bottomLeftCorner: { x: number; y: number }
  bottomRightCorner: { x: number; y: number }
}

type JScanifyCtor = new () => {
  findPaperContour: (img: unknown) => unknown
  getCornerPoints: (contour: unknown) => DocumentCornerPoints
  extractPaper: (
    image: HTMLImageElement | HTMLCanvasElement,
    resultWidth: number,
    resultHeight: number,
    cornerPoints?: DocumentCornerPoints
  ) => HTMLCanvasElement | null
}

declare global {
  interface Window {
    cv?: {
      Mat?: unknown
      imread: (el: HTMLImageElement | HTMLCanvasElement) => { delete: () => void }
    }
  }
}

const OPENCV_URL = "https://docs.opencv.org/4.7.0/opencv.js"

let scannerPromise: Promise<InstanceType<JScanifyCtor>> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`script_load_fail:${src}`))
    document.head.appendChild(script)
  })
}

function waitForOpenCv(): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (window.cv?.Mat) resolve()
      else setTimeout(tick, 40)
    }
    tick()
  })
}

export async function getDocumentScanner(): Promise<InstanceType<JScanifyCtor>> {
  if (typeof window === "undefined") {
    throw new Error("document_scanner_browser_only")
  }
  if (!scannerPromise) {
    scannerPromise = (async () => {
      if (!window.cv?.Mat) {
        await loadScript(OPENCV_URL)
        await waitForOpenCv()
      }
      const mod = await import("jscanify/client")
      const Ctor = (mod as { default?: JScanifyCtor }).default ?? (mod as unknown as JScanifyCtor)
      return new Ctor()
    })()
  }
  return scannerPromise
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function defaultDocumentCorners(width: number, height: number): DocumentCornerPoints {
  const m = Math.round(Math.min(width, height) * 0.04)
  return {
    topLeftCorner: { x: m, y: m },
    topRightCorner: { x: width - m, y: m },
    bottomLeftCorner: { x: m, y: height - m },
    bottomRightCorner: { x: width - m, y: height - m },
  }
}

export function estimatePaperOutputSize(corners: DocumentCornerPoints): { width: number; height: number } {
  const w = Math.max(
    dist(corners.topLeftCorner, corners.topRightCorner),
    dist(corners.bottomLeftCorner, corners.bottomRightCorner)
  )
  const h = Math.max(
    dist(corners.topLeftCorner, corners.bottomLeftCorner),
    dist(corners.topRightCorner, corners.bottomRightCorner)
  )
  const maxDim = 1600
  const scale = Math.min(1, maxDim / Math.max(w, h, 1))
  return {
    width: Math.max(320, Math.round(w * scale)),
    height: Math.max(320, Math.round(h * scale)),
  }
}

export async function detectDocumentCorners(
  image: HTMLImageElement
): Promise<DocumentCornerPoints | null> {
  const scanner = await getDocumentScanner()
  const cv = window.cv
  if (!cv) return null
  const mat = cv.imread(image)
  try {
    const contour = scanner.findPaperContour(mat)
    if (!contour) return null
    const corners = scanner.getCornerPoints(contour)
    if (
      !corners.topLeftCorner ||
      !corners.topRightCorner ||
      !corners.bottomLeftCorner ||
      !corners.bottomRightCorner
    ) {
      return null
    }
    return corners
  } finally {
    mat.delete()
  }
}

export async function warpDocumentToCanvas(
  image: HTMLImageElement,
  corners: DocumentCornerPoints
): Promise<HTMLCanvasElement | null> {
  const scanner = await getDocumentScanner()
  const { width, height } = estimatePaperOutputSize(corners)
  return scanner.extractPaper(image, width, height, corners)
}

export function canvasToJpegFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  quality = 0.88
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("canvas_blob_fail"))
          return
        }
        const base = fileName.replace(/\.[^.]+$/, "") || "receipt"
        resolve(new File([blob], `${base}-scan.jpg`, { type: "image/jpeg", lastModified: Date.now() }))
      },
      "image/jpeg",
      quality
    )
  })
}

export function isScannableImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)
}

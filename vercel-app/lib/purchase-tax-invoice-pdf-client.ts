/** Client-only: PDF 페이지를 고해상도 JPEG로 렌더 (Vercel에 native mupdf 없음). */

import { joinPdfTextItemsByLine } from '@/lib/purchase-tax-invoice-scan'

type PdfTextItem = { str?: string; transform?: number[] }

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number }
  render: (opts: {
    canvasContext: CanvasRenderingContext2D
    viewport: { width: number; height: number }
    /** [a,b,c,d,e,f] — 원점을 밀어 페이지 일부만 캔버스에 담을 때 쓴다 */
    transform?: number[]
  }) => {
    promise: Promise<void>
  }
  getTextContent?: () => Promise<{ items?: PdfTextItem[] }>
}

type PdfDoc = {
  numPages: number
  getPage: (n: number) => Promise<PdfPage>
}

type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> }
}

let pdfJsPromise: Promise<PdfJsLib> | null = null

/** A4 ~2200px wide ≈ 270dpi — 브라우저 OCR·QR용. 크롭만 보내면 매수/매도 혼동 */
export const TAX_INV_RENDER_TARGET_WIDTH_PX = 2200
export const TAX_INV_RENDER_MAX_SCALE = 3.6
export const TAX_INV_RENDER_MIN_SCALE = 1.8
export const TAX_INV_JPEG_QUALITY = 0.9
export const TAX_INV_MAX_PAGES = 160
export const TAX_INV_FULL_JPEG_MAX_CHARS = 1_400_000

function loadPdfJs(): Promise<PdfJsLib> {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser only'))
  const existing = (window as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib
  if (existing) return Promise.resolve(existing)
  if (pdfJsPromise) return pdfJsPromise
  pdfJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.async = true
    script.onload = () => {
      const lib = (window as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib
      if (!lib) {
        reject(new Error('pdf.js missing after load'))
        return
      }
      lib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      resolve(lib)
    }
    script.onerror = () => reject(new Error('pdf.js CDN load failed'))
    document.head.appendChild(script)
  })
  return pdfJsPromise
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number, maxChars = TAX_INV_FULL_JPEG_MAX_CHARS): string {
  let q = quality
  let out = canvas.toDataURL('image/jpeg', q)
  while (out.length > maxChars && q > 0.62) {
    q = Math.round((q - 0.06) * 100) / 100
    out = canvas.toDataURL('image/jpeg', q)
  }
  return out
}

function renderScaleForViewport(width: number): number {
  const desired = TAX_INV_RENDER_TARGET_WIDTH_PX / Math.max(1, width)
  return Math.min(TAX_INV_RENDER_MAX_SCALE, Math.max(TAX_INV_RENDER_MIN_SCALE, desired))
}

async function renderPageToCanvas(page: PdfPage): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 })
  const scale = renderScaleForViewport(base.width)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d missing')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

export async function openPdfFile(file: File): Promise<PdfDoc> {
  const pdfjs = await loadPdfJs()
  const data = await file.arrayBuffer()
  return pdfjs.getDocument({ data }).promise
}

export function releaseTaxInvoiceScanCanvas(canvas?: HTMLCanvasElement | null) {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

export async function renderTaxInvoicePageForScan(
  pdf: PdfDoc,
  pageNumber: number
): Promise<{ canvas: HTMLCanvasElement; images: string[] }> {
  const page = await pdf.getPage(pageNumber)
  const canvas = await renderPageToCanvas(page)
  return { canvas, images: [] }
}

/**
 * 지면 일부만 고배율로 다시 그린다.
 *
 * A4 전체를 600DPI 로 그리면 35MP 캔버스가 되어 모바일 사파리에서 그냥 실패한다.
 * 필요한 영역만 그리면 10MP 안쪽이라 안전하면서, 스캔본에 들어 있는 300DPI 텍스트 마스크의
 * 해상도를 그대로 살릴 수 있다. 2200px 로 그린 뒤 잘라 확대하는 것과는 결과가 전혀 다르다.
 */
export type TaxInvoiceRegionRect = { x0: number; y0: number; x1: number; y1: number }

export type TaxInvoiceRegionRender = {
  canvas: HTMLCanvasElement
  /** 이 영역의 왼쪽 위가 페이지 픽셀 좌표계에서 어디였나 */
  offsetX: number
  offsetY: number
  /** 이 배율에서 페이지 전체가 몇 픽셀이었나 — 좌표를 되돌릴 때 쓴다 */
  pageWidth: number
  pageHeight: number
}

export async function renderTaxInvoiceRegion(
  pdf: PdfDoc,
  pageNumber: number,
  rect: TaxInvoiceRegionRect,
  targetPageWidthPx: number
): Promise<TaxInvoiceRegionRender> {
  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: targetPageWidthPx / Math.max(1, base.width) })
  const pageWidth = Math.ceil(viewport.width)
  const pageHeight = Math.ceil(viewport.height)
  const offsetX = Math.floor(pageWidth * rect.x0)
  const offsetY = Math.floor(pageHeight * rect.y0)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(pageWidth * (rect.x1 - rect.x0)))
  canvas.height = Math.max(1, Math.ceil(pageHeight * (rect.y1 - rect.y0)))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas 2d missing')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport, transform: [1, 0, 0, 1, -offsetX, -offsetY] }).promise
  return { canvas, offsetX, offsetY, pageWidth, pageHeight }
}

export async function extractPdfPageText(pdf: PdfDoc, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber)
  if (!page.getTextContent) return ''
  try {
    const content = await page.getTextContent()
    return joinPdfTextItemsByLine(content.items || []).slice(0, 8000)
  } catch {
    return ''
  }
}

const TAX_INV_PREVIEW_WIDTH_PX = 900

/** 검수 시 원본 대조용 — OCR보다 작은 JPEG */
export async function renderTaxInvoicePagePreview(pdf: PdfDoc, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(1.8, Math.max(0.7, TAX_INV_PREVIEW_WIDTH_PX / Math.max(1, base.width)))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d missing')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvasToJpeg(canvas, 0.72, 700_000)
}

export async function renderPdfPagesToJpegDataUrls(
  file: File,
  opts?: { maxPages?: number; scale?: number; quality?: number }
): Promise<string[]> {
  const maxPages = Math.min(TAX_INV_MAX_PAGES, Math.max(1, Math.floor(opts?.maxPages || 120)))
  const quality = Math.min(0.92, Math.max(0.5, Number(opts?.quality) || TAX_INV_JPEG_QUALITY))
  const pdf = await openPdfFile(file)
  const pages = Math.min(pdf.numPages, maxPages)
  const out: string[] = []
  for (let i = 1; i <= pages; i += 1) {
    const page = await pdf.getPage(i)
    const canvas = await renderPageToCanvas(page)
    out.push(canvasToJpeg(canvas, quality))
  }
  return out
}

export function fileToImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('file read failed'))
    reader.readAsDataURL(file)
  })
}

function canvasFromImageSource(
  srcW: number,
  srcH: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
): HTMLCanvasElement {
  const scale =
    srcW < 1400
      ? Math.min(2, TAX_INV_RENDER_TARGET_WIDTH_PX / Math.max(1, srcW))
      : Math.min(1, TAX_INV_RENDER_TARGET_WIDTH_PX / Math.max(1, srcW))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(srcW * scale))
  canvas.height = Math.max(1, Math.round(srcH * scale))
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    draw(ctx, canvas.width, canvas.height)
  }
  return canvas
}

async function loadImageWithExifOrientation(file: File): Promise<{
  width: number
  height: number
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  close?: () => void
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        close: () => bitmap.close(),
      }
    } catch {
      /* EXIF 미지원·코덱 실패 시 Image 폴백 */
    }
  }
  const dataUrl = await fileToImageDataUrl(file)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('image load failed'))
    el.src = dataUrl
  })
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
  }
}

export async function imageFileToTaxInvoiceScan(file: File): Promise<{ canvas: HTMLCanvasElement; images: string[] }> {
  const loaded = await loadImageWithExifOrientation(file)
  try {
    const canvas = canvasFromImageSource(loaded.width, loaded.height, loaded.draw)
    return { canvas, images: [canvasToJpeg(canvas, 0.72, 700_000)] }
  } finally {
    loaded.close?.()
  }
}

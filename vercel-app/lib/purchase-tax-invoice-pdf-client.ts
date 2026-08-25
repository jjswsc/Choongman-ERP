/** Client-only: PDF 페이지를 고해상도 JPEG로 렌더 (Vercel에 native mupdf 없음). */

type PdfTextItem = { str?: string }

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number }
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
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

/** A4 ~2200px wide ≈ 270dpi — 전페이지를 Vision에 그대로 넘김 (크롭만 보내면 매수/매도 혼동) */
export const TAX_INV_RENDER_TARGET_WIDTH_PX = 2200
export const TAX_INV_RENDER_MAX_SCALE = 3.6
export const TAX_INV_RENDER_MIN_SCALE = 1.8
export const TAX_INV_JPEG_QUALITY = 0.9
export const TAX_INV_MAX_PAGES = 160
export const TAX_INV_FULL_JPEG_MAX_CHARS = 1_400_000
export const TAX_INV_CROP_JPEG_MAX_CHARS = 800_000
/** 합계란 확대용. 전페이지가 소스 오브 트루스 */
export const TAX_INV_BOTTOM_CROP_START = 0.62

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

function cropCanvas(src: HTMLCanvasElement, y0Ratio: number, y1Ratio: number): HTMLCanvasElement {
  const y0 = Math.max(0, Math.floor(src.height * y0Ratio))
  const y1 = Math.min(src.height, Math.ceil(src.height * y1Ratio))
  const h = Math.max(1, y1 - y0)
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = h
  const ctx = c.getContext('2d')
  if (ctx) ctx.drawImage(src, 0, y0, src.width, h, 0, 0, src.width, h)
  return c
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

function visionImagesFromPageCanvas(canvas: HTMLCanvasElement, quality = TAX_INV_JPEG_QUALITY): string[] {
  const full = canvasToJpeg(canvas, quality, TAX_INV_FULL_JPEG_MAX_CHARS)
  const tall = canvas.height > canvas.width * 1.15
  if (!tall) return [full]
  const bottom = cropCanvas(canvas, TAX_INV_BOTTOM_CROP_START, 1)
  return [full, canvasToJpeg(bottom, Math.min(0.92, quality + 0.02), TAX_INV_CROP_JPEG_MAX_CHARS)]
}

export async function openPdfFile(file: File): Promise<PdfDoc> {
  const pdfjs = await loadPdfJs()
  const data = await file.arrayBuffer()
  return pdfjs.getDocument({ data }).promise
}

export async function renderTaxInvoicePageForScan(
  pdf: PdfDoc,
  pageNumber: number
): Promise<{ canvas: HTMLCanvasElement; images: string[] }> {
  const page = await pdf.getPage(pageNumber)
  const canvas = await renderPageToCanvas(page)
  return { canvas, images: visionImagesFromPageCanvas(canvas) }
}

/** 한 페이지 → 전체 JPEG + (세로가 길면) 하단 합계 확대. */
export async function renderTaxInvoicePageCrops(pdf: PdfDoc, pageNumber: number): Promise<string[]> {
  return (await renderTaxInvoicePageForScan(pdf, pageNumber)).images
}

export async function extractPdfPageText(pdf: PdfDoc, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber)
  if (!page.getTextContent) return ''
  try {
    const content = await page.getTextContent()
    return (content.items || [])
      .map((item) => String(item.str || '').trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, 8000)
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

export async function imageFileToTaxInvoiceScan(file: File): Promise<{ canvas: HTMLCanvasElement; images: string[] }> {
  const dataUrl = await fileToImageDataUrl(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const srcW = img.naturalWidth || img.width
      const srcH = img.naturalHeight || img.height
      const scale =
        srcW < 1400
          ? Math.min(2, TAX_INV_RENDER_TARGET_WIDTH_PX / Math.max(1, srcW))
          : Math.min(1, TAX_INV_RENDER_TARGET_WIDTH_PX / Math.max(1, srcW))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(srcW * scale))
      canvas.height = Math.max(1, Math.round(srcH * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve({ canvas, images: [dataUrl] })
        return
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve({ canvas, images: visionImagesFromPageCanvas(canvas) })
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
}

export async function imageFileToTaxInvoiceCrops(file: File): Promise<string[]> {
  return (await imageFileToTaxInvoiceScan(file)).images
}

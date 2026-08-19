/** Client-only: render scanned PDF pages to JPEG data URLs for Vision (no native mupdf on Vercel). */

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number }
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
    promise: Promise<void>
  }
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

export async function renderPdfPagesToJpegDataUrls(
  file: File,
  opts?: { maxPages?: number; scale?: number; quality?: number }
): Promise<string[]> {
  const maxPages = Math.min(200, Math.max(1, Math.floor(opts?.maxPages || 120)))
  const scale = Math.min(2.2, Math.max(1, Number(opts?.scale) || 1.5))
  const quality = Math.min(0.92, Math.max(0.5, Number(opts?.quality) || 0.72))
  const pdfjs = await loadPdfJs()
  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const pages = Math.min(pdf.numPages, maxPages)
  const out: string[] = []
  for (let i = 1; i <= pages; i += 1) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvasContext: ctx, viewport }).promise
    out.push(canvas.toDataURL('image/jpeg', quality))
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

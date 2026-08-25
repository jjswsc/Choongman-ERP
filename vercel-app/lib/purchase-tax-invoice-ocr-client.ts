/**
 * 브라우저 전용 — 복합기/Adobe처럼 스캔 이미지에서 글자층을 만듦 (Tesseract 태국어+영어).
 * 합계는 숫자 전용 OCR, QR이 있으면 페이로드를 함께 붙임.
 */

const TESS_JS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1'
const TESS_CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0'
const TESS_LANG = 'https://tessdata.projectnaptha.com/4.0.0_best'

type TessWorker = {
  setParameters: (p: Record<string, string>) => Promise<void>
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text?: string } }>
  terminate: () => Promise<void>
}

type CreateWorkerFn = (
  langs: string,
  oem: number,
  opts: {
    workerPath: string
    corePath: string
    langPath: string
    workerBlobURL?: boolean
    logger?: (m: { status?: string; progress?: number }) => void
  }
) => Promise<TessWorker>

export type TaxInvoiceOcrSession = {
  recognize: (canvas: HTMLCanvasElement) => Promise<string>
  terminate: () => Promise<void>
}

function cropRatio(src: HTMLCanvasElement, y0: number, y1: number, x0 = 0, x1 = 1): HTMLCanvasElement {
  const left = Math.max(0, Math.floor(src.width * x0))
  const right = Math.min(src.width, Math.ceil(src.width * x1))
  const top = Math.max(0, Math.floor(src.height * y0))
  const bot = Math.min(src.height, Math.ceil(src.height * y1))
  const c = document.createElement('canvas')
  c.width = Math.max(1, right - left)
  c.height = Math.max(1, bot - top)
  const ctx = c.getContext('2d')
  if (ctx) ctx.drawImage(src, left, top, c.width, c.height, 0, 0, c.width, c.height)
  return c
}

function scaleCanvas(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale === 1) return src
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(src.width * scale))
  c.height = Math.max(1, Math.round(src.height * scale))
  const ctx = c.getContext('2d')
  if (!ctx) return src
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

function otsuThreshold(hist: Uint32Array, total: number): number {
  let sum = 0
  for (let i = 0; i < 256; i += 1) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let max = 0
  let threshold = 160
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > max) {
      max = between
      threshold = t
    }
  }
  return threshold
}

/** 회색조 + Otsu 이진화 — 복합기 스캔의 흐릿한 숫자를 또렷하게 */
function preprocessForOcr(src: HTMLCanvasElement): HTMLCanvasElement {
  const maxW = 2200
  const scale = src.width > maxW ? maxW / src.width : 1
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(src.width * scale))
  c.height = Math.max(1, Math.round(src.height * scale))
  const ctx = c.getContext('2d')
  if (!ctx) return src
  ctx.filter = 'grayscale(1) contrast(1.25)'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  ctx.filter = 'none'
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const { data } = img
  const hist = new Uint32Array(256)
  const n = data.length / 4
  for (let i = 0; i < data.length; i += 4) hist[data[i]] += 1
  const t = otsuThreshold(hist, n)
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > t ? 255 : 0
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return c
}

async function decodeQrFromCanvas(src: HTMLCanvasElement): Promise<string> {
  try {
    const mod = await import('jsqr')
    const jsQR = mod.default
    const maxW = 900
    const scale = Math.min(1, maxW / Math.max(1, src.width))
    const c = scale === 1 ? src : scaleCanvas(src, scale)
    const ctx = c.getContext('2d')
    if (!ctx) return ''
    const image = ctx.getImageData(0, 0, c.width, c.height)
    const hit =
      jsQR(image.data, c.width, c.height, { inversionAttempts: 'attemptBoth' }) ||
      jsQR(image.data, c.width, c.height, { inversionAttempts: 'invertFirst' })
    return String(hit?.data || '').trim()
  } catch {
    return ''
  }
}

async function loadCreateWorker(): Promise<CreateWorkerFn> {
  const mod = (await import('tesseract.js')) as unknown as {
    createWorker?: CreateWorkerFn
    default?: { createWorker?: CreateWorkerFn }
  }
  const fn = mod.createWorker || mod.default?.createWorker
  if (!fn) throw new Error('tesseract_createWorker_missing')
  return fn
}

export async function createTaxInvoiceOcrSession(): Promise<TaxInvoiceOcrSession> {
  if (typeof window === 'undefined') throw new Error('ocr_browser_only')
  const createWorker = await loadCreateWorker()
  const opts = {
    workerPath: `${TESS_JS}/dist/worker.min.js`,
    corePath: `${TESS_CORE}/tesseract-core-simd.wasm.js`,
    langPath: TESS_LANG,
    workerBlobURL: false as const,
  }
  // 숫자 whitelist를 같은 워커에 넣으면 다음 페이지 태국어 인식이 깨질 수 있어 워커를 나눔.
  const thaiWorker = await createWorker('tha+eng', 1, opts)
  const digitWorker = await createWorker('eng', 1, opts)
  await thaiWorker.setParameters({
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
  })
  await digitWorker.setParameters({
    tessedit_pageseg_mode: '6',
    tessedit_char_whitelist: '0123456789.,:-/',
    preserve_interword_spaces: '1',
  })

  const readThai = async (image: HTMLCanvasElement) => {
    const r = await thaiWorker.recognize(image)
    return String(r.data.text || '').trim()
  }
  const readDigits = async (image: HTMLCanvasElement) => {
    const r = await digitWorker.recognize(image)
    return String(r.data.text || '').trim()
  }

  return {
    recognize: async (canvas) => {
      const qr = await decodeQrFromCanvas(canvas)
      const prepared = preprocessForOcr(canvas)
      const parts: string[] = []
      if (qr) parts.push(`===QR===\n${qr}`)
      parts.push(`===FULL===\n${await readThai(prepared)}`)
      if (prepared.height > prepared.width * 1.05) {
        parts.push(`===HEADER===\n${await readThai(cropRatio(prepared, 0, 0.42))}`)
        const totals = cropRatio(prepared, 0.58, 1, 0.42, 1)
        const totalsHi = scaleCanvas(totals, 1.55)
        parts.push(`===TOTALS===\n${await readThai(totalsHi)}`)
        parts.push(`===TOTALS_DIGITS===\n${await readDigits(totalsHi)}`)
      } else {
        const totalsHi = scaleCanvas(cropRatio(prepared, 0.55, 1), 1.4)
        parts.push(`===TOTALS===\n${await readThai(totalsHi)}`)
        parts.push(`===TOTALS_DIGITS===\n${await readDigits(totalsHi)}`)
      }
      return parts.filter((p) => !p.endsWith('===\n')).join('\n')
    },
    terminate: async () => {
      await Promise.all([thaiWorker.terminate(), digitWorker.terminate()])
    },
  }
}

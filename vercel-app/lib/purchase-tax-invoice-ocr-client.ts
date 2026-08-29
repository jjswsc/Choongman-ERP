/**
 * 브라우저 전용 — 복합기/Adobe처럼 스캔 이미지에서 글자층을 만듦 (Tesseract 태국어+영어).
 * 합계는 숫자 전용 OCR, QR이 있으면 페이로드를 함께 붙임.
 */

import type { OcrLineBox, OcrWordBox } from './purchase-tax-invoice-layout'

const TESS_JS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1'
const TESS_CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0'
/** best: GPT 없이 스캔본을 읽으므로 정확도 우선. 태국어 데이터는 최초 1회 다운로드. */
const TESS_LANG = 'https://tessdata.projectnaptha.com/4.0.0_best'

type TessBox = { x0: number; y0: number; x1: number; y1: number }
type TessWord = { text?: string; confidence?: number; bbox?: TessBox }
type TessLine = { text?: string; confidence?: number; bbox?: TessBox; words?: TessWord[] }
type TessBlock = { paragraphs?: { lines?: TessLine[] }[] }

type TessWorker = {
  setParameters: (p: Record<string, string>) => Promise<void>
  recognize: (
    image: HTMLCanvasElement,
    options?: Record<string, unknown>,
    output?: { text?: boolean; blocks?: boolean }
  ) => Promise<{ data: { text?: string; blocks?: TessBlock[] } }>
  terminate: () => Promise<void>
}

type CreateWorkerFn = (
  langs: string,
  oem?: number,
  opts?: {
    workerPath?: string
    corePath?: string
    langPath?: string
    workerBlobURL?: boolean
    logger?: (m: { status?: string; progress?: number }) => void
  }
) => Promise<TessWorker>

export type TaxInvoiceOcrSession = {
  recognize: (
    canvas: HTMLCanvasElement,
    opts?: { skipQr?: boolean; enough?: (text: string) => boolean }
  ) => Promise<string>
  recognizeSparseCrops: (canvas: HTMLCanvasElement) => Promise<string>
  /** 글자 위치까지 돌려준다 — 라벨 옆 값을 좌표로 고르기 위한 판독 */
  recognizeBoxes: (
    canvas: HTMLCanvasElement,
    opts?: { psm?: string; enhance?: boolean }
  ) => Promise<{ text: string; lines: OcrLineBox[] }>
  terminate: () => Promise<void>
}

function scaleOcrLines(lines: OcrLineBox[], scale: number): OcrLineBox[] {
  const s = (v: number) => Math.round(v * scale)
  return lines.map((l) => ({
    ...l,
    x0: s(l.x0),
    y0: s(l.y0),
    x1: s(l.x1),
    y1: s(l.y1),
    words: l.words.map((w) => ({ ...w, x0: s(w.x0), y0: s(w.y0), x1: s(w.x1), y1: s(w.y1) })),
  }))
}

function linesFromTesseractBlocks(blocks: TessBlock[] | undefined): OcrLineBox[] {
  const out: OcrLineBox[] = []
  for (const block of blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const words: OcrWordBox[] = []
        for (const w of line.words || []) {
          const text = String(w.text || '').trim()
          if (!text || !w.bbox) continue
          words.push({
            text,
            conf: Math.round(Number(w.confidence) || 0),
            x0: Math.round(w.bbox.x0),
            y0: Math.round(w.bbox.y0),
            x1: Math.round(w.bbox.x1),
            y1: Math.round(w.bbox.y1),
          })
        }
        if (!words.length || !line.bbox) continue
        out.push({
          text: String(line.text || '').trim(),
          conf: Math.round(Number(line.confidence) || 0),
          x0: Math.round(line.bbox.x0),
          y0: Math.round(line.bbox.y0),
          x1: Math.round(line.bbox.x1),
          y1: Math.round(line.bbox.y1),
          words: words.sort((a, b) => a.x0 - b.x0),
        })
      }
    }
  }
  return out
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

/** 회색조 + 대비 — 태국어 성조·모음은 Otsu 이진화하면 사라지는 경우가 많음 */
function preprocessForThai(src: HTMLCanvasElement, maxW = 1800): HTMLCanvasElement {
  const scale = src.width > maxW ? maxW / src.width : 1
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(src.width * scale))
  c.height = Math.max(1, Math.round(src.height * scale))
  const ctx = c.getContext('2d')
  if (!ctx) return src
  ctx.filter = 'grayscale(1) contrast(1.3) brightness(1.04)'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  ctx.filter = 'none'
  return c
}

/** 회색조 + Otsu 이진화 — 합계 숫자 전용 */
function preprocessForOcr(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = preprocessForThai(src)
  const ctx = c.getContext('2d')
  if (!ctx) return src
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

type JsQrFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts?: { inversionAttempts?: string }
) => { data?: string } | null

let jsQrFn: JsQrFn | null | undefined
let zxingReader: { decodeFromCanvas: (c: HTMLCanvasElement) => { getText: () => string } } | null | undefined

async function loadJsQr(): Promise<JsQrFn | null> {
  if (jsQrFn !== undefined) return jsQrFn
  try {
    const mod = await import('jsqr')
    jsQrFn = mod.default as JsQrFn
  } catch {
    jsQrFn = null
  }
  return jsQrFn
}

async function loadZxingReader() {
  if (zxingReader !== undefined) return zxingReader
  try {
    const mod = await import('@zxing/browser')
    zxingReader = new mod.BrowserQRCodeReader()
  } catch {
    zxingReader = null
  }
  return zxingReader
}

function copyCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const ctx = c.getContext('2d')
  if (ctx) ctx.drawImage(src, 0, 0)
  return c
}

function invertCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = copyCanvas(src)
  const ctx = c.getContext('2d')
  if (!ctx) return src
  const img = ctx.getImageData(0, 0, c.width, c.height)
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 255 - img.data[i]
    img.data[i + 1] = 255 - img.data[i + 1]
    img.data[i + 2] = 255 - img.data[i + 2]
  }
  ctx.putImageData(img, 0, 0)
  return c
}

function contrastCanvas(src: HTMLCanvasElement, amount: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const ctx = c.getContext('2d')
  if (!ctx) return src
  ctx.filter = `contrast(${amount}) brightness(1.06)`
  ctx.drawImage(src, 0, 0)
  ctx.filter = 'none'
  return c
}

function sampleLuminanceMean(src: HTMLCanvasElement): number {
  const ctx = src.getContext('2d')
  if (!ctx) return 200
  const { width, height } = src
  const step = Math.max(1, Math.floor(Math.min(width, height) / 48))
  const img = ctx.getImageData(0, 0, width, height)
  let sum = 0
  let n = 0
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      sum += img.data[(y * width + x) * 4]
      n += 1
    }
  }
  return n ? sum / n : 200
}

/** 어두운 배경(폰 야간 사진)이면 반전. 흰 전자 PDF는 그대로. */
export function prepareTaxInvoiceScanCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const deskewed = deskewTaxInvoiceCanvas(src)
  return sampleLuminanceMean(deskewed) < 108 ? invertCanvas(deskewed) : deskewed
}

function qrEnhanceCrops(src: HTMLCanvasElement): HTMLCanvasElement[] {
  const corners = [
    cropRatio(src, 0, 0.32, 0.68, 1),
    cropRatio(src, 0, 0.38, 0, 0.42),
    cropRatio(src, 0, 0.42, 0.55, 1),
    cropRatio(src, 0.58, 1, 0.55, 1),
  ]
  const out: HTMLCanvasElement[] = []
  for (const c of corners) {
    const hi = c.width < 280 ? scaleCanvas(c, 2.3) : c.width < 420 ? scaleCanvas(c, 1.55) : c
    out.push(hi)
    out.push(contrastCanvas(hi, 1.85))
    out.push(invertCanvas(hi))
    out.push(preprocessForOcr(hi))
  }
  return out
}

function qrCornerCrops(src: HTMLCanvasElement): HTMLCanvasElement[] {
  const corners = [
    cropRatio(src, 0, 0.32, 0.68, 1),
    cropRatio(src, 0, 0.38, 0, 0.42),
    cropRatio(src, 0, 0.42, 0.55, 1),
    cropRatio(src, 0.58, 1, 0.55, 1),
  ]
  return corners.map((c) => (c.width > 720 ? scaleCanvas(c, 720 / c.width) : c))
}

function qrWideCrops(src: HTMLCanvasElement): HTMLCanvasElement[] {
  const maxW = 1200
  const scale = Math.min(1, maxW / Math.max(1, src.width))
  const full = scale === 1 ? src : scaleCanvas(src, scale)
  return [cropRatio(full, 0, 0.52), cropRatio(full, 0.48, 1), full]
}

function decodeWithJsQr(jsQR: JsQrFn, canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const hit = jsQR(image.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' })
  return String(hit?.data || '').trim()
}

function decodeWithZxing(
  reader: { decodeFromCanvas: (c: HTMLCanvasElement) => { getText: () => string } },
  canvas: HTMLCanvasElement
): string {
  try {
    return String(reader.decodeFromCanvas(canvas).getText() || '').trim()
  } catch {
    return ''
  }
}

/** 글자층이 완전해도 호출 — Tesseract보다 싸고 TIN/번호가 정확함 */
export async function decodeTaxInvoiceQrsFromCanvas(src: HTMLCanvasElement): Promise<string[]> {
  const found: string[] = []
  const add = (hit: string) => {
    const s = String(hit || '').trim()
    if (s && !found.includes(s)) found.push(s)
  }
  const tryCrops = async (candidates: HTMLCanvasElement[], allowZxing: boolean) => {
    const jsQR = await loadJsQr()
    if (jsQR) {
      for (const c of candidates) {
        add(decodeWithJsQr(jsQR, c))
        if (found.length >= 2) return
      }
    }
    if (found.length >= 1 || !allowZxing) return
    const reader = await loadZxingReader()
    if (reader) {
      for (const c of candidates) {
        add(decodeWithZxing(reader, c))
        if (found.length >= 2) return
      }
    }
  }
  const corners = qrCornerCrops(src)
  await tryCrops(corners, true)
  if (found.length >= 1) return found.slice(0, 2)
  await tryCrops(qrEnhanceCrops(src), true)
  if (found.length >= 1) return found.slice(0, 2)
  await tryCrops(qrWideCrops(src), true)
  return found.slice(0, 2)
}

export async function decodeTaxInvoiceQrFromCanvas(src: HTMLCanvasElement): Promise<string> {
  return (await decodeTaxInvoiceQrsFromCanvas(src))[0] || ''
}

const SKEW_RAD = Math.PI / 180

/** 수평 투영 분산이 최대인 각 — 폰 사진 기울기. */
export function estimateSkewDegrees(gray: Uint8Array, width: number, height: number): number {
  let bestDeg = 0
  let bestVar = -1
  for (let deg = -4; deg <= 4.01; deg += 0.5) {
    const hist: number[] = []
    const rad = deg * SKEW_RAD
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const cx = width / 2
    const cy = height / 2
    for (let y = 0; y < height; y += 2) {
      let dark = 0
      for (let x = 0; x < width; x += 2) {
        const dx = x - cx
        const dy = y - cy
        const sx = Math.round(cx + dx * cos + dy * sin)
        const sy = Math.round(cy - dx * sin + dy * cos)
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
        if (gray[sy * width + sx] < 140) dark += 1
      }
      hist.push(dark)
    }
    const n = hist.length || 1
    const mean = hist.reduce((a, b) => a + b, 0) / n
    let v = 0
    for (const h of hist) v += (h - mean) * (h - mean)
    if (v > bestVar) {
      bestVar = v
      bestDeg = deg
    }
  }
  return Math.abs(bestDeg) < 1.1 ? 0 : bestDeg
}

function rotateCanvas(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const rad = deg * SKEW_RAD
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const w = Math.max(1, Math.ceil(src.width * cos + src.height * sin))
  const h = Math.max(1, Math.ceil(src.width * sin + src.height * cos))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return src
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.translate(w / 2, h / 2)
  ctx.rotate(rad)
  ctx.drawImage(src, -src.width / 2, -src.height / 2)
  return c
}

export function deskewTaxInvoiceCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const maxW = 900
  const scale = src.width > maxW ? maxW / src.width : 1
  const small = scale === 1 ? src : scaleCanvas(src, scale)
  const ctx = small.getContext('2d')
  if (!ctx) return src
  const img = ctx.getImageData(0, 0, small.width, small.height)
  const gray = new Uint8Array(small.width * small.height)
  for (let i = 0, p = 0; i < img.data.length; i += 4, p += 1) gray[p] = img.data[i]
  const deg = estimateSkewDegrees(gray, small.width, small.height)
  if (!deg) return src
  return rotateCanvas(src, -deg)
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
  const cdnOpts = {
    workerPath: `${TESS_JS}/dist/worker.min.js`,
    corePath: `${TESS_CORE}/tesseract-core-simd.wasm.js`,
    langPath: TESS_LANG,
    workerBlobURL: false as const,
  }
  const make = async (langs: string) => {
    try {
      return await createWorker(langs, 1, { langPath: TESS_LANG })
    } catch {
      return createWorker(langs, 1, cdnOpts)
    }
  }
  const [thaiWorker, digitWorkerReady] = await Promise.all([make('tha+eng'), make('eng')])
  let digitWorker: TessWorker | null = digitWorkerReady
  let headerAlnumWorker: TessWorker | null = null
  await Promise.all([
    thaiWorker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
    }),
    digitWorker.setParameters({
      tessedit_pageseg_mode: '6',
      tessedit_char_whitelist: '0123456789.,:-/',
      preserve_interword_spaces: '1',
    }),
  ])

  const readThai = async (image: HTMLCanvasElement) => {
    const r = await thaiWorker.recognize(image)
    return String(r.data.text || '').trim()
  }
  const getDigitWorker = async () => {
    if (!digitWorker) {
      digitWorker = await make('eng')
      await digitWorker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: '0123456789.,:-/',
        preserve_interword_spaces: '1',
      })
    }
    return digitWorker
  }
  const getHeaderAlnumWorker = async () => {
    if (!headerAlnumWorker) {
      headerAlnumWorker = await make('eng')
      await headerAlnumWorker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/.',
        preserve_interword_spaces: '1',
      })
    }
    return headerAlnumWorker
  }
  const readDigits = async (image: HTMLCanvasElement) => {
    const r = await (await getDigitWorker()).recognize(image)
    return String(r.data.text || '').trim()
  }
  const readHeaderAlnum = async (image: HTMLCanvasElement) => {
    const r = await (await getHeaderAlnumWorker()).recognize(image)
    return String(r.data.text || '').trim()
  }
  const joined = (parts: string[]) => parts.filter((p) => !p.endsWith('===\n')).join('\n')

  return {
    recognize: async (canvas, opts) => {
      const enough = (parts: string[]) => (opts?.enough ? opts.enough(joined(parts)) : false)
      const qr = opts?.skipQr ? '' : await decodeTaxInvoiceQrFromCanvas(canvas)
      const parts: string[] = []
      if (qr) parts.push(`===QR===\n${qr}`)
      if (enough(parts)) return joined(parts)

      const portrait = canvas.height > canvas.width * 1.05
      const headerSrc = preprocessForThai(cropRatio(canvas, 0, 0.42))
      const totalsBin = scaleCanvas(
        preprocessForOcr(portrait ? cropRatio(canvas, 0.58, 1, 0.42, 1) : cropRatio(canvas, 0.55, 1)),
        portrait ? 1.55 : 1.4
      )
      const [headerText, totalsDigitText] = await Promise.all([readThai(headerSrc), readDigits(totalsBin)])
      parts.push(`===HEADER===\n${headerText}`)
      parts.push(`===TOTALS_DIGITS===\n${totalsDigitText}`)
      if (enough(parts)) return joined(parts)

      const headerAlnum = scaleCanvas(cropRatio(headerSrc, 0, 1), 1.4)
      const totalsThai = scaleCanvas(
        preprocessForThai(portrait ? cropRatio(canvas, 0.58, 1, 0.42, 1) : cropRatio(canvas, 0.55, 1)),
        portrait ? 1.55 : 1.4
      )
      const [headerDigitText, totalsText] = await Promise.all([readHeaderAlnum(headerAlnum), readThai(totalsThai)])
      parts.push(`===HEADER_DIGITS===\n${headerDigitText}`)
      parts.push(`===TOTALS===\n${totalsText}`)
      if (enough(parts)) return joined(parts)

      parts.push(`===FULL===\n${await readThai(preprocessForThai(canvas))}`)
      return joined(parts)
    },
    recognizeBoxes: async (canvas, opts) => {
      const psm = opts?.psm || '6'
      // 축소는 절대 하지 않는다 — 줄이면 작게 찍힌 번호·금액이 다시 통째로 사라진다
      const image = opts?.enhance ? preprocessForThai(canvas, canvas.width) : canvas
      if (psm !== '6') await thaiWorker.setParameters({ tessedit_pageseg_mode: psm })
      try {
        const r = await thaiWorker.recognize(image, {}, { text: true, blocks: true })
        const scale = canvas.width / Math.max(1, image.width)
        const lines = linesFromTesseractBlocks(r.data.blocks)
        return {
          text: String(r.data.text || '').trim(),
          lines: scale === 1 ? lines : scaleOcrLines(lines, scale),
        }
      } finally {
        if (psm !== '6') await thaiWorker.setParameters({ tessedit_pageseg_mode: '6' })
      }
    },
    recognizeSparseCrops: async (canvas) => {
      const portrait = canvas.height > canvas.width * 1.05
      const header = preprocessForThai(cropRatio(canvas, 0, 0.42))
      const totals = scaleCanvas(
        preprocessForThai(portrait ? cropRatio(canvas, 0.58, 1, 0.42, 1) : cropRatio(canvas, 0.55, 1)),
        portrait ? 1.55 : 1.4
      )
      await thaiWorker.setParameters({
        tessedit_pageseg_mode: '4',
        preserve_interword_spaces: '1',
      })
      try {
        const [headerText, headerAlnum] = await Promise.all([
          readThai(header),
          readHeaderAlnum(scaleCanvas(header, 1.4)),
        ])
        const totalsText = await readThai(totals)
        return [
          `===HEADER_PSM4===\n${headerText}`,
          `===HEADER_DIGITS===\n${headerAlnum}`,
          `===TOTALS_PSM4===\n${totalsText}`,
        ]
          .filter((p) => !p.endsWith('===\n'))
          .join('\n')
      } finally {
        await thaiWorker.setParameters({
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1',
        })
      }
    },
    terminate: async () => {
      await Promise.all([
        thaiWorker.terminate(),
        digitWorker ? digitWorker.terminate() : Promise.resolve(),
        headerAlnumWorker ? headerAlnumWorker.terminate() : Promise.resolve(),
      ])
    },
  }
}

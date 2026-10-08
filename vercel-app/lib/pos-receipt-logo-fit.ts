/**
 * 영수증 로고를 인쇄 칸에 맞춘다.
 * 저장된 원본은 건드리지 않고, 인쇄·미리보기에 넣는 그림만 만든다.
 * 정사각 파일의 위아래 빈 칸이 80mm 열전사에서 본문을 오른쪽으로 미는 것을 막는다.
 */

export type ReceiptLogoSize = 'sm' | 'md' | 'lg'

/** 로고 가로 상한(CSS px). 기존 sm/md/lg 폭과 같다. */
export const RECEIPT_LOGO_MAX_WIDTH_PX: Record<ReceiptLogoSize, number> = {
  sm: 84,
  md: 108,
  lg: 132,
}

/**
 * 로고 세로 상한(CSS px).
 * Large 가로(132px≈35mm)까지 정사각으로 두면 빈 칸이 본문을 민다.
 * 판다처럼 칸을 채운 로고(Large 약 28mm)는 이 상한 안에 들어온다.
 */
export const RECEIPT_LOGO_MAX_HEIGHT_PX: Record<ReceiptLogoSize, number> = {
  sm: 64,
  md: 84,
  lg: 108,
}

/** 가장자리만 배경으로 본다. 이보다 어두운 픽셀은 로고다. */
export const RECEIPT_LOGO_WHITE_MIN = 250
export const RECEIPT_LOGO_ALPHA_MIN = 16
/** 자른 뒤 남기는 여백(원본 픽셀). 안티앨리어싱이 잘리지 않게. */
export const RECEIPT_LOGO_CROP_PAD_PX = 4

export type ReceiptLogoCrop = { x: number; y: number; w: number; h: number }

export function isReceiptLogoBackgroundPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < RECEIPT_LOGO_ALPHA_MIN) return true
  return r >= RECEIPT_LOGO_WHITE_MIN && g >= RECEIPT_LOGO_WHITE_MIN && b >= RECEIPT_LOGO_WHITE_MIN
}

/** 투명·거의 흰색이 아닌 픽셀의 테두리. 안쪽 흰 글자는 유지한다. 전부 배경이면 null. */
export function receiptLogoContentBounds(
  width: number,
  height: number,
  data: Uint8ClampedArray
): ReceiptLogoCrop | null {
  const w = Math.max(0, Math.trunc(width))
  const h = Math.max(0, Math.trunc(height))
  if (w < 1 || h < 1) return null
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  const rowStride = w * 4
  for (let y = 0; y < h; y++) {
    const row = y * rowStride
    for (let x = 0; x < w; x++) {
      const i = row + x * 4
      if (isReceiptLogoBackgroundPixel(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0)) {
        continue
      }
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0 || maxY < 0) return null
  const x0 = Math.max(0, minX - RECEIPT_LOGO_CROP_PAD_PX)
  const y0 = Math.max(0, minY - RECEIPT_LOGO_CROP_PAD_PX)
  const x1 = Math.min(w - 1, maxX + RECEIPT_LOGO_CROP_PAD_PX)
  const y1 = Math.min(h - 1, maxY + RECEIPT_LOGO_CROP_PAD_PX)
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** 비율 유지. 칸보다 크면 줄이고, 작은 로고는 키우지 않는다. */
export function fitReceiptLogoSize(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  const w = Math.max(1, Math.round(srcW))
  const h = Math.max(1, Math.round(srcH))
  const boxW = Math.max(1, Math.round(maxW))
  const boxH = Math.max(1, Math.round(maxH))
  const scale = Math.min(1, boxW / w, boxH / h)
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}

export function normalizeReceiptLogoSize(raw: unknown): ReceiptLogoSize {
  return raw === 'sm' ? 'sm' : raw === 'lg' ? 'lg' : 'md'
}

/** 인쇄·관리자 미리보기 공통. 가로는 상한, 세로는 더 낮게 둔다. */
export function receiptBrandLogoCss(opts?: { filter?: string }): string {
  const filter = opts?.filter ? ` filter: ${opts.filter};` : ''
  const rule = (size: ReceiptLogoSize) =>
    `max-width: min(${RECEIPT_LOGO_MAX_WIDTH_PX[size]}px, 100%); max-height: ${RECEIPT_LOGO_MAX_HEIGHT_PX[size]}px;`
  return (
    `.receipt-brand-wrap { text-align: center; width: 100%; overflow: hidden; }` +
    `.receipt-brand-logo { display: inline-block; width: auto; height: auto; ${rule('md')} object-fit: contain;${filter} }` +
    `.receipt-brand-logo.sm { ${rule('sm')} }` +
    `.receipt-brand-logo.md { ${rule('md')} }` +
    `.receipt-brand-logo.lg { ${rule('lg')} }`
  )
}

const fittedLogoCache = new Map<string, string>()

function loadHtmlImage(src: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null)
      return
    }
    const img = new Image()
    let settled = false
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null)
    img.onerror = () => finish(null)
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous'
    img.src = src
  })
}

/**
 * 인쇄용 로고 data URI.
 * 가장자리 빈 칸을 자르고 크기 칸 안에 맞춘 PNG. 실패하면 원본을 그대로 돌려준다.
 */
export async function normalizeReceiptLogoForPrint(
  src: string,
  sizeRaw: unknown,
  opts?: { timeoutMs?: number }
): Promise<string> {
  const raw = String(src || '').trim()
  if (!raw) return ''
  if (typeof document === 'undefined') return raw
  const size = normalizeReceiptLogoSize(sizeRaw)
  const cacheKey = `${size}|${raw.length}|${raw.slice(0, 64)}|${raw.slice(-32)}`
  const cached = fittedLogoCache.get(cacheKey)
  if (cached) return cached

  const img = await loadHtmlImage(raw, Math.max(200, Math.trunc(opts?.timeoutMs ?? 1200)))
  if (!img) return raw
  try {
    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = img.naturalWidth
    srcCanvas.height = img.naturalHeight
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })
    if (!srcCtx) return raw
    srcCtx.drawImage(img, 0, 0)
    let pixels: Uint8ClampedArray
    try {
      pixels = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data
    } catch {
      return raw
    }
    const bounds = receiptLogoContentBounds(srcCanvas.width, srcCanvas.height, pixels)
    if (!bounds) return raw
    const fitted = fitReceiptLogoSize(
      bounds.w,
      bounds.h,
      RECEIPT_LOGO_MAX_WIDTH_PX[size],
      RECEIPT_LOGO_MAX_HEIGHT_PX[size]
    )
    const out = document.createElement('canvas')
    out.width = fitted.width
    out.height = fitted.height
    const outCtx = out.getContext('2d')
    if (!outCtx) return raw
    outCtx.imageSmoothingEnabled = true
    outCtx.imageSmoothingQuality = 'high'
    outCtx.drawImage(srcCanvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, fitted.width, fitted.height)
    const uri = out.toDataURL('image/png')
    if (!uri.startsWith('data:image/')) return raw
    fittedLogoCache.set(cacheKey, uri)
    return uri
  } catch {
    return raw
  }
}

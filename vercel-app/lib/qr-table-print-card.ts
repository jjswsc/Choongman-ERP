/**
 * Guest-facing table QR print card — canvas PNG for download / PDF.
 * Designed for table tents: large table label, scannable QR, short TH+EN copy.
 */
import QRCode from 'qrcode'

export type QrTablePrintCardFormat = 'a6' | 'square' | 'sticker'

export type QrTablePrintCardInput = {
  storeLabel: string
  tableName: string
  url: string
  /** Optional brand line under store (e.g. Omni) */
  brandLine?: string
  /** Optional logo image URL (https) */
  logoUrl?: string
  /** Primary brand hex, default amber */
  brandColor?: string
  /** Soft background accent hex */
  accentColor?: string
  /** Print template size */
  format?: QrTablePrintCardFormat
}

const FORMAT_PX: Record<QrTablePrintCardFormat, { w: number; h: number; qr: number }> = {
  a6: { w: 900, h: 1200, qr: 480 },
  square: { w: 1000, h: 1000, qr: 520 },
  sticker: { w: 800, h: 800, qr: 460 },
}

const FORMAT_PDF_MM: Record<QrTablePrintCardFormat, { w: number; h: number; page: string | number[] }> = {
  a6: { w: 105, h: 140, page: 'a6' },
  square: { w: 100, h: 100, page: [100, 100] },
  sticker: { w: 70, h: 70, page: [70, 70] },
}

function normalizeHex(raw: string | undefined, fallback: string): string {
  const s = String(raw || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
  }
  return fallback
}

function hexToRgba(hex: string, alpha: number): string {
  const h = normalizeHex(hex, '#b45309').slice(1)
  const n = parseInt(h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('qr_image_failed'))
    img.src = src
  })
}

/** High-res printable card. */
export async function renderQrTablePrintCardCanvas(
  input: QrTablePrintCardInput
): Promise<HTMLCanvasElement> {
  const format: QrTablePrintCardFormat =
    input.format === 'square' || input.format === 'sticker' ? input.format : 'a6'
  const { w: W, h: H, qr: qrSize } = FORMAT_PX[format]
  const url = String(input.url || '').trim()
  const tableName = String(input.tableName || '').trim() || '—'
  const storeLabel = String(input.storeLabel || '').trim() || 'Store'
  const brandLine = String(input.brandLine || '').trim()
  const brandColor = normalizeHex(input.brandColor, '#b45309')
  const accentColor = normalizeHex(input.accentColor, '#faf7f2')
  const logoUrl = String(input.logoUrl || '').trim()

  const qrDataUrl = await QRCode.toDataURL(url, {
    width: Math.max(320, qrSize),
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#1c1917', light: '#ffffff' },
  })
  const qrImg = await loadImage(qrDataUrl)

  let logoImg: HTMLImageElement | null = null
  if (logoUrl && /^https?:\/\//i.test(logoUrl)) {
    try {
      logoImg = await loadImage(logoUrl)
    } catch {
      logoImg = null
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')

  // Background wash
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, accentColor)
  bg.addColorStop(0.55, hexToRgba(brandColor, 0.08))
  bg.addColorStop(1, hexToRgba(brandColor, 0.14))
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = hexToRgba(brandColor, 0.08)
  ctx.beginPath()
  ctx.arc(0, 0, Math.min(W, H) * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(W, H, Math.min(W, H) * 0.32, 0, Math.PI * 2)
  ctx.fill()

  const pad = format === 'sticker' ? 28 : 48
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, format === 'sticker' ? 24 : 36)
  ctx.fillStyle = '#fffdf9'
  ctx.fill()
  ctx.strokeStyle = hexToRgba(brandColor, 0.18)
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = brandColor
  ctx.beginPath()
  ctx.moveTo(pad, pad)
  ctx.lineTo(W - pad, pad)
  ctx.lineTo(W - pad, pad + 14)
  ctx.lineTo(pad, pad + 14)
  ctx.closePath()
  ctx.fill()

  let headerY = pad + (format === 'sticker' ? 48 : 72)
  if (logoImg) {
    const maxH = format === 'sticker' ? 48 : 72
    const maxW = format === 'sticker' ? 160 : 220
    const ratio = Math.min(maxW / logoImg.width, maxH / logoImg.height)
    const lw = logoImg.width * ratio
    const lh = logoImg.height * ratio
    ctx.drawImage(logoImg, (W - lw) / 2, pad + (format === 'sticker' ? 24 : 36), lw, lh)
    headerY = pad + (format === 'sticker' ? 24 : 36) + lh + (format === 'sticker' ? 20 : 36)
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#78716c'
  ctx.font = format === 'sticker' ? '600 22px "Segoe UI", "Noto Sans Thai", sans-serif' : '600 28px "Segoe UI", "Noto Sans Thai", sans-serif'
  ctx.fillText(storeLabel.slice(0, 40), W / 2, headerY)
  if (brandLine && format !== 'sticker') {
    ctx.fillStyle = '#a8a29e'
    ctx.font = '500 22px "Segoe UI", sans-serif'
    ctx.fillText(brandLine.slice(0, 36), W / 2, headerY + 34)
  }

  const tableTitleY = headerY + (brandLine && format !== 'sticker' ? 80 : 48)
  ctx.fillStyle = '#1c1917'
  if (format !== 'sticker') {
    ctx.font = '700 36px "Segoe UI", "Noto Sans Thai", sans-serif'
    ctx.fillText('TABLE', W / 2, tableTitleY)
  }
  ctx.font =
    format === 'sticker'
      ? '800 72px "Segoe UI", "Pretendard", sans-serif'
      : format === 'square'
        ? '800 96px "Segoe UI", "Pretendard", sans-serif'
        : '800 120px "Segoe UI", "Pretendard", sans-serif'
  const tableDisplay = tableName.length > 8 ? tableName.slice(0, 10) : tableName
  ctx.fillText(tableDisplay, W / 2, tableTitleY + (format === 'sticker' ? 70 : 110))

  const qrX = (W - qrSize) / 2
  const qrY = Math.min(
    tableTitleY + (format === 'sticker' ? 90 : 140),
    H - pad - qrSize - (format === 'a6' ? 160 : 80)
  )
  roundRect(ctx, qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 22)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = 'rgba(28, 25, 23, 0.08)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  if (format === 'a6') {
    const copyY = qrY + qrSize + 70
    ctx.fillStyle = '#1c1917'
    ctx.font = '700 36px "Noto Sans Thai", "Segoe UI", sans-serif'
    ctx.fillText('สแกนเพื่อสั่งอาหาร', W / 2, copyY)
    ctx.fillStyle = '#57534e'
    ctx.font = '600 26px "Segoe UI", sans-serif'
    ctx.fillText('Scan to order from your phone', W / 2, copyY + 44)
    ctx.fillStyle = '#a8a29e'
    ctx.font = '500 18px "Segoe UI", sans-serif'
    ctx.fillText('Wi‑Fi recommended · No app install', W / 2, H - pad - 36)
  } else if (format === 'square') {
    ctx.fillStyle = '#57534e'
    ctx.font = '600 24px "Segoe UI", "Noto Sans Thai", sans-serif'
    ctx.fillText('Scan to order · สแกนเพื่อสั่ง', W / 2, Math.min(H - pad - 28, qrY + qrSize + 48))
  }

  return canvas
}

export async function downloadQrTablePrintCardPng(
  input: QrTablePrintCardInput,
  filename?: string
): Promise<void> {
  const canvas = await renderQrTablePrintCardCanvas(input)
  const name =
    filename ||
    `table-qr-${String(input.tableName || 'table')
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 40)}.png`
  const link = document.createElement('a')
  link.download = name
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export async function downloadQrTablePrintCardsPdf(
  cards: QrTablePrintCardInput[],
  filename = 'table-qr-cards.pdf'
): Promise<void> {
  if (!cards.length) return
  const { default: jsPDF } = await import('jspdf')
  const format: QrTablePrintCardFormat =
    cards[0]?.format === 'square' || cards[0]?.format === 'sticker' ? cards[0].format : 'a6'
  const mm = FORMAT_PDF_MM[format]
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: mm.page as 'a6' | number[],
  })
  for (let i = 0; i < cards.length; i++) {
    if (i > 0) pdf.addPage(mm.page as 'a6' | number[], 'portrait')
    const canvas = await renderQrTablePrintCardCanvas({ ...cards[i], format })
    const img = canvas.toDataURL('image/jpeg', 0.92)
    pdf.addImage(img, 'JPEG', 0, 0, mm.w, mm.h)
  }
  pdf.save(filename)
}

/** Open a print window with all cards for physical printing. */
export async function openQrTablePrintCardsWindow(cards: QrTablePrintCardInput[]): Promise<void> {
  if (!cards.length) return
  const dataUrls: string[] = []
  for (const card of cards) {
    const canvas = await renderQrTablePrintCardCanvas(card)
    dataUrls.push(canvas.toDataURL('image/png'))
  }
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1200')
  if (!w) throw new Error('popup_blocked')
  const imgs = dataUrls
    .map(
      (src, i) =>
        `<div class="page"><img src="${src}" alt="Table QR ${i + 1}" /></div>`
    )
    .join('')
  w.document.write(`<!DOCTYPE html><html><head><title>Table QR Cards</title>
<style>
  @page { size: A6 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e7e5e4; }
  .page { page-break-after: always; display: flex; justify-content: center; align-items: center;
    min-height: 100vh; padding: 8px; }
  .page:last-child { page-break-after: auto; }
  img { width: 100%; max-width: 105mm; height: auto; display: block; }
  @media print {
    body { background: #fff; }
    .page { min-height: auto; padding: 0; }
    img { max-width: 100%; width: 105mm; }
  }
</style></head><body>${imgs}
<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>
</body></html>`)
  w.document.close()
}

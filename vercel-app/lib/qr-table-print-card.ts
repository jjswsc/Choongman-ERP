/**
 * Guest-facing table QR print card — canvas PNG for download / PDF.
 * Designed for table tents: large table label, scannable QR, short TH+EN copy.
 */
import QRCode from 'qrcode'

export type QrTablePrintCardInput = {
  storeLabel: string
  tableName: string
  url: string
  /** Optional brand line under store (e.g. Omni) */
  brandLine?: string
}

const W = 900
const H = 1200

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
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('qr_image_failed'))
    img.src = src
  })
}

/** High-res printable card (900×1200). */
export async function renderQrTablePrintCardCanvas(
  input: QrTablePrintCardInput
): Promise<HTMLCanvasElement> {
  const url = String(input.url || '').trim()
  const tableName = String(input.tableName || '').trim() || '—'
  const storeLabel = String(input.storeLabel || '').trim() || 'Store'
  const brandLine = String(input.brandLine || '').trim()

  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 640,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#1c1917', light: '#ffffff' },
  })
  const qrImg = await loadImage(qrDataUrl)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')

  // Background wash
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#faf7f2')
  bg.addColorStop(0.55, '#f3ebe0')
  bg.addColorStop(1, '#ebe1d3')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Soft decorative corner arcs
  ctx.fillStyle = 'rgba(180, 83, 9, 0.08)'
  ctx.beginPath()
  ctx.arc(0, 0, 280, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(W, H, 320, 0, Math.PI * 2)
  ctx.fill()

  // Main card panel
  const pad = 48
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 36)
  ctx.fillStyle = '#fffdf9'
  ctx.fill()
  ctx.strokeStyle = 'rgba(120, 53, 15, 0.12)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Top accent bar
  roundRect(ctx, pad, pad, W - pad * 2, 18, 0)
  ctx.fillStyle = '#b45309'
  ctx.beginPath()
  ctx.moveTo(pad, pad)
  ctx.lineTo(W - pad, pad)
  ctx.lineTo(W - pad, pad + 16)
  ctx.lineTo(pad, pad + 16)
  ctx.closePath()
  ctx.fill()

  // Store / brand
  ctx.textAlign = 'center'
  ctx.fillStyle = '#78716c'
  ctx.font = '600 28px "Segoe UI", "Noto Sans Thai", sans-serif'
  ctx.fillText(storeLabel.slice(0, 40), W / 2, pad + 72)
  if (brandLine) {
    ctx.fillStyle = '#a8a29e'
    ctx.font = '500 22px "Segoe UI", sans-serif'
    ctx.fillText(brandLine.slice(0, 36), W / 2, pad + 106)
  }

  // Table label
  ctx.fillStyle = '#1c1917'
  ctx.font = '700 42px "Segoe UI", "Noto Sans Thai", sans-serif'
  ctx.fillText('TABLE', W / 2, pad + 170)
  ctx.font = '800 120px "Segoe UI", "Pretendard", sans-serif'
  const tableDisplay = tableName.length > 8 ? tableName.slice(0, 10) : tableName
  ctx.fillText(tableDisplay, W / 2, pad + 290)

  // QR frame
  const qrSize = 480
  const qrX = (W - qrSize) / 2
  const qrY = pad + 340
  roundRect(ctx, qrX - 28, qrY - 28, qrSize + 56, qrSize + 56, 28)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = 'rgba(28, 25, 23, 0.08)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  // Instructions
  const copyY = qrY + qrSize + 70
  ctx.fillStyle = '#1c1917'
  ctx.font = '700 36px "Noto Sans Thai", "Segoe UI", sans-serif'
  ctx.fillText('สแกนเพื่อสั่งอาหาร', W / 2, copyY)
  ctx.fillStyle = '#57534e'
  ctx.font = '600 26px "Segoe UI", sans-serif'
  ctx.fillText('Scan to order from your phone', W / 2, copyY + 44)

  // Footer hint
  ctx.fillStyle = '#a8a29e'
  ctx.font = '500 18px "Segoe UI", sans-serif'
  ctx.fillText('Wi‑Fi recommended · No app install', W / 2, H - pad - 36)

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
  // A6 portrait mm ≈ 105 × 148 — one card per page
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a6' })
  for (let i = 0; i < cards.length; i++) {
    if (i > 0) pdf.addPage('a6', 'portrait')
    const canvas = await renderQrTablePrintCardCanvas(cards[i])
    const img = canvas.toDataURL('image/jpeg', 0.92)
    pdf.addImage(img, 'JPEG', 0, 0, 105, 140)
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

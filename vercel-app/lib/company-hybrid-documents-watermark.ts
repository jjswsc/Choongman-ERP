import 'server-only'

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import sharp from 'sharp'
import { COMPANY_DOCUMENTS_BUCKET } from '@/lib/company-hybrid-documents'
import { supabaseFetch } from '@/lib/supabase-server'
import {
  COMPANY_HYBRID_WATERMARK_HEADER_LINES,
  buildWatermarkedDownloadName,
  formatBangkokDateForWatermark,
} from '@/lib/company-hybrid-documents-watermark-shared'

export {
  COMPANY_HYBRID_WATERMARK_HEADER_LINES,
  buildCompanyHybridWatermarkLines,
  buildWatermarkedDownloadName,
  formatBangkokDateForWatermark,
  isCompanyHybridWatermarkSupportedDoc,
  isCompanyHybridWatermarkSupportedMime,
  type CompanyHybridWatermarkInput,
} from '@/lib/company-hybrid-documents-watermark-shared'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isBoldWatermarkLine(line: string): boolean {
  return (
    line.startsWith('COMPANY COPY') ||
    line.startsWith('NOT VALID') ||
    line === COMPANY_HYBRID_WATERMARK_HEADER_LINES[0] ||
    line === COMPANY_HYBRID_WATERMARK_HEADER_LINES[1]
  )
}

export async function fetchCompanyHybridDocumentBytes(storagePath: string): Promise<Buffer> {
  const objectPath = String(storagePath || '').trim()
  if (!objectPath) throw new Error('storage path is required')

  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '')
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!base || !key) throw new Error('Supabase storage is not configured')

  const encodedPath = objectPath
    .split('/')
    .filter(Boolean)
    .map((p) => encodeURIComponent(p))
    .join('/')
  const apiPath = `${base}/storage/v1/object/${encodeURIComponent(COMPANY_DOCUMENTS_BUCKET)}/${encodedPath}`

  const res = await supabaseFetch(apiPath, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: '*/*',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Storage download failed (${res.status})${text ? `: ${text.slice(0, 120)}` : ''}`)
  }
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

export async function applyCompanyHybridPdfWatermark(pdfBytes: Buffer, lines: string[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const diagonalText = COMPANY_HYBRID_WATERMARK_HEADER_LINES[0]

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize()
    const diagonalSize = Math.max(14, Math.min(width, height) * 0.045)

    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const x = col * (width / 2) - width * 0.15
        const y = row * (height / 4) + height * 0.12
        page.drawText(diagonalText, {
          x,
          y,
          size: diagonalSize,
          font: fontBold,
          color: rgb(0.65, 0.65, 0.65),
          opacity: 0.22,
          rotate: degrees(35),
        })
      }
    }

    const footerSize = 8
    let y = 18
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i]
      if (!line) {
        y += 4
        continue
      }
      page.drawText(line, {
        x: 14,
        y,
        size: footerSize,
        font: isBoldWatermarkLine(line) ? fontBold : font,
        color: rgb(0.15, 0.15, 0.15),
        opacity: 0.95,
      })
      y += footerSize + 3
    }
  }

  return Buffer.from(await pdfDoc.save())
}

export async function applyCompanyHybridImageWatermark(
  imageBytes: Buffer,
  mime: string,
  lines: string[]
): Promise<Buffer> {
  const img = sharp(imageBytes, { animated: mime === 'image/gif' })
  const meta = await img.metadata()
  const width = meta.width || 1200
  const height = meta.height || 900
  const diagonalText = COMPANY_HYBRID_WATERMARK_HEADER_LINES[0]
  const diagonalSize = Math.max(18, Math.min(width, height) * 0.05)
  const footerFontSize = Math.max(12, Math.min(16, Math.round(width / 80)))
  const footerLineHeight = footerFontSize + 5
  const footerLines = lines.filter((line) => line.length > 0)
  const footerHeight = footerLines.length * footerLineHeight + 24

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = col * (width / 2) - width * 0.15
      const y = row * (height / 4) + height * 0.12
      svg += `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${diagonalSize}" font-weight="700" fill="rgba(120,120,120,0.28)" transform="rotate(35 ${x} ${y})">${escapeXml(diagonalText)}</text>`
    }
  }
  svg += `<rect x="0" y="${height - footerHeight}" width="${width}" height="${footerHeight}" fill="rgba(255,255,255,0.88)"/>`
  let fy = height - footerHeight + footerFontSize + 8
  for (const line of footerLines) {
    const weight = isBoldWatermarkLine(line) ? '700' : '400'
    svg += `<text x="14" y="${fy}" font-family="Arial, Helvetica, sans-serif" font-size="${footerFontSize}" font-weight="${weight}" fill="rgba(30,30,30,0.95)">${escapeXml(line)}</text>`
    fy += footerLineHeight
  }
  svg += '</svg>'

  const out = img.composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  if (mime === 'image/png') return out.png().toBuffer()
  if (mime === 'image/webp') return out.webp().toBuffer()
  if (mime === 'image/gif') return out.gif().toBuffer()
  return out.jpeg({ quality: 92 }).toBuffer()
}

export async function applyCompanyHybridDocumentWatermark(
  fileBytes: Buffer,
  mime: string,
  lines: string[]
): Promise<{ bytes: Buffer; contentType: string; extension: string }> {
  const base = mime.toLowerCase().split(';')[0].trim()
  if (base === 'application/pdf') {
    return {
      bytes: await applyCompanyHybridPdfWatermark(fileBytes, lines),
      contentType: 'application/pdf',
      extension: 'pdf',
    }
  }
  if (base.startsWith('image/')) {
    const bytes = await applyCompanyHybridImageWatermark(fileBytes, base, lines)
    if (base === 'image/png') return { bytes, contentType: 'image/png', extension: 'png' }
    if (base === 'image/webp') return { bytes, contentType: 'image/webp', extension: 'webp' }
    if (base === 'image/gif') return { bytes, contentType: 'image/gif', extension: 'gif' }
    return { bytes, contentType: 'image/jpeg', extension: 'jpg' }
  }
  throw new Error('Unsupported file type for watermark')
}

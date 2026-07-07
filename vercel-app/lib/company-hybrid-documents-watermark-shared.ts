/** 클라이언트·API 공용 — PDF/이미지 워터마크 지원 판별·문구 (server-only 의존 없음) */

export const COMPANY_HYBRID_WATERMARK_HEADER_LINES = [
  'COMPANY COPY — FOR STATED PURPOSE ONLY',
  'NOT VALID FOR ANY OTHER USE',
] as const

export type CompanyHybridWatermarkInput = {
  documentId: number
  issuedTo: string
  purpose: string
  issuedOn: string
}

export function formatBangkokDateForWatermark(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date)
  const d = parts.find((p) => p.type === 'day')?.value ?? ''
  const m = parts.find((p) => p.type === 'month')?.value ?? ''
  const y = parts.find((p) => p.type === 'year')?.value ?? ''
  if (!d || !m || !y) return ''
  return `${d}/${m}/${y}`
}

export function buildCompanyHybridWatermarkLines(input: CompanyHybridWatermarkInput): string[] {
  const issuedTo = String(input.issuedTo || '').trim()
  const purpose = String(input.purpose || '').trim()
  return [
    COMPANY_HYBRID_WATERMARK_HEADER_LINES[0],
    COMPANY_HYBRID_WATERMARK_HEADER_LINES[1],
    '',
    `Issued to: ${issuedTo}`,
    `Purpose: ${purpose}`,
    `Issued on: ${input.issuedOn} (Asia/Bangkok)`,
    `Document ref: CHD-${input.documentId}`,
  ]
}

export function isCompanyHybridWatermarkSupportedMime(mime: string | null | undefined): boolean {
  const base = String(mime || '')
    .toLowerCase()
    .split(';')[0]
    .trim()
  if (!base) return false
  if (base === 'application/pdf') return true
  return base.startsWith('image/')
}

export function isCompanyHybridWatermarkSupportedDoc(row: {
  source?: string | null
  mime?: string | null
  storage_path?: string | null
}): boolean {
  if (String(row.source || '').trim() !== 'supabase') return false
  if (!String(row.storage_path || '').trim()) return false
  return isCompanyHybridWatermarkSupportedMime(row.mime)
}

export function buildWatermarkedDownloadName(fileName: string | null | undefined, extension: string): string {
  const base = String(fileName || 'document')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.\-()+\s]/g, '_')
    .trim()
    .slice(0, 80)
  const stamp = formatBangkokDateForWatermark().replace(/\//g, '-')
  return `${base || 'document'}-watermarked-${stamp}.${extension}`
}

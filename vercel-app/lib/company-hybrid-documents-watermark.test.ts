import { describe, expect, it } from 'vitest'
import {
  buildCompanyHybridWatermarkLines,
  formatBangkokDateForWatermark,
  isCompanyHybridWatermarkSupportedDoc,
  isCompanyHybridWatermarkSupportedMime,
} from '@/lib/company-hybrid-documents-watermark-shared'

describe('company-hybrid-documents-watermark', () => {
  it('builds fixed English watermark lines', () => {
    const lines = buildCompanyHybridWatermarkLines({
      documentId: 42,
      issuedTo: 'Somchai K.',
      purpose: 'Bank account opening',
      issuedOn: '06/07/2026',
    })
    expect(lines[0]).toBe('COMPANY COPY — FOR STATED PURPOSE ONLY')
    expect(lines[1]).toBe('NOT VALID FOR ANY OTHER USE')
    expect(lines).toContain('Issued to: Somchai K.')
    expect(lines).toContain('Purpose: Bank account opening')
    expect(lines).toContain('Document ref: CHD-42')
  })

  it('formats Bangkok date as DD/MM/YYYY', () => {
    const d = new Date('2026-07-06T10:00:00+07:00')
    expect(formatBangkokDateForWatermark(d)).toBe('06/07/2026')
  })

  it('supports pdf and image mime types only', () => {
    expect(isCompanyHybridWatermarkSupportedMime('application/pdf')).toBe(true)
    expect(isCompanyHybridWatermarkSupportedMime('image/jpeg')).toBe(true)
    expect(isCompanyHybridWatermarkSupportedMime('application/msword')).toBe(false)
  })

  it('requires supabase upload with storage path', () => {
    expect(
      isCompanyHybridWatermarkSupportedDoc({
        source: 'supabase',
        mime: 'application/pdf',
        storage_path: 'hybrid/store/a.pdf',
      })
    ).toBe(true)
    expect(
      isCompanyHybridWatermarkSupportedDoc({
        source: 'drive',
        mime: 'application/pdf',
        storage_path: null,
      })
    ).toBe(false)
  })
})

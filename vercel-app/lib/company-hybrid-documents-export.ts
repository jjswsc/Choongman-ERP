import type { CompanyHybridDocumentListItem } from '@/lib/api-client'
import { formatCompanyHybridDocDateForInput } from '@/lib/company-hybrid-documents'
import { getCorrespondenceFromMetadata } from '@/lib/company-hybrid-correspondence'

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function formatBangkokCreatedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return String(iso)
  }
}

export type CompanyHybridDocCsvColumnLabels = {
  store: string
  title: string
  category: string
  source: string
  validFrom: string
  validTo: string
  note: string
  createdAt: string
  createdBy: string
  relatedType: string
  relatedId: string
  corrDirection: string
  corrCounterparty: string
  corrStatus: string
  corrReplyDue: string
}

export function buildCompanyHybridDocumentsCsv(
  rows: CompanyHybridDocumentListItem[],
  labels: CompanyHybridDocCsvColumnLabels,
  opts: {
    labelCategory: (row: CompanyHybridDocumentListItem) => string
    labelStore: (store: string) => string
    labelRelatedType: (type: string) => string
    labelCorrDirection: (d: string | undefined) => string
    labelCorrStatus: (s: string | undefined) => string
  }
): string {
  const header = [
    labels.store,
    labels.title,
    labels.category,
    labels.source,
    labels.validFrom,
    labels.validTo,
    labels.note,
    labels.createdAt,
    labels.createdBy,
    labels.relatedType,
    labels.relatedId,
    labels.corrDirection,
    labels.corrCounterparty,
    labels.corrStatus,
    labels.corrReplyDue,
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const row of rows) {
    const corr = getCorrespondenceFromMetadata(row.metadata)
    lines.push(
      [
        opts.labelStore(row.store),
        row.title,
        opts.labelCategory(row),
        row.source === 'drive' ? 'Drive' : 'Upload',
        formatCompanyHybridDocDateForInput(row.valid_from),
        formatCompanyHybridDocDateForInput(row.valid_to),
        row.note || '',
        formatBangkokCreatedAt(row.created_at),
        row.created_by_name || '',
        opts.labelRelatedType(row.related_type),
        row.related_id || '',
        corr?.direction ? opts.labelCorrDirection(corr.direction) : '',
        corr?.counterparty || '',
        corr?.status ? opts.labelCorrStatus(corr.status) : '',
        formatCompanyHybridDocDateForInput(corr?.replyDue),
      ]
        .map(csvCell)
        .join(',')
    )
  }
  return '\uFEFF' + lines.join('\r\n')
}

export function downloadCompanyHybridDocumentsCsv(csv: string, fileName: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

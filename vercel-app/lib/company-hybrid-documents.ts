/**
 * Google Drive + ERP 하이브리드 회사 문서 — 관련 엔터티/소스 상수
 */

/** 목록 API: 모든 매장 문서를 한 번에 조회할 때 store 쿼리에 넣는 값 */
export const COMPANY_HYBRID_DOCS_STORE_ALL = '__cm_all_stores__'

export function isCompanyHybridDocsListAllStoresParam(v: string): boolean {
  const s = String(v || '').trim()
  return s === COMPANY_HYBRID_DOCS_STORE_ALL || s.toLowerCase() === 'all'
}

export const COMPANY_HYBRID_RELATED_TYPES = [
  'none',
  'employee',
  'store',
  'interior_project',
] as const

export type CompanyHybridRelatedType = (typeof COMPANY_HYBRID_RELATED_TYPES)[number]

export const COMPANY_HYBRID_SOURCES = ['drive', 'supabase'] as const
export type CompanyHybridSource = (typeof COMPANY_HYBRID_SOURCES)[number]

export function isCompanyHybridRelatedType(v: string): v is CompanyHybridRelatedType {
  return (COMPANY_HYBRID_RELATED_TYPES as readonly string[]).includes(v)
}

export function isCompanyHybridSource(v: string): v is CompanyHybridSource {
  return (COMPANY_HYBRID_SOURCES as readonly string[]).includes(v)
}

const DRIVE_HOSTS = /^(https?:)?\/\//i

export function isReasonableExternalUrl(s: string): boolean {
  const t = s.trim()
  if (t.length < 8) return false
  if (!/^https?:\/\//i.test(t)) return false
  try {
    const u = new URL(t)
    if (!DRIVE_HOSTS.test(u.protocol)) return false
    if (u.hostname.length < 3) return false
    return true
  } catch {
    return false
  }
}

const ALLOWED: ReadonlySet<string> = (() => {
  const s = new Set<string>()
  for (const m of [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ]) s.add(m)
  return s
})()

const CT_BASE = (ct: string) => ct.toLowerCase().split(';')[0].trim()

export function isAllowedCompanyDocContentType(mime: string): boolean {
  return ALLOWED.has(CT_BASE(mime))
}

/** 비동영·문서/이미지 (presign) */
export const MAX_COMPANY_DOC_FILE_BYTES = 40 * 1024 * 1024

export function maxBytesForCompanyDocMime(mime: string): number {
  return MAX_COMPANY_DOC_FILE_BYTES
}

export const COMPANY_DOCUMENTS_BUCKET = 'company-documents'

export function slugifyStoreForCompanyDocPath(store: string): string {
  return String(store || '')
    .replace(/[^a-zA-Z0-9._-가-힣]/g, '_')
    .slice(0, 60)
}

export type CompanyHybridDocumentRow = {
  id: number
  store: string
  related_type: string
  related_id: string | null
  doc_type: string | null
  category_id: number | null
  title: string
  source: string
  external_url: string | null
  public_url: string | null
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  mime: string | null
  valid_from: string | null
  valid_to: string | null
  note: string | null
  created_by_name: string | null
  created_by_store: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

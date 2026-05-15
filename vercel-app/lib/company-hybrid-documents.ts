/**
 * Google Drive + ERP 하이브리드 회사 문서 — 관련 엔터티/소스 상수
 */

import { STORAGE_SEGMENT_SAFE } from '@/lib/storage-filename-safe'

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

/**
 * 문서 열람 권한(메타) — 스키마 변경 없이 doc_type에 토큰으로 저장한다.
 * - all: 기존 동작(해당 매장 접근 가능하면 열람 가능)
 * - office: 본사 권한(Director/Officer)만 열람 가능
 * - store_admin: 본사 + 매장 관리자(매니저/가맹점주)만 열람 가능
 */
export const COMPANY_HYBRID_DOC_VISIBILITIES = ['all', 'office', 'store_admin'] as const
export type CompanyHybridDocVisibility = (typeof COMPANY_HYBRID_DOC_VISIBILITIES)[number]

const DOC_VIS_META_PREFIX = '__perm__:'

export function isCompanyHybridDocVisibility(v: string): v is CompanyHybridDocVisibility {
  return (COMPANY_HYBRID_DOC_VISIBILITIES as readonly string[]).includes(v)
}

export function companyHybridDocVisibilityToDocType(v: CompanyHybridDocVisibility): string {
  return `${DOC_VIS_META_PREFIX}${v}`
}

export function companyHybridDocVisibilityFromDocType(docType: string | null | undefined): CompanyHybridDocVisibility {
  const raw = String(docType || '').trim()
  if (!raw.startsWith(DOC_VIS_META_PREFIX)) return 'all'
  const parsed = raw.slice(DOC_VIS_META_PREFIX.length).trim()
  return isCompanyHybridDocVisibility(parsed) ? parsed : 'all'
}

export function isCompanyHybridDocTypePermissionMeta(docType: string | null | undefined): boolean {
  return String(docType || '').trim().startsWith(DOC_VIS_META_PREFIX)
}

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

export function maxBytesForCompanyDocMime(_mime: string): number {
  return MAX_COMPANY_DOC_FILE_BYTES
}

export const COMPANY_DOCUMENTS_BUCKET = 'company-documents'

export function slugifyStoreForCompanyDocPath(store: string): string {
  return String(store || '')
    .replace(STORAGE_SEGMENT_SAFE, '_')
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
  /** 공문 등 확장 필드 — Supabase `company_hybrid_documents_metadata.sql` 적용 후 채워짐 */
  metadata?: Record<string, unknown> | null
  created_by_name: string | null
  created_by_store: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

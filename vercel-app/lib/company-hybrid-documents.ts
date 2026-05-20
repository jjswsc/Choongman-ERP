/**
 * Google Drive + ERP 하이브리드 회사 문서 — 관련 엔터티/소스 상수
 */

import { STORAGE_SEGMENT_SAFE } from '@/lib/storage-filename-safe'

/** 목록 API: 모든 매장 문서를 한 번에 조회할 때 store 쿼리에 넣는 값 */
export const COMPANY_HYBRID_DOCS_STORE_ALL = '__cm_all_stores__'

/** 문서 카테고리 — 전 매장 공통(문서 store와 무관) */
export const COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE = '__company__'

export function isCompanyHybridDocsListAllStoresParam(v: string): boolean {
  const s = String(v || '').trim()
  return s === COMPANY_HYBRID_DOCS_STORE_ALL || s.toLowerCase() === 'all'
}

export function isCompanyHybridDocCategoryGlobalStore(v: string): boolean {
  return String(v || '').trim() === COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE
}

const HTML_DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidYmdDate(ymd: string): boolean {
  if (!HTML_DATE_INPUT_RE.test(ymd)) return false
  const [y, m, d] = ymd.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  return utc.getUTCFullYear() === y && utc.getUTCMonth() + 1 === m && utc.getUTCDate() === d
}

/**
 * HTML `<input type="date">`용 YYYY-MM-DD.
 * DB·레거시(D/M/Y, 타임스탬프 등) 값을 편집 가능한 형식으로 맞춘다.
 */
export function toHtmlDateInputValue(raw: string | null | undefined): string {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  const head = s.slice(0, 10)
  if (HTML_DATE_INPUT_RE.test(head)) return head
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]

  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (slash) {
    const n1 = Number(slash[1])
    const n2 = Number(slash[2])
    const yyyy = slash[3]
    let dd: number
    let mm: number
    if (n1 > 12) {
      dd = n1
      mm = n2
    } else if (n2 > 12) {
      mm = n1
      dd = n2
    } else {
      dd = n1
      mm = n2
    }
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return ''
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }

  const parsed = new Date(s.includes('T') ? s : `${s}T12:00:00+07:00`)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  }
  return ''
}

/** API·DB 저장용 date — YYYY-MM-DD 또는 null */
export function parseCompanyHybridDocDate(raw: unknown): string | null {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  const v = toHtmlDateInputValue(trimmed)
  if (!v || !isValidYmdDate(v)) return null
  return v
}

/** 문서 등록·필터용 카테고리 목록 — 전사 공통 우선, 없으면 기존 매장별 데이터 폴백 */
export function pickCompanyHybridDocCategoriesForPicker(
  items: CompanyHybridDocCategoryRow[]
): CompanyHybridDocCategoryRow[] {
  const global = items.filter((c) => isCompanyHybridDocCategoryGlobalStore(c.store))
  if (global.length > 0) return global
  return items
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

/** 문서 카테고리 — 상위 없음(최상위) */
export type CompanyHybridDocCategoryRow = {
  id: number
  store: string
  name: string
  sort_order: number
  parent_category_id: number | null
}

export function isCompanyHybridDocCategoryRoot(
  c: Pick<CompanyHybridDocCategoryRow, 'parent_category_id'>
): boolean {
  return c.parent_category_id == null || Number(c.parent_category_id) <= 0
}

/** 매장별 트리 순서(최상위 → 하위)와 목록 들여쓰기 깊이 */
export function sortCompanyHybridDocCategoriesTree(
  items: CompanyHybridDocCategoryRow[],
  opts?: { store?: string }
): { ordered: CompanyHybridDocCategoryRow[]; depthById: Map<number, number> } {
  const depthById = new Map<number, number>()
  let pool = items
  if (opts?.store && !isCompanyHybridDocsListAllStoresParam(opts.store)) {
    pool = items.filter((c) => c.store === opts.store)
  }

  const byStore = new Map<string, CompanyHybridDocCategoryRow[]>()
  for (const c of pool) {
    if (!byStore.has(c.store)) byStore.set(c.store, [])
    byStore.get(c.store)!.push(c)
  }

  const ordered: CompanyHybridDocCategoryRow[] = []
  const storeKeys = [...byStore.keys()].sort((a, b) => a.localeCompare(b, 'ko'))

  for (const store of storeKeys) {
    const list = byStore.get(store)!
    const byParent = new Map<number | null, CompanyHybridDocCategoryRow[]>()
    for (const c of list) {
      const pid =
        c.parent_category_id != null && Number(c.parent_category_id) > 0
          ? Number(c.parent_category_id)
          : null
      if (!byParent.has(pid)) byParent.set(pid, [])
      byParent.get(pid)!.push(c)
    }
    const sortSiblings = (arr: CompanyHybridDocCategoryRow[]) =>
      [...arr].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)

    const walk = (parentId: number | null, depth: number) => {
      for (const c of sortSiblings(byParent.get(parentId) || [])) {
        depthById.set(c.id, depth)
        ordered.push(c)
        walk(c.id, depth + 1)
      }
    }
    walk(null, 0)
  }

  return { ordered, depthById }
}

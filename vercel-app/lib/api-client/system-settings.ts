/**
 * 시스템 설정 API (api-client.ts에서 분리 — move only)
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'

export interface HeadOfficeInfo {
  companyName: string
  taxId: string
  address: string
  phone: string
  bankInfo: string
}

export async function getHeadOfficeInfo() {
  const res = await apiFetchWithOffline('/api/getHeadOfficeInfo')
  return res.json() as Promise<HeadOfficeInfo>
}

/** Vercel 서버의 Supabase 조회 상한(설정 화면 표시용, 비밀값 없음) */
export interface AdminRouteLimitResolved {
  path: string
  line: number
  kind: string
  value: number
  apiLabel: string
  effectiveValue: number | null
  effectiveDisplay: string
}

export interface AdminTableUsageRow {
  table: string
  rowCount: number | null
  error?: string
  capFromPaging: number
  defaultMaxRows: number
  exceedsPagingCap: boolean
  exceedsDefaultMaxRows: boolean
}

export interface AdminDataLimits {
  selectPageCap: number
  envSupabaseSelectPageSizeMax: string | null
  selectAllPagesMaxPages: number
  selectAllPagesDefaultMaxRows: number
  selectFilterAllPagesMaxPages: number
  selectFilterAllPagesMaxRowsCeiling: number
  selectFilterAllPagesMinStride: number
  fetchedAt: string
  /** scripts/extract-api-limits.mjs 생성 시각 (UTC) */
  limitsExtractedAt: string
  /** 코드에서 추출한 limit/pageSize/maxRows/maxDuration 지점 수 */
  limitsExtractedCount: number
  routeLimits: AdminRouteLimitResolved[]
  tableUsage: AdminTableUsageRow[]
}

export async function getAdminDataLimits(): Promise<AdminDataLimits> {
  const res = await apiFetch('/api/getAdminDataLimits')
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `getAdminDataLimits ${res.status}`)
  }
  return res.json() as Promise<AdminDataLimits>
}

export async function saveHeadOfficeInfo(data: HeadOfficeInfo) {
  const res = await apiFetchWithOffline('/api/saveHeadOfficeInfo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

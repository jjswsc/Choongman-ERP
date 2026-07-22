/**
 * Omni Storage 객체 키: `{tenantId}/...` 접두로 회사 간 경로 충돌·혼선 완화.
 * 충만(tenantId 없음): 접두 없이 segments만.
 */
import { STORAGE_SEGMENT_SAFE } from '@/lib/storage-filename-safe'
import { normalizeTenantId } from '@/lib/tenant-context'

export function sanitizeStoragePathSegment(raw: string, maxLen = 80): string {
  return String(raw || '')
    .replace(STORAGE_SEGMENT_SAFE, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, maxLen)
}

/** 빈 세그먼트 제거 후 `/` 로 연결. tenantId 있으면 맨 앞. */
export function buildSaasStorageObjectPath(opts: {
  tenantId?: string | null
  segments: Array<string | null | undefined>
}): string {
  const parts: string[] = []
  const tid = normalizeTenantId(opts.tenantId)
  if (tid) parts.push(sanitizeStoragePathSegment(tid, 64))
  for (const seg of opts.segments) {
    const cleaned = sanitizeStoragePathSegment(String(seg || ''), 80)
    if (cleaned) parts.push(cleaned)
  }
  return parts.join('/')
}

/** 목록 API 공통: page / pageSize 파싱 */

export const DEFAULT_LIST_PAGE_SIZE = 20
export const MIN_LIST_PAGE_SIZE = 5
export const MAX_LIST_PAGE_SIZE = 50

export function parseListPagination(
  searchParams: URLSearchParams,
  body?: Record<string, unknown> | null,
  defaultPageSize: number = DEFAULT_LIST_PAGE_SIZE
): { page: number; pageSize: number } {
  const fromBody = (k: string): string | undefined => {
    if (!body || typeof body !== 'object') return undefined
    const v = (body as Record<string, unknown>)[k]
    if (v == null) return undefined
    return String(v)
  }
  const pageRaw = searchParams.get('page') ?? fromBody('page')
  const sizeRaw =
    searchParams.get('pageSize') ??
    searchParams.get('limit') ??
    fromBody('pageSize') ??
    fromBody('limit')
  let page = parseInt(String(pageRaw ?? '1'), 10)
  if (!Number.isFinite(page) || page < 1) page = 1
  const def = Math.min(MAX_LIST_PAGE_SIZE, Math.max(MIN_LIST_PAGE_SIZE, defaultPageSize))
  let pageSize = parseInt(String(sizeRaw ?? String(def)), 10)
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = def
  pageSize = Math.min(MAX_LIST_PAGE_SIZE, Math.max(MIN_LIST_PAGE_SIZE, pageSize))
  return { page, pageSize }
}

export function slicePage<T>(arr: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return arr.slice(start, start + pageSize)
}

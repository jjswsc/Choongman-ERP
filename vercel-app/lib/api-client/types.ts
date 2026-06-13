/** 페이지네이션 목록 API 공통 응답 */
export interface PaginatedList<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  truncated?: boolean
}

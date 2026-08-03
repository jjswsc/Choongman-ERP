/**
 * 매출 집계 API Cache-Control.
 * 기본은 짧은 CDN 캐시(매출관리 기간 조회). 실시간·수동「검색」은 fresh=1 로 no-store.
 */
export const POS_SALES_CDN_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300'
export const POS_SALES_NO_STORE_CACHE_CONTROL = 'no-store, max-age=0'

export function wantsPosSalesFreshResponse(searchParams: URLSearchParams): boolean {
  const fresh = String(searchParams.get('fresh') || '').trim().toLowerCase()
  if (fresh === '1' || fresh === 'true' || fresh === 'yes') return true
  const nocache = String(searchParams.get('nocache') || '').trim().toLowerCase()
  if (nocache === '1' || nocache === 'true' || nocache === 'yes') return true
  return searchParams.has('_')
}

export function resolvePosSalesCacheControl(searchParams: URLSearchParams): string {
  return wantsPosSalesFreshResponse(searchParams)
    ? POS_SALES_NO_STORE_CACHE_CONTROL
    : POS_SALES_CDN_CACHE_CONTROL
}

export function applyPosSalesCacheControl(headers: Headers, searchParams: URLSearchParams): void {
  headers.set('Cache-Control', resolvePosSalesCacheControl(searchParams))
}

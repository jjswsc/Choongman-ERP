'use client'

/**
 * 오프라인일 때 Next.js App Router의 클라이언트 전환(RSC fetch)이 막히면
 * 버튼이 먹통처럼 보이므로, /pos 경로는 전체 네비게이션으로 우회한다.
 */
export function navigatePosOfflineAware(path: string, push: (p: string) => void): void {
  if (typeof window !== 'undefined' && !navigator.onLine && path.startsWith('/pos')) {
    window.location.assign(path)
    return
  }
  push(path)
}

export function replacePosOfflineAware(path: string, replace: (p: string) => void): void {
  if (typeof window !== 'undefined' && !navigator.onLine && path.startsWith('/pos')) {
    window.location.assign(path)
    return
  }
  replace(path)
}

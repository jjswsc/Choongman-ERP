"use client"

import * as React from "react"

/**
 * Returns true when the media query matches.
 * @param query - CSS media query string (e.g. "(max-width: 1023px)")
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState<boolean>(false)

  // useLayoutEffect: 첫 페인트 직전에 실제 뷰포트와 동기화해 태블릿에서
  // "넓은 레이아웃 한 프레임 → 좁은 레이아웃" 전환으로 CartPanel이 없는 구간을 줄임
  React.useLayoutEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    setMatches(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return matches
}

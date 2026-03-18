"use client"

import * as React from "react"

/**
 * Returns true when the media query matches.
 * @param query - CSS media query string (e.g. "(max-width: 1023px)")
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState<boolean>(false)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    setMatches(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return matches
}

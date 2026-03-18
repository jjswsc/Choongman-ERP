"use client"

import * as React from "react"

/** Scroll focused input into view when mobile keyboard opens. Use with onFocus. */
export function useScrollIntoViewOnFocus() {
  return React.useCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const el = e.target
    if (!el || typeof el.scrollIntoView !== "function") return
    window.setTimeout(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" })
    }, 150)
  }, [])
}

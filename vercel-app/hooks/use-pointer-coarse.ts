"use client"

import * as React from "react"

/**
 * 터치·펜 등 coarse pointer 기기 (폴드·태블릿·폰).
 * 레이아웃 분기용이 아니라 hit area·탭 닫기 등 타깃 크기용.
 */
export function usePointerCoarse(): boolean {
  const [coarse, setCoarse] = React.useState(false)

  React.useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mql = window.matchMedia("(pointer: coarse)")
    const onChange = () => setCoarse(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return coarse
}

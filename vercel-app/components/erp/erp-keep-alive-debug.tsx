"use client"

import * as React from "react"
import { useErpNavigation } from "@/lib/erp-navigation"

/** 개발 모드: keep-alive 캐시 화면 수 표시 */
export function ErpKeepAliveDebug() {
  const { registerKeepAliveCountListener } = useErpNavigation()
  const [count, setCount] = React.useState(0)

  React.useEffect(() => {
    return registerKeepAliveCountListener(setCount)
  }, [registerKeepAliveCountListener])

  if (process.env.NODE_ENV === "production") return null
  if (count <= 1) return null

  return (
    <div
      className="pointer-events-none fixed bottom-2 left-2 z-[200] rounded-md border border-dashed border-amber-500/50 bg-amber-50/90 px-2 py-0.5 text-[10px] font-mono text-amber-900 shadow-sm dark:bg-amber-950/80 dark:text-amber-100"
      aria-hidden
    >
      keep-alive: {count}
    </div>
  )
}

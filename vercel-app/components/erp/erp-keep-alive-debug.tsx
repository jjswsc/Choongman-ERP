"use client"

import * as React from "react"
import { useErpNavigation } from "@/lib/erp-navigation"
import { getErpWorkspaceTabs, subscribeErpWorkspaceTabs } from "@/lib/erp-workspace-tabs"

/** 개발 모드: keep-alive 캐시·워크스페이스 탭 수 표시 */
export function ErpKeepAliveDebug() {
  const { registerKeepAliveCountListener } = useErpNavigation()
  const [cacheCount, setCacheCount] = React.useState(0)
  const [tabCount, setTabCount] = React.useState(0)

  React.useEffect(() => {
    return registerKeepAliveCountListener(setCacheCount)
  }, [registerKeepAliveCountListener])

  React.useEffect(() => {
    setTabCount(getErpWorkspaceTabs().length)
    return subscribeErpWorkspaceTabs(() => setTabCount(getErpWorkspaceTabs().length))
  }, [])

  if (process.env.NODE_ENV === "production") return null
  if (cacheCount <= 1 && tabCount <= 1) return null

  return (
    <div
      className="pointer-events-none fixed bottom-2 left-2 z-[200] rounded-md border border-dashed border-amber-500/50 bg-amber-50/90 px-2 py-0.5 text-[10px] font-mono text-amber-900 shadow-sm dark:bg-amber-950/80 dark:text-amber-100"
      aria-hidden
    >
      tabs: {tabCount} · keep-alive: {cacheCount}
    </div>
  )
}

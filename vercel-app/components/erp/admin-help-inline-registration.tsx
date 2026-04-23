"use client"

import * as React from "react"

type Ctx = {
  /** 탭 행 오른쪽에 인라인 도움말 토글이 붙은 횟수 (0이면 셸이 상단 미니 스트립 표시) */
  count: number
  inc: () => void
  dec: () => void
}

const AdminHelpInlineCtx = React.createContext<Ctx | null>(null)

export function AdminHelpInlineRegistrationProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = React.useState(0)
  const inc = React.useCallback(() => setCount((n) => n + 1), [])
  const dec = React.useCallback(() => setCount((n) => Math.max(0, n - 1)), [])
  const value = React.useMemo(() => ({ count, inc, dec }), [count, inc, dec])
  return <AdminHelpInlineCtx.Provider value={value}>{children}</AdminHelpInlineCtx.Provider>
}

export function useAdminHelpInlineTabBarCount(): number {
  return React.useContext(AdminHelpInlineCtx)?.count ?? 0
}

/** `true`일 때만 등록 — 탭 행에 인라인 토글이 실제로 붙은 경우에만 셸 상단 스트립을 숨김 */
export function useRegisterAdminHelpInTabBar(active: boolean) {
  const ctx = React.useContext(AdminHelpInlineCtx)
  React.useEffect(() => {
    if (!active || !ctx) return
    ctx.inc()
    return () => {
      ctx.dec()
    }
  }, [active, ctx])
}

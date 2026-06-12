"use client"

import * as React from "react"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"

type MemberPortalQrCountdownProps = {
  deadlineMs: number
  onExpired?: () => void
  t: (key: MemberPortalKey, params?: Record<string, string>) => string
  className?: string
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${String(sec).padStart(2, "0")}`
}

export function MemberPortalQrCountdown({
  deadlineMs,
  onExpired,
  t,
  className = "",
}: MemberPortalQrCountdownProps) {
  const [remainingMs, setRemainingMs] = React.useState(() => Math.max(0, deadlineMs - Date.now()))
  const expiredRef = React.useRef(false)

  React.useEffect(() => {
    expiredRef.current = false
    const tick = () => {
      const next = Math.max(0, deadlineMs - Date.now())
      setRemainingMs(next)
      if (next <= 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpired?.()
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [deadlineMs, onExpired])

  const urgent = remainingMs > 0 && remainingMs <= 60_000

  return (
    <p
      className={`text-center text-sm tabular-nums ${urgent ? "font-semibold text-red-600" : "text-neutral-500"} ${className}`}
    >
      {remainingMs <= 0
        ? t("orderCheckoutQrExpired")
        : t("orderCheckoutQrCountdown", { time: formatRemaining(remainingMs) })}
    </p>
  )
}

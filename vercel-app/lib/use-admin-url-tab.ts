"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * 관리자 탭 상태를 URL query(`tab` 등)와 동기화.
 * defaultValue일 때는 query를 제거한다.
 */
export function useAdminUrlTab<T extends string>(
  paramKey: string,
  validValues: readonly T[],
  defaultValue: T
): [T, (value: T) => void] {
  const router = useRouter()
  const pathname = usePathname() || "/admin"
  const searchParams = useSearchParams()

  const tab = React.useMemo(() => {
    const raw = searchParams.get(paramKey)
    if (raw && validValues.includes(raw as T)) return raw as T
    return defaultValue
  }, [searchParams, paramKey, validValues, defaultValue])

  const setTab = React.useCallback(
    (value: T) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === defaultValue) params.delete(paramKey)
      else params.set(paramKey, value)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams, paramKey, defaultValue]
  )

  return [tab, setTab]
}

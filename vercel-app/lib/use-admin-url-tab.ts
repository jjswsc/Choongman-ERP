"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useErpPageActive, useErpPageActiveRef } from "@/lib/erp-page-visibility"

function readTabFromSearchParams<T extends string>(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
  paramKey: string,
  validValues: readonly T[],
  defaultValue: T
): T {
  const raw = searchParams.get(paramKey)
  if (raw && validValues.includes(raw as T)) return raw as T
  return defaultValue
}

/**
 * 관리자 탭 상태를 URL query(`tab` 등)와 동기화.
 * defaultValue일 때는 query를 제거한다.
 *
 * keep-alive 숨김 중에도 useSearchParams는 **활성 탭 URL**을 반환한다.
 * URL을 그대로 파생하면 다른 메뉴로 갔을 때 defaultValue로 돌아가며
 * TabsContent가 unmount되어 조회 상태가 사라진다 → local state + 활성일 때만 동기화.
 */
export function useAdminUrlTab<T extends string>(
  paramKey: string,
  validValues: readonly T[],
  defaultValue: T
): [T, (value: T) => void] {
  const router = useRouter()
  const pathname = usePathname() || "/admin"
  const searchParams = useSearchParams()
  const pageActive = useErpPageActive()
  const pageActiveRef = useErpPageActiveRef()

  const [tab, setTabState] = React.useState<T>(() =>
    readTabFromSearchParams(searchParams, paramKey, validValues, defaultValue)
  )

  React.useEffect(() => {
    // pageActive를 deps에 넣으면 복귀 시 effect가 돌며 URL에 탭이 없을 때 default로 덮일 수 있음.
    // 활성일 때만 searchParams 변화를 반영한다.
    if (!pageActiveRef.current) return
    const next = readTabFromSearchParams(searchParams, paramKey, validValues, defaultValue)
    setTabState((prev) => (prev === next ? prev : next))
  }, [searchParams, paramKey, validValues, defaultValue, pageActiveRef])

  const setTab = React.useCallback(
    (value: T) => {
      setTabState(value)
      if (!pageActiveRef.current) return
      const params = new URLSearchParams(searchParams.toString())
      if (value === defaultValue) params.delete(paramKey)
      else params.set(paramKey, value)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams, paramKey, defaultValue, pageActiveRef]
  )

  // 활성으로 돌아올 때 URL에 유효 탭이 있으면 맞춤(하드 복귀·풀 href).
  // fiber가 유지된 경우 local이 이미 맞으면 no-op.
  React.useEffect(() => {
    if (!pageActive) return
    const next = readTabFromSearchParams(searchParams, paramKey, validValues, defaultValue)
    const raw = searchParams.get(paramKey)
    // URL에 탭이 명시된 경우만 덮어씀 — 없으면 local(조회 중이던 탭) 유지
    if (!raw || !validValues.includes(raw as T)) return
    setTabState((prev) => (prev === next ? prev : next))
  }, [pageActive, searchParams, paramKey, validValues, defaultValue])

  return [tab, setTab]
}

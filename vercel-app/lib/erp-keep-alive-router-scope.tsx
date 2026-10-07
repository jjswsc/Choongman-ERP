"use client"

import * as React from "react"
import {
  NavigationPromisesContext,
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime"

/**
 * keep-alive 슬롯마다 usePathname/useSearchParams를 그 화면의 주소로 고정한다.
 *
 * Next 훅은 레이아웃 전역 주소를 본다. 숨긴 화면도 방금 연 메뉴의 쿼리를 받아
 * 탭·필터·조회 결과를 지운다. 슬롯 fullHref가 같으면 SearchParams 객체도 유지해
 * effect가 다시 돌지 않게 한다.
 *
 * NavigationPromisesContext를 비우면 개발 모드 내비게이션 중 useSearchParams가
 * 숨긴 슬롯의 Suspense를 풀어 조회 state를 unmount하지 않는다.
 */
export function ErpKeepAliveRouterScope({
  fullHref,
  children,
}: {
  fullHref: string
  children: React.ReactNode
}) {
  const route = React.useMemo(() => {
    const q = fullHref.indexOf("?")
    const pathname = (q >= 0 ? fullHref.slice(0, q) : fullHref) || "/"
    const search = q >= 0 ? fullHref.slice(q + 1) : ""
    return {
      pathname,
      searchParams: new URLSearchParams(search),
    }
  }, [fullHref])

  return (
    <NavigationPromisesContext.Provider value={null}>
      <PathnameContext.Provider value={route.pathname}>
        <SearchParamsContext.Provider value={route.searchParams}>
          {children}
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </NavigationPromisesContext.Provider>
  )
}

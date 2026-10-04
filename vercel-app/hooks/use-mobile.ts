import * as React from "react"

/**
 * 폰/커버만 모바일 셸. Galaxy Z Fold 내부(~752 CSS px)는 PC 셸로 본다.
 * Tailwind `--breakpoint-md`(globals.css)와 반드시 같은 값으로 유지.
 */
export const MOBILE_BREAKPOINT = 700

/** 쿠키 없을 때 이 폭 미만이면 사이드바 기본 접힘(아이콘 rail). 넓은 PC(≥1024)는 펼침 유지. */
export const SIDEBAR_COMPACT_MAX_WIDTH = 1024

function subscribeMobile(onStoreChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onStoreChange)
  window.addEventListener("resize", onStoreChange)
  return () => {
    mql.removeEventListener("change", onStoreChange)
    window.removeEventListener("resize", onStoreChange)
  }
}

function getMobileSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

/** SSR·하이드레이션 첫 프레임은 PC(넓은 화면) 가정 — 커버는 직후 클라이언트로 맞춤 */
function getMobileServerSnapshot() {
  return false
}

/**
 * useSyncExternalStore: matchMedia/resize와 동기화.
 * 예전 `!!undefined === false` 후 useEffect 갱신보다 구독·리사이즈가 안정적.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribeMobile, getMobileSnapshot, getMobileServerSnapshot)
}

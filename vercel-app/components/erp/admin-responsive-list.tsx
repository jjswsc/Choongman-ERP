"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { ADMIN_TABLE_SCROLL_VIEWPORT_CN } from "@/lib/admin-ui-standards"

/** md 이상(데스크톱)만 표시 — 표·다열 그리드용 */
export function AdminDesktopOnly({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn("hidden md:block", className)}>{children}</div>
}

/** md 미만(폰)만 표시 — 카드 리스트용 */
export function AdminMobileOnly({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn("md:hidden", className)}>{children}</div>
}

/**
 * 표 스크롤 래퍼.
 * - 좁은 화면: 「옆으로 밀어서 보세요」힌트
 * - 기본: 뷰포트 높이(max-h) 안에서 가로·세로 스크롤 → 가로 스크롤바가 항상 표 하단에 보임
 * - stickyHorizontal: 표가 화면보다 길어 네이티브 가로바가 화면 밖일 때, 뷰포트 하단에 동기화 바 표시
 */
export function AdminTableScroll({
  children,
  className,
  hint = true,
  /** false면 max-h를 강제하지 않음(페이지 전체 세로 스크롤 유지). sticky 가로바는 계속 동작 */
  lockViewport = true,
  stickyHorizontal = true,
}: {
  children: React.ReactNode
  className?: string
  hint?: boolean
  lockViewport?: boolean
  stickyHorizontal?: boolean
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const stickyRef = React.useRef<HTMLDivElement>(null)
  const syncingRef = React.useRef<"main" | "sticky" | null>(null)
  const [sticky, setSticky] = React.useState<{
    visible: boolean
    left: number
    width: number
    scrollWidth: number
  }>({ visible: false, left: 0, width: 0, scrollWidth: 0 })

  const updateSticky = React.useCallback(() => {
    const el = scrollRef.current
    if (!el || !stickyHorizontal) {
      setSticky((s) => (s.visible ? { ...s, visible: false } : s))
      return
    }
    const needsH = el.scrollWidth > el.clientWidth + 1
    const rect = el.getBoundingClientRect()
    const vh = window.innerHeight
    const intersects = rect.top < vh && rect.bottom > 0
    // 네이티브 가로 스크롤바는 컨테이너 바닥에 있음 → 그 바닥이 뷰포트 안에 있으면 sticky 불필요
    const nativeBarInView = rect.bottom <= vh + 1 && rect.bottom > 12
    const next = {
      visible: needsH && intersects && !nativeBarInView,
      left: Math.max(0, rect.left),
      width: Math.max(0, rect.width),
      scrollWidth: el.scrollWidth,
    }
    setSticky((prev) =>
      prev.visible === next.visible &&
      Math.abs(prev.left - next.left) < 0.5 &&
      Math.abs(prev.width - next.width) < 0.5 &&
      prev.scrollWidth === next.scrollWidth
        ? prev
        : next
    )
    const bar = stickyRef.current
    if (bar && Math.abs(bar.scrollLeft - el.scrollLeft) > 1) {
      syncingRef.current = "main"
      bar.scrollLeft = el.scrollLeft
      syncingRef.current = null
    }
  }, [stickyHorizontal])

  React.useEffect(() => {
    if (!stickyHorizontal) return
    const el = scrollRef.current
    if (!el) return

    updateSticky()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateSticky()) : null
    ro?.observe(el)
    const onScrollOrResize = () => updateSticky()
    window.addEventListener("scroll", onScrollOrResize, true)
    window.addEventListener("resize", onScrollOrResize)
    el.addEventListener("scroll", onScrollOrResize)

    return () => {
      ro?.disconnect()
      window.removeEventListener("scroll", onScrollOrResize, true)
      window.removeEventListener("resize", onScrollOrResize)
      el.removeEventListener("scroll", onScrollOrResize)
    }
  }, [stickyHorizontal, updateSticky, children])

  // sticky 바가 다시 보일 때 가로 위치 동기화
  React.useLayoutEffect(() => {
    if (!sticky.visible) return
    const el = scrollRef.current
    const bar = stickyRef.current
    if (!el || !bar) return
    bar.scrollLeft = el.scrollLeft
  }, [sticky.visible, sticky.scrollWidth])

  return (
    <div className="relative">
      {hint ? (
        <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground md:hidden">
          {tOr(t, "adminTableScrollHint", "표를 좌우로 밀어 보세요")}
        </p>
      ) : null}
      <div
        ref={scrollRef}
        className={cn(
          // 가로·세로를 한 컨테이너에서 처리 → max-h 사용 시 가로 스크롤바가 항상 뷰포트 하단에 보임
          "overflow-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]",
          lockViewport ? ADMIN_TABLE_SCROLL_VIEWPORT_CN : null,
          className
        )}
      >
        {children}
      </div>
      {sticky.visible ? (
        <div
          ref={stickyRef}
          className="fixed z-40 h-3.5 overflow-x-auto overflow-y-hidden border-t border-border/70 bg-background/90 shadow-[0_-2px_8px_-4px_rgba(0,0,0,0.12)] backdrop-blur-sm"
          style={{ left: sticky.left, width: sticky.width, bottom: 0 }}
          aria-hidden
          onScroll={(e) => {
            const main = scrollRef.current
            if (!main || syncingRef.current === "main") return
            syncingRef.current = "sticky"
            main.scrollLeft = e.currentTarget.scrollLeft
            syncingRef.current = null
          }}
        >
          <div style={{ width: sticky.scrollWidth, height: 1 }} />
        </div>
      ) : null}
    </div>
  )
}

/** 모바일 카드 리스트 행 공통 스타일 */
export const ADMIN_MOBILE_CARD_ROW_CN =
  "w-full border-b border-border/60 px-3 py-3 text-left last:border-b-0 active:bg-muted/40"

export const ADMIN_MOBILE_CARD_LIST_CN = "divide-y divide-border/60 md:hidden"

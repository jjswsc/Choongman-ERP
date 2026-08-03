"use client"

import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"

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
 * 표 스크롤 래퍼. 좁은 화면에서만 「옆으로 밀어서 보세요」힌트 표시.
 * className(예: max-h + overflow-auto)은 스크롤 컨테이너에 붙여
 * 가로·세로 스크롤을 한 곳에서 처리한다 — 세로로 내려도 가로 스크롤바가 맨 아래에 고정된다.
 */
export function AdminTableScroll({
  children,
  className,
  hint = true,
}: {
  children: React.ReactNode
  className?: string
  hint?: boolean
}) {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <div className="relative">
      {hint ? (
        <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground md:hidden">
          {tOr(t, "adminTableScrollHint", "표를 좌우로 밀어 보세요")}
        </p>
      ) : null}
      <div
        className={cn(
          // 가로·세로를 한 컨테이너에서 처리 → max-h 사용 시 가로 스크롤바가 항상 뷰포트 하단에 보임
          "overflow-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]",
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** 모바일 카드 리스트 행 공통 스타일 */
export const ADMIN_MOBILE_CARD_ROW_CN =
  "w-full border-b border-border/60 px-3 py-3 text-left last:border-b-0 active:bg-muted/40"

export const ADMIN_MOBILE_CARD_LIST_CN = "divide-y divide-border/60 md:hidden"

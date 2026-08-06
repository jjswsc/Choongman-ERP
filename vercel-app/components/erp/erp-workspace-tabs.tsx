"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { LayoutDashboard, MoreHorizontal, RotateCw, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { isErpKeepAliveExcluded } from "@/lib/erp-keep-alive-config"
import { normalizeErpHref, useErpNavigation } from "@/lib/erp-navigation"
import {
  isErpWorkspaceDashboardHref,
  resolveErpWorkspaceTabHref,
  subscribeErpWorkspaceTabsEvicted,
} from "@/lib/erp-workspace-tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function tabLabelFallback(href: string): string {
  const path = href.split("?")[0] || href
  const parts = path.split("/").filter(Boolean)
  return parts[parts.length - 1] || href
}

/** 크롬형 탭 곡선 — 활성 탭 하단 좌·우 오목 모서리 */
function ChromeTabCurve({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-0 h-2.5 w-2.5 text-card",
        side === "left" ? "-left-2.5" : "-right-2.5"
      )}
    >
      <svg viewBox="0 0 10 10" className="h-full w-full fill-current" preserveAspectRatio="none">
        {side === "left" ? (
          <path d="M10 10 C10 4.5 5.5 0 0 0 L10 0 Z" />
        ) : (
          <path d="M0 10 C0 4.5 4.5 0 10 0 L0 0 Z" />
        )}
      </svg>
    </span>
  )
}

export function ErpWorkspaceTabs() {
  const { lang } = useLang()
  const t = useT(lang)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    workspaceTabs,
    softDisplayHref,
    activateWorkspaceTab,
    closeWorkspaceTab,
    closeOtherWorkspaceTabs,
    refreshWorkspaceTab,
    reorderWorkspaceTabs,
  } = useErpNavigation()
  const [lruHint, setLruHint] = React.useState<string | null>(null)
  const [dragOverHref, setDragOverHref] = React.useState<string | null>(null)
  const dragFromRef = React.useRef<string | null>(null)

  const routerActiveHref = resolveErpWorkspaceTabHref(
    normalizeErpHref(pathname || "", searchParams.toString() ? `?${searchParams.toString()}` : "")
  )
  const activeHref = softDisplayHref || routerActiveHref

  React.useEffect(() => {
    return subscribeErpWorkspaceTabsEvicted((evicted) => {
      const names = evicted.map((e) =>
        e.titleKey ? t(e.titleKey) || tabLabelFallback(e.href) : tabLabelFallback(e.href)
      )
      const template = tOr(t, "erpWorkspaceTabLruClosed", "탭 한도 초과로 닫힘: {names}")
      setLruHint(template.replace("{names}", names.join(", ")))
    })
  }, [t])

  React.useEffect(() => {
    if (!lruHint) return
    const id = window.setTimeout(() => setLruHint(null), 4500)
    return () => window.clearTimeout(id)
  }, [lruHint])

  if (pathname === "/admin/login") return null

  const closeLabel = tOr(t, "erpCloseTab", "탭 닫기")
  const refreshLabel = tOr(t, "erpRefreshTab", "탭 새로고침")
  const remountHint = tOr(t, "erpWorkspaceTabRemountHint", "다른 메뉴로 나갔다 오면 새로 불러옵니다")
  const closeOthersLabel = tOr(t, "erpCloseOtherTabs", "다른 탭 닫기")
  const dragHint = tOr(t, "erpWorkspaceTabDragHint", "드래그하여 순서 변경")
  const canCloseOthers = workspaceTabs.some(
    (tab) => !isErpWorkspaceDashboardHref(tab.href) && tab.href !== activeHref
  )

  return (
    <div className="relative min-w-0 flex-1">
      <div
        className="flex min-w-0 items-end gap-0 overflow-x-auto overscroll-x-contain px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={tOr(t, "erpWorkspaceTabs", "열린 화면")}
      >
        {workspaceTabs.map((tab, index) => {
          const active = tab.href === activeHref
          const isDash = isErpWorkspaceDashboardHref(tab.href)
          const remountOnLeave = isErpKeepAliveExcluded(tab.href)
          const label = tab.titleKey
            ? t(tab.titleKey) || tabLabelFallback(tab.href)
            : tabLabelFallback(tab.href)
          const titleParts = [label]
          if (active) titleParts.push(refreshLabel)
          if (remountOnLeave) titleParts.push(remountHint)
          if (!isDash) titleParts.push(dragHint)
          const isDropTarget = dragOverHref === tab.href && dragFromRef.current !== tab.href

          return (
            <div
              key={tab.href}
              role="presentation"
              draggable={!isDash}
              onDragStart={(e) => {
                if (isDash) return
                dragFromRef.current = tab.href
                e.dataTransfer.setData("text/plain", tab.href)
                e.dataTransfer.effectAllowed = "move"
              }}
              onDragOver={(e) => {
                if (isDash || !dragFromRef.current) return
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
                if (dragOverHref !== tab.href) setDragOverHref(tab.href)
              }}
              onDragLeave={() => {
                if (dragOverHref === tab.href) setDragOverHref(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = dragFromRef.current || e.dataTransfer.getData("text/plain")
                dragFromRef.current = null
                setDragOverHref(null)
                if (!from || isDash) return
                reorderWorkspaceTabs(from, tab.href)
              }}
              onDragEnd={() => {
                dragFromRef.current = null
                setDragOverHref(null)
              }}
              className={cn(
                "group relative flex h-9 max-w-[10.5rem] shrink-0 items-stretch sm:max-w-[14rem] sm:h-[2.125rem]",
                index > 0 && "-ml-1",
                active ? "z-20" : "z-10 hover:z-[15]",
                !isDash && "cursor-grab active:cursor-grabbing",
                isDropTarget && "z-30"
              )}
              onAuxClick={(e) => {
                if (e.button !== 1 || isDash) return
                e.preventDefault()
                closeWorkspaceTab(tab.href)
              }}
              onContextMenu={(e) => {
                if (!active || !canCloseOthers) return
                e.preventDefault()
                closeOtherWorkspaceTabs(tab.href)
              }}
            >
              <div
                className={cn(
                  "relative flex min-w-0 flex-1 items-center rounded-t-[10px] border border-b-0 px-0.5 transition-[background-color,box-shadow,color,transform] duration-150",
                  active
                    ? "border-border/70 bg-card text-foreground shadow-[0_-1px_0_0_hsl(var(--card))]"
                    : "border-transparent bg-transparent text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]",
                  remountOnLeave && !active && "opacity-90",
                  isDropTarget && "ring-2 ring-primary/40 ring-inset"
                )}
              >
                {active ? (
                  <>
                    <ChromeTabCurve side="left" />
                    <ChromeTabCurve side="right" />
                  </>
                ) : null}

                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={titleParts.join(" — ")}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-1.5 truncate py-1.5 pl-2.5 text-left text-[12px] font-medium leading-none sm:text-[13px]",
                    isDash ? "pr-2.5" : "pr-0.5"
                  )}
                  onClick={() => {
                    if (!active) activateWorkspaceTab(tab.href)
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    refreshWorkspaceTab(tab.href)
                  }}
                >
                  {isDash ? (
                    <LayoutDashboard
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        active ? "text-primary" : "text-muted-foreground"
                      )}
                      aria-hidden
                    />
                  ) : remountOnLeave ? (
                    <span
                      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-amber-500/15 text-[9px] font-bold text-amber-700 dark:text-amber-300"
                      title={remountHint}
                    >
                      *
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        active ? "bg-primary" : "bg-muted-foreground/35 group-hover:bg-muted-foreground/55"
                      )}
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0 truncate">{label}</span>
                </button>

                {active ? (
                  <button
                    type="button"
                    className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100 sm:inline-flex"
                    title={refreshLabel}
                    aria-label={`${refreshLabel}: ${label}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      refreshWorkspaceTab(tab.href)
                    }}
                  >
                    <RotateCw className="h-3 w-3" />
                  </button>
                ) : null}

                {!isDash ? (
                  <button
                    type="button"
                    className={cn(
                      "mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
                      active
                        ? "opacity-80"
                        : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    )}
                    title={closeLabel}
                    aria-label={`${closeLabel}: ${label}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      closeWorkspaceTab(tab.href)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}

        {canCloseOthers ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mb-0.5 ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]"
                title={closeOthersLabel}
                aria-label={closeOthersLabel}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[10rem]">
              <DropdownMenuItem
                className="text-xs"
                onClick={() => closeOtherWorkspaceTabs(activeHref)}
              >
                {closeOthersLabel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {lruHint ? (
        <div
          className="pointer-events-none absolute left-2 top-full z-40 mt-1 max-w-[min(24rem,70vw)] truncate rounded-md border border-amber-500/40 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-950 shadow-sm dark:bg-amber-950/90 dark:text-amber-50"
          role="status"
        >
          {lruHint}
        </div>
      ) : null}
    </div>
  )
}

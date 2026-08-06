"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { RotateCw, X } from "lucide-react"
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

function tabLabelFallback(href: string): string {
  const path = href.split("?")[0] || href
  const parts = path.split("/").filter(Boolean)
  return parts[parts.length - 1] || href
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
      const template = t("erpWorkspaceTabLruClosed") || "탭 한도 초과로 닫힘: {names}"
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
  const canCloseOthers = workspaceTabs.some(
    (tab) => !isErpWorkspaceDashboardHref(tab.href) && tab.href !== activeHref
  )

  return (
    <div className="relative flex min-w-0 flex-1 flex-col justify-center">
      <div
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={t("erpWorkspaceTabs") || "열린 화면"}
      >
        {workspaceTabs.map((tab) => {
          const active = tab.href === activeHref
          const isDash = isErpWorkspaceDashboardHref(tab.href)
          const remountOnLeave = isErpKeepAliveExcluded(tab.href)
          const label = tab.titleKey
            ? t(tab.titleKey) || tabLabelFallback(tab.href)
            : tabLabelFallback(tab.href)
          const titleParts = [label]
          if (active) titleParts.push(refreshLabel)
          if (remountOnLeave) titleParts.push(remountHint)
          if (!isDash) titleParts.push(t("erpWorkspaceTabDragHint") || "드래그하여 순서 변경")

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
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = dragFromRef.current || e.dataTransfer.getData("text/plain")
                dragFromRef.current = null
                if (!from || isDash) return
                reorderWorkspaceTabs(from, tab.href)
              }}
              onDragEnd={() => {
                dragFromRef.current = null
              }}
              className={cn(
                "group relative flex h-8 max-w-[11rem] shrink-0 items-stretch rounded-md border text-xs sm:max-w-[13rem]",
                active
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                remountOnLeave && !active && "border-dashed border-muted-foreground/25",
                !isDash && "cursor-grab active:cursor-grabbing"
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
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={titleParts.join(" — ")}
                className={cn(
                  "min-w-0 flex-1 truncate px-2 text-left font-medium",
                  isDash ? "pr-2" : "pr-0.5"
                )}
                onClick={() => {
                  if (!active) activateWorkspaceTab(tab.href)
                }}
                onDoubleClick={(e) => {
                  e.preventDefault()
                  refreshWorkspaceTab(tab.href)
                }}
              >
                {remountOnLeave ? (
                  <span className="mr-0.5 inline-block text-[9px] font-semibold text-amber-700/90 dark:text-amber-300/90">
                    *
                  </span>
                ) : null}
                {label}
              </button>
              {active ? (
                <button
                  type="button"
                  className="hidden h-full w-6 shrink-0 items-center justify-center text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100 sm:flex"
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
                  className="flex h-full w-6 shrink-0 items-center justify-center rounded-r-md text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100 group-hover:opacity-100"
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
          )
        })}
        {canCloseOthers ? (
          <button
            type="button"
            className="ml-0.5 hidden h-8 shrink-0 rounded-md border border-transparent px-1.5 text-[10px] text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground sm:inline-flex sm:items-center"
            title={closeOthersLabel}
            onClick={() => closeOtherWorkspaceTabs(activeHref)}
          >
            {closeOthersLabel}
          </button>
        ) : null}
      </div>
      {lruHint ? (
        <div
          className="pointer-events-none absolute left-0 top-full z-40 mt-0.5 max-w-[min(24rem,70vw)] truncate rounded border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-950 shadow-sm dark:bg-amber-950/90 dark:text-amber-50"
          role="status"
        >
          {lruHint}
        </div>
      ) : null}
    </div>
  )
}

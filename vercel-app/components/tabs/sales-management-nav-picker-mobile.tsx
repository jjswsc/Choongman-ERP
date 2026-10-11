"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { I18N_KO } from "@/components/tabs/sales-management-shared"
import { Input } from "@/components/ui/input"
import type { SalesUserSelection } from "@/components/tabs/sales-management-view-types"
import type { SalesSubMenuConfig, SalesTopicConfig } from "@/components/tabs/sales-management-ia"

export interface SalesManagementNavPickerMobileProps {
  salesNavPickerRef: React.RefObject<HTMLDivElement | null>
  salesNavPickerBtnId: string
  salesNavPickerOpen: boolean
  salesNavPickerListId: string
  setOrderTypesPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  setPeriodPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  setSalesNavPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  setSalesNavQuery: React.Dispatch<React.SetStateAction<string>>
  tr: (key: string, fallback: string) => string
  currentSubMenu: SalesSubMenuConfig
  selectedTopic: SalesTopicConfig
  salesNavQuery: string
  filteredSalesNavRows: { subMenuId: string; topicId: string; menuLabel: string; topicLabel: string; haystack: string }[]
  activeSubMenuId: string
  selectedTopicId: string
  userSelectedRef: React.RefObject<SalesUserSelection>
  setActiveSubMenuId: React.Dispatch<React.SetStateAction<string>>
  setSelectedTopicBySubMenu: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

export function SalesManagementNavPickerMobile({
  salesNavPickerRef,
  salesNavPickerBtnId,
  salesNavPickerOpen,
  salesNavPickerListId,
  setOrderTypesPickerOpen,
  setPeriodPickerOpen,
  setSalesNavPickerOpen,
  setSalesNavQuery,
  tr,
  currentSubMenu,
  selectedTopic,
  salesNavQuery,
  filteredSalesNavRows,
  activeSubMenuId,
  selectedTopicId,
  userSelectedRef,
  setActiveSubMenuId,
  setSelectedTopicBySubMenu,
}: SalesManagementNavPickerMobileProps) {
  return (
    <div className="relative mb-3 md:hidden" ref={salesNavPickerRef}>
      <Button
        id={salesNavPickerBtnId}
        type="button"
        variant="outline"
        className="h-10 w-full justify-between gap-2"
        aria-expanded={salesNavPickerOpen}
        aria-controls={salesNavPickerListId}
        aria-haspopup="dialog"
        onClick={() => {
          setOrderTypesPickerOpen(false)
          setPeriodPickerOpen(false)
          setSalesNavPickerOpen((prev) => {
            const next = !prev
            if (next) setSalesNavQuery("")
            return next
          })
        }}
      >
        <span className="min-w-0 truncate text-left text-sm font-medium">
          <span className="text-muted-foreground">
            {tr(currentSubMenu.labelKey, currentSubMenu.fallbackLabel)}
          </span>
          <span className="mx-1 text-muted-foreground">·</span>
          <span>{tr(selectedTopic.labelKey, I18N_KO[selectedTopic.labelKey] ?? selectedTopic.labelKey)}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{salesNavPickerOpen ? "▲" : "▼"}</span>
      </Button>
      {salesNavPickerOpen ? (
        <div
          id={salesNavPickerListId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={salesNavPickerBtnId}
          className="absolute z-30 mt-1 w-full rounded-lg border bg-background shadow-lg"
        >
          <div className="border-b p-2">
            <Input
              value={salesNavQuery}
              onChange={(e) => setSalesNavQuery(e.target.value)}
              placeholder={tr("salesReportMenuSearchPh", "메뉴·주제 검색…")}
              className="h-9"
              autoFocus
            />
          </div>
          <ul className="max-h-[min(60vh,320px)] overflow-y-auto py-1" role="listbox">
            {filteredSalesNavRows.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                {tr("salesDataNone", "데이터 없음")}
              </li>
            ) : (
              filteredSalesNavRows.map((row) => {
                const activeRow = row.subMenuId === activeSubMenuId && row.topicId === selectedTopicId
                return (
                  <li key={`${row.subMenuId}-${row.topicId}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeRow}
                      className={
                        "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-muted/80 " +
                        (activeRow ? "bg-muted" : "")
                      }
                      onClick={() => {
                        userSelectedRef.current.subMenu = row.subMenuId
                        userSelectedRef.current.topic = row.topicId
                        setActiveSubMenuId(row.subMenuId)
                        setSelectedTopicBySubMenu((prev) => ({
                          ...prev,
                          [row.subMenuId]: row.topicId,
                        }))
                        setSalesNavPickerOpen(false)
                        setSalesNavQuery("")
                      }}
                    >
                      <span className="text-xs text-muted-foreground">{row.menuLabel}</span>
                      <span className="font-medium">{row.topicLabel}</span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

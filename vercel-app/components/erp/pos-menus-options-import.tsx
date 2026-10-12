"use client"

import * as React from "react"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import { cn } from "@/lib/utils"
import type { PosMenu } from "@/lib/api-client"
import type { OptionsConfigLibraryItemRow } from "@/app/admin/pos-menus/pos-menus-page-helpers"

export interface PosMenuOptionsImportSectionProps {
  t: (k: string) => string
  optionsConfigCopySourceMenuId: string
  setOptionsConfigCopySourceMenuId: React.Dispatch<React.SetStateAction<string>>
  optionsConfigSelectedMenuId: string | null
  optionsConfigCopying: boolean
  optionsConfigCopySourceMenus: PosMenu[]
  handleImportOptionsFromExistingMenu: () => Promise<void>
  optionsConfigLibrarySearchTerm: string
  setOptionsConfigLibrarySearchTerm: React.Dispatch<React.SetStateAction<string>>
  optionsConfigLibraryFilter: "all" | "recent" | "frequent" | "deliveryOnly"
  setOptionsConfigLibraryFilter: React.Dispatch<React.SetStateAction<"all" | "recent" | "frequent" | "deliveryOnly">>
  optionsConfigLibraryLoading: boolean
  optionsConfigLibraryItems: OptionsConfigLibraryItemRow[]
  handleUseOptionTemplateFromLibrary: (groupId: string) => Promise<void>
}

export function PosMenuOptionsImportSection({
  t,
  optionsConfigCopySourceMenuId,
  setOptionsConfigCopySourceMenuId,
  optionsConfigSelectedMenuId,
  optionsConfigCopying,
  optionsConfigCopySourceMenus,
  handleImportOptionsFromExistingMenu,
  optionsConfigLibrarySearchTerm,
  setOptionsConfigLibrarySearchTerm,
  optionsConfigLibraryFilter,
  setOptionsConfigLibraryFilter,
  optionsConfigLibraryLoading,
  optionsConfigLibraryItems,
  handleUseOptionTemplateFromLibrary,
}: PosMenuOptionsImportSectionProps) {
  return (
    <div className="rounded border bg-muted/10 p-3 space-y-4">
      <div>
        <p className="text-xs font-semibold">
          {t("posOptionImportCardTitle") || "옵션 가져오기 · 공통 그룹 연결"}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("posOptionImportCardHint") ||
            "다른 메뉴에서 옵션 단계와 항목을 복사하거나, 저장된 공통 옵션그룹을 현재 메뉴에 연결합니다."}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          {t("posOptionImportFromMenuLabel") || "다른 메뉴에서 복사"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t("posOptionCopyFromMenuHint") ||
            "원본 메뉴의 옵션 단계/옵션 항목을 가져옵니다. option_code는 우선 유지하고 충돌 시 자동 재매핑됩니다."}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            value={optionsConfigCopySourceMenuId || "__none__"}
            onValueChange={(v) => setOptionsConfigCopySourceMenuId(v === "__none__" ? "" : v)}
            disabled={!optionsConfigSelectedMenuId || optionsConfigCopying}
          >
            <SelectTrigger className="h-8 min-w-[240px] text-xs">
              <SelectValue placeholder={t("posOptionCopySourceSelect") || "원본 메뉴 선택"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("posOptionCopySourceSelect") || "원본 메뉴 선택"}</SelectItem>
              {optionsConfigCopySourceMenus.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.code} - {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void handleImportOptionsFromExistingMenu()}
            disabled={!optionsConfigCopySourceMenuId || optionsConfigCopying || !optionsConfigSelectedMenuId}
          >
            {optionsConfigCopying
              ? t("loading") || "로딩 중..."
              : t("posOptionCopyImportButton") || "옵션 가져오기"}
          </Button>
        </div>
      </div>

      <div className="border-t border-border/60 pt-3 space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          {t("posOptionTemplateLibraryTitle") || "공통 옵션 목록"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t("posOptionImportLibraryHint") ||
            "목록에서 공통 옵션그룹을 고른 뒤 [이 그룹 사용]으로 연결합니다. 이미 연결된 그룹은 다시 넣을 수 없습니다."}
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="min-w-[160px] flex-1">
            <label className="text-[11px] text-muted-foreground block mb-0.5">
              {t("itemsSearchPh") || "검색"}
            </label>
            <Input
              className="h-8 text-xs"
              placeholder={t("posOptionTemplateSearchPlaceholder") || ""}
              value={optionsConfigLibrarySearchTerm}
              onChange={(e) => setOptionsConfigLibrarySearchTerm(e.target.value)}
              disabled={!optionsConfigSelectedMenuId}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["all", t("noticeFilterAll") || "전체"],
              ["recent", t("posOptionTemplateFilterRecent") || "최근"],
              ["frequent", t("posOptionTemplateFilterFrequent") || "자주"],
              ["deliveryOnly", t("posOptionTemplateFilterDeliveryOnly") || "배달 전용"],
            ] as const
          ).map(([key, lab]) => (
            <Button
              key={key}
              type="button"
              variant={optionsConfigLibraryFilter === key ? "default" : "outline"}
              size="sm"
              className={`${ADMIN_BTN_XS_CN} text-[11px]`}
              disabled={!optionsConfigSelectedMenuId}
              onClick={() => setOptionsConfigLibraryFilter(key)}
            >
              {lab}
            </Button>
          ))}
        </div>
        <div className="max-h-[320px] overflow-y-auto rounded border bg-background p-2 space-y-2">
          {optionsConfigLibraryLoading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t("loading") || "로딩 중..."}
            </p>
          ) : optionsConfigLibraryItems.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t("posOptionTemplateListEmpty") || "목록이 비어 있습니다."}
            </p>
          ) : (
            optionsConfigLibraryItems.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-mono font-semibold leading-snug break-all text-foreground">
                    {row.groupCode}
                  </p>
                  <p className="text-[11px] leading-snug break-words text-foreground/90">
                    {row.groupTitle}
                  </p>
                  {row.groupKey ? (
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {(t("posOptionTemplateStepKeyLabel") || "단계 key").replace("{key}", row.groupKey)}
                    </p>
                  ) : null}
                  {row.itemLines.length > 0 ? (
                    <ul className="mt-1 max-h-[140px] list-disc space-y-0.5 overflow-y-auto pl-4 text-[11px] leading-snug text-muted-foreground marker:text-muted-foreground/80">
                      {row.itemLines.map((line, i) => (
                        <li key={`${row.id}-it-${i}`} className="break-words">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-amber-800 dark:text-amber-200/90">
                      {t("posOptionTemplateGroupNoItems")}
                    </p>
                  )}
                  {row.footerNote ? (
                    <p className="text-[10px] text-muted-foreground">{row.footerNote}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={row.canUse ? "default" : "secondary"}
                  className={cn(
                    "h-auto min-h-8 shrink-0 cursor-pointer self-stretch px-3 py-2 text-[11px] font-semibold sm:self-start sm:min-w-[7.5rem]",
                    row.canUse && "shadow-sm ring-1 ring-primary/25 hover:ring-primary/40"
                  )}
                  disabled={!optionsConfigSelectedMenuId || !row.canUse}
                  title={
                    !row.canUse
                      ? (t("posOptionTemplateUseDisabledHint") ||
                          "공통 그룹에 저장된 항목이 있을 때만 연결할 수 있습니다.")
                      : undefined
                  }
                  onClick={() => void handleUseOptionTemplateFromLibrary(row.id)}
                >
                  {t("posOptionTemplateUseBtn") || "이 그룹 사용"}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

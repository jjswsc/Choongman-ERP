"use client"

import * as React from "react"
import { TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { newPackagingChecklistRow, type PackagingChecklistDraftRow } from "@/app/admin/pos-menus/pos-menus-page-helpers"
import { Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"

export interface PosMenuEditPackagingTabProps {
  t: (k: string) => string
  setPackagingChecklistRows: React.Dispatch<React.SetStateAction<PackagingChecklistDraftRow[]>>
  handleSavePackagingChecklist: () => Promise<void>
  packagingChecklistSaving: boolean
  packagingChecklistLoading: boolean
  packagingChecklistRows: PackagingChecklistDraftRow[]
  handlePackagingChecklistRowPatch: (localId: string, patch: Partial<PackagingChecklistDraftRow>) => void
}

export function PosMenuEditPackagingTab({
  t,
  setPackagingChecklistRows,
  handleSavePackagingChecklist,
  packagingChecklistSaving,
  packagingChecklistLoading,
  packagingChecklistRows,
  handlePackagingChecklistRowPatch,
}: PosMenuEditPackagingTabProps) {
  return (
    <TabsContent value="packagingChecklist" className="mt-4 space-y-3">
      <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold">
            {t("posPackagingChecklistTitle") || "포장 체크리스트"}
          </h4>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setPackagingChecklistRows((prev) => [...prev, newPackagingChecklistRow(prev.length)])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("posPackagingChecklistAddRow") || "항목 추가"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              onClick={handleSavePackagingChecklist}
              disabled={packagingChecklistSaving || packagingChecklistLoading}
            >
              {packagingChecklistSaving ? (t("loading") || "저장 중...") : (t("itemsBtnSave") || "저장")}
            </Button>
          </div>
        </div>
        {packagingChecklistLoading ? (
          <p className="text-xs text-muted-foreground">{t("loading") || "불러오는 중..."}</p>
        ) : packagingChecklistRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("posPackagingChecklistEmpty") || "등록된 체크 항목이 없습니다. [추가]로 첫 항목을 만드세요."}
          </p>
        ) : (
          <div className="divide-y rounded-md border bg-background">
            {packagingChecklistRows.map((row) => (
              <div key={row.localId} className="grid grid-cols-12 gap-2 p-2 md:items-end">
                <div className="col-span-12 md:col-span-8">
                  <label className="mb-1 block text-[11px] font-semibold">{t("posPackagingChecklistColItemName") || "항목명"}</label>
                  <Input
                    className="h-8 text-xs"
                    value={row.itemName}
                    onChange={(e) => handlePackagingChecklistRowPatch(row.localId, { itemName: e.target.value })}
                    placeholder={t("posPackagingChecklistItemNamePh") || "예: 소스컵 2개"}
                  />
                </div>
                <div className="col-span-6 md:col-span-4">
                  <label className="mb-1 block text-[11px] font-semibold">{t("posPackagingChecklistMenuCommon") || "메뉴 공통"}</label>
                  <div className="h-8 rounded-md border bg-muted/40 px-2 text-xs text-muted-foreground flex items-center">
                    {t("posPackagingChecklistMenuCommon") || "메뉴 공통"}
                  </div>
                </div>
                <div className="col-span-12 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2">
                      <Checkbox
                        checked={row.isRequired}
                        onCheckedChange={(v) => handlePackagingChecklistRowPatch(row.localId, { isRequired: v === true })}
                      />
                      <span>{t("posRequired") || "필수 항목"}</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <Checkbox
                        checked={row.isActive}
                        onCheckedChange={(v) => handlePackagingChecklistRowPatch(row.localId, { isActive: v === true })}
                      />
                      <span>{t("use") || "사용"}</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TabsContent>
  )
}

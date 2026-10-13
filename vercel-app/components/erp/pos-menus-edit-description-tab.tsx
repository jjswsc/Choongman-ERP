"use client"

import * as React from "react"
import { TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH,
  GRAB_MENU_MODIFIER_NAME_MAX_LENGTH,
} from "@/lib/grab-menu-limits"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import type { PosMenuOption } from "@/lib/api-client"
import type { PosMenuFormData } from "@/app/admin/pos-menus/pos-menus-page-helpers"

export interface PosMenuEditDescriptionTabProps {
  t: (k: string) => string
  formData: PosMenuFormData
  setFormData: React.Dispatch<React.SetStateAction<PosMenuFormData>>
  menuOptions: PosMenuOption[]
  selectedOptionDescId: string
  setSelectedOptionDescId: React.Dispatch<React.SetStateAction<string>>
  optionPartLabel: (name: string) => string
  optionDescDefaultDraft: string
  setOptionDescDefaultDraft: React.Dispatch<React.SetStateAction<string>>
  optionDescDeliveryDraft: string
  grabModifierDescMaxLen: number
  setOptionDescDeliveryDraft: React.Dispatch<React.SetStateAction<string>>
  selectedOptionForDesc: PosMenuOption | undefined
  grabModifierDescTooLong: boolean
  grabModifierNameTooLong: boolean
  grabModifierPreview: string
  optionDescTableDraft: string
  setOptionDescTableDraft: React.Dispatch<React.SetStateAction<string>>
}

export function PosMenuEditDescriptionTab({
  t,
  formData,
  setFormData,
  menuOptions,
  selectedOptionDescId,
  setSelectedOptionDescId,
  optionPartLabel,
  optionDescDefaultDraft,
  setOptionDescDefaultDraft,
  optionDescDeliveryDraft,
  grabModifierDescMaxLen,
  setOptionDescDeliveryDraft,
  selectedOptionForDesc,
  grabModifierDescTooLong,
  grabModifierNameTooLong,
  grabModifierPreview,
  optionDescTableDraft,
  setOptionDescTableDraft,
}: PosMenuEditDescriptionTabProps) {
  return (
    <TabsContent value="description" className="mt-4 space-y-4">
      <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-3">
        <h4 className="text-xs font-semibold">
          {t("posMenuDescriptionSection") || "메뉴 설명 (배달앱/테이블오더용)"}
        </h4>
        <div>
          <label className="text-xs font-semibold">
            {t("posMenuDescriptionDefault") || "기본 설명"}
          </label>
          <Textarea
            className="mt-1 min-h-[72px] text-xs"
            placeholder={t("posMenuDescriptionDefaultPh") || "메뉴 기본 설명을 입력하세요."}
            value={formData.descriptionDefault}
            maxLength={GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH}
            onChange={(e) =>
              setFormData((p) => ({
                ...p,
                descriptionDefault: e.target.value.slice(0, GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH),
              }))
            }
          />
          <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
            {formData.descriptionDefault.length}/{GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold">
            {t("posMenuDescriptionDelivery") || "배달앱 설명 (비우면 기본 설명 사용)"}
          </label>
          <Textarea
            className="mt-1 min-h-[60px] text-xs"
            placeholder={t("posMenuDescriptionDeliveryPh") || "Grab/LineMan 등에 노출할 설명"}
            value={formData.descriptionDelivery}
            maxLength={GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH}
            onChange={(e) =>
              setFormData((p) => ({
                ...p,
                descriptionDelivery: e.target.value.slice(0, GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH),
              }))
            }
          />
          <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
            {formData.descriptionDelivery.length}/{GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold">
            {t("posMenuDescriptionTable") || "테이블오더 설명 (비우면 기본 설명 사용)"}
          </label>
          <Textarea
            className="mt-1 min-h-[60px] text-xs"
            placeholder={t("posMenuDescriptionTablePh") || "테이블오더(QR 메뉴)용 설명"}
            value={formData.descriptionTable}
            onChange={(e) =>
              setFormData((p) => ({ ...p, descriptionTable: e.target.value }))
            }
          />
        </div>
      </div>
      <div className="rounded border border-border/70 bg-muted/20 p-3 space-y-2">
        <h4 className="text-xs font-semibold">
          {t("posOptionDescriptionEdit") || "옵션 설명 수정"}
        </h4>
        {menuOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("posOptionDescriptionEmpty") || "옵션이 없습니다. 먼저 옵션 탭에서 옵션을 추가해 주세요."}
          </p>
        ) : (
          <>
            <Select
              value={selectedOptionDescId}
              onValueChange={setSelectedOptionDescId}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue
                  placeholder={t("posOptionDescriptionSelect") || "옵션 선택"}
                />
              </SelectTrigger>
              <SelectContent>
                {menuOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {optionPartLabel(o.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOptionDescId && (
              <div className="grid gap-2">
                <div>
                  <Textarea
                    className="min-h-[56px] text-xs"
                    placeholder={t("posOptionDescriptionDefaultPh") || "옵션 기본 설명"}
                    value={optionDescDefaultDraft}
                    maxLength={GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH}
                    onChange={(e) =>
                      setOptionDescDefaultDraft(e.target.value.slice(0, GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH))
                    }
                  />
                  <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                    {optionDescDefaultDraft.length}/{GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH}
                  </div>
                </div>
                <div>
                  <Textarea
                    className="min-h-[48px] text-xs"
                    placeholder={t("posOptionDescriptionDeliveryPh") || "배달앱 옵션 설명 (비우면 기본 설명)"}
                    value={optionDescDeliveryDraft}
                    maxLength={grabModifierDescMaxLen}
                    onChange={(e) =>
                      setOptionDescDeliveryDraft(
                        e.target.value.slice(0, grabModifierDescMaxLen)
                      )
                    }
                  />
                  <div className="mt-0.5 flex items-start justify-between gap-2 text-[10px] text-muted-foreground">
                    <span className="leading-snug">
                      {t("posOptionDescriptionDeliveryGrabHint") ||
                        "Grab 손님 앱에는「옵션명 (배달 설명)」한 줄로 보이며, 합쳐서 최대 40자입니다. 비우면 기본 설명이 쓰입니다. 예: Boneless (9ชิ้น 315g)"}
                    </span>
                    <span className="shrink-0">
                      {optionDescDeliveryDraft.length}/{grabModifierDescMaxLen}
                    </span>
                  </div>
                  {selectedOptionForDesc && (
                    <div
                      className={`mt-1 rounded border px-2 py-1.5 text-[10px] leading-snug ${
                        grabModifierDescTooLong || grabModifierNameTooLong
                          ? "border-amber-500/60 bg-amber-500/10 text-amber-900 dark:text-amber-100"
                          : "border-border/60 bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <span className="font-medium">
                        {t("posOptionGrabModifierPreview") || "Grab 표시 미리보기"}:{" "}
                      </span>
                      <span className="font-mono break-all">{grabModifierPreview || "-"}</span>
                      <span className="ml-1 tabular-nums">
                        ({grabModifierPreview.length}/{GRAB_MENU_MODIFIER_NAME_MAX_LENGTH})
                      </span>
                      {(grabModifierDescTooLong || grabModifierNameTooLong) && (
                        <p className="mt-0.5">
                          {t("posOptionGrabModifierOverLimit") ||
                            "40자를 넘으면 Grab 손님 앱에서 잘립니다. 옵션명·설명을 짧게 줄이세요."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <Textarea
                  className="min-h-[48px] text-xs"
                  placeholder={t("posOptionDescriptionTablePh") || "테이블오더 옵션 설명 (비우면 기본 설명)"}
                  value={optionDescTableDraft}
                  onChange={(e) => setOptionDescTableDraft(e.target.value)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </TabsContent>
  )
}

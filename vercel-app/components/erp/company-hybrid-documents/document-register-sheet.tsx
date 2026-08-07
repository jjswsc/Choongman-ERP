"use client"

import * as React from "react"
import { CircleHelp, FileUp, Link2 } from "lucide-react"
import type { CompanyHybridDocumentCategory, CompanyHybridDocumentListItem } from "@/lib/api-client"
import type { CompanyHybridDocVisibility, CompanyHybridRelatedType } from "@/lib/company-hybrid-documents"
import { COMPANY_HYBRID_RELATED_TYPES } from "@/lib/company-hybrid-documents-related"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { CompanyHybridDocDateTextField } from "@/components/erp/company-hybrid-documents/document-date-field"
import {
  CompanyHybridDocumentCorrespondenceFields,
  type CorrespondenceFormState,
} from "@/components/erp/company-hybrid-documents/document-correspondence-fields"
import { FORM_CAT_NONE } from "@/components/erp/company-hybrid-documents/shared"

export type RegisterFormState = {
  title: string
  categoryId: string
  externalUrl: string
  visibility: CompanyHybridDocVisibility
  validFrom: string
  validTo: string
  note: string
  relatedType: CompanyHybridRelatedType
  relatedId: string
  store: string
  correspondence: CorrespondenceFormState
  showCorrFields: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: CompanyHybridDocumentListItem | null
  form: RegisterFormState
  onFormChange: (patch: Partial<RegisterFormState>) => void
  onCorrChange: (patch: Partial<CorrespondenceFormState>) => void
  categories: CompanyHybridDocumentCategory[]
  labelCategoryOption: (c: CompanyHybridDocumentCategory) => string
  storeOptions: string[]
  canPickStore: boolean
  canSave: boolean
  fileBusy: boolean
  uploadProgress: number
  t: (key: string) => string
  formatStoreLabel: (code: string) => string
  onSaveDrive: () => void
  onSaveUploadedMeta: () => void
  onPickFile: (file: File) => void
  onCancel: () => void
}

export function CompanyHybridDocumentRegisterSheet({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onCorrChange,
  categories,
  labelCategoryOption,
  storeOptions,
  canPickStore,
  canSave,
  fileBusy,
  uploadProgress,
  t,
  formatStoreLabel,
  onSaveDrive,
  onSaveUploadedMeta,
  onPickFile,
  onCancel,
}: Props) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (editing) return
    const f = e.dataTransfer.files?.[0]
    if (f) onPickFile(f)
  }

  const isDriveEdit = editing?.source === "drive"
  const isUploadEdit = editing != null && editing.source !== "drive"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b border-border/60 px-5 py-4 pr-12 text-left">
          <SheetTitle>{editing ? t("companyHybridDocEdit") : t("companyHybridDocNewRegister")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-5 py-5 pb-6">
          {canPickStore ? (
            <div className="space-y-1.5">
              <Label>{t("companyHybridDocEditStoreLabel")}</Label>
              <Select value={form.store} onValueChange={(v) => onFormChange({ store: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {storeOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatStoreLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>{t("companyHybridDocTitle")}</Label>
            <Input value={form.title} onChange={(e) => onFormChange({ title: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("companyHybridDocCategorySelect")}</Label>
            <Select value={form.categoryId} onValueChange={(v) => onFormChange({ categoryId: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FORM_CAT_NONE}>{t("companyHybridDocCategoryFilterUncat")}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={`${c.store}-${c.id}`} value={String(c.id)}>
                    {labelCategoryOption(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("companyHybridDocRelated")}</Label>
              <Select
                value={form.relatedType}
                onValueChange={(v) =>
                  onFormChange({
                    relatedType: v as CompanyHybridRelatedType,
                    relatedId: v === "none" ? "" : form.relatedId,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_HYBRID_RELATED_TYPES.map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {rt === "none"
                        ? t("companyHybridDocRelatedNone")
                        : rt === "employee"
                          ? t("companyHybridDocRelatedEmployee")
                          : rt === "store"
                            ? t("companyHybridDocRelatedStore")
                            : t("companyHybridDocRelatedInterior")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("companyHybridDocFilterRelated")}</Label>
              <Input
                value={form.relatedId}
                onChange={(e) => onFormChange({ relatedId: e.target.value })}
                placeholder={t("companyHybridDocRelatedIdPh")}
                disabled={form.relatedType === "none"}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>{t("companyHybridDocPermission")}</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={t("companyHybridDocPermissionHelpTitle")}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[min(24rem,90vw)] whitespace-normal text-left">
                    <p className="font-medium">{t("companyHybridDocPermissionHelpTitle")}</p>
                    <p className="mt-1">- {t("companyHybridDocPermissionHelpAll")}</p>
                    <p>- {t("companyHybridDocPermissionHelpOffice")}</p>
                    <p>- {t("companyHybridDocPermissionHelpStoreAdmin")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={form.visibility}
              onValueChange={(v) => onFormChange({ visibility: v as CompanyHybridDocVisibility })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("companyHybridDocPermissionAll")}</SelectItem>
                <SelectItem value="office">{t("companyHybridDocPermissionOffice")}</SelectItem>
                <SelectItem value="store_admin">{t("companyHybridDocPermissionStoreAdmin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("companyHybridDocValidFrom")}</Label>
              <CompanyHybridDocDateTextField
                value={form.validFrom}
                onChange={(v) => onFormChange({ validFrom: v })}
                placeholder={t("companyHybridDocDatePlaceholder")}
                hint={t("companyHybridDocDateFormatHint")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("companyHybridDocValidTo")}</Label>
              <CompanyHybridDocDateTextField
                value={form.validTo}
                onChange={(v) => onFormChange({ validTo: v })}
                placeholder={t("companyHybridDocDatePlaceholder")}
                hint={t("companyHybridDocDateFormatHint")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("companyHybridDocNote")}</Label>
            <Textarea
              value={form.note}
              onChange={(e) => onFormChange({ note: e.target.value })}
              placeholder={t("companyHybridDocNotePlaceholder")}
              rows={3}
            />
          </div>

          <CompanyHybridDocumentCorrespondenceFields
            show={form.showCorrFields}
            onShowChange={(show) => onFormChange({ showCorrFields: show })}
            state={form.correspondence}
            onChange={onCorrChange}
            t={t}
          />

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4" />
              {t("companyHybridDocAddDrive")}
            </div>
            <Input
              value={form.externalUrl}
              onChange={(e) => onFormChange({ externalUrl: e.target.value })}
              readOnly={isUploadEdit}
              className={isUploadEdit ? "bg-muted/50" : undefined}
              placeholder="https://"
            />
            <Button type="button" disabled={!canSave || isUploadEdit} onClick={() => onSaveDrive()}>
              {editing && isDriveEdit ? t("companyHybridDocSave") : t("companyHybridDocAddDrive")}
            </Button>
          </div>

          {!editing ? (
            <div
              className={cn(
                "space-y-2 rounded-md border border-dashed p-4 text-center transition-colors",
                dragOver && "border-primary bg-primary/5",
                fileBusy && "pointer-events-none opacity-70"
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <FileUp className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("companyHybridDocDropZone")}</p>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ""
                  if (f) onPickFile(f)
                }}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!canSave || fileBusy}
                onClick={() => fileRef.current?.click()}
              >
                {fileBusy ? t("companyHybridDocUploading") : t("companyHybridDocSelectFile")}
              </Button>
              {fileBusy && uploadProgress > 0 ? (
                <div className="space-y-1 pt-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("companyHybridDocUploadProgress").replace("{pct}", String(uploadProgress))}
                  </p>
                </div>
              ) : null}
            </div>
          ) : isUploadEdit ? (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button type="button" onClick={onSaveUploadedMeta} disabled={!canSave}>
                {t("companyHybridDocSave")}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("companyHybridDocCancel")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

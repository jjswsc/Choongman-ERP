"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { MemberPortalContentAdminList } from "@/components/admin/member-portal-content-admin-list"
import { CrmImageUploadField } from "@/components/crm/crm-image-upload-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { appConfirm } from "@/lib/app-message"
import { apiFetch } from "@/lib/api/fetch"
import {
  filterContentForAdminTab,
  type MemberPortalContentAdminItem,
  type MemberPortalContentAdminTab,
} from "@/lib/member-portal-content-admin"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import {
  formatMemberPortalContentImageHint,
  memberPortalImageUploadCatchMessage,
  readMemberPortalImageSize,
  resolveMemberPortalContentImageRule,
  validateMemberPortalImageByRule,
} from "@/lib/member-portal-content-image-rules"
import { uploadMemberPortalContentImageToStorage } from "@/lib/member-portal-image-upload"

type ContentType = "popup" | "info" | "store_photo"

type FormState = {
  contentKey: string
  contentType: ContentType
  storeCode: string
  title: string
  body: string
  imageUrl: string
  targetTab: string
  isActive: boolean
  sortOrder: number
  startsAt: string
  endsAt: string
}

const VARIANT_META_KEYS: Record<
  Exclude<MemberPortalContentAdminTab, "all">,
  {
    titleKey: string
    descKey: string
    emptyKey: string
    newKey: string
    defaultTargetTab: string
    contentType: ContentType
  }
> = {
  popup: {
    titleKey: "mpAdmin_popupTitle",
    descKey: "mpAdmin_popupDesc",
    emptyKey: "mpAdmin_popupEmpty",
    newKey: "mpAdmin_popupNew",
    defaultTargetTab: "home",
    contentType: "popup",
  },
  promo: {
    titleKey: "mpAdmin_promoTitle",
    descKey: "mpAdmin_promoDesc",
    emptyKey: "mpAdmin_promoEmpty",
    newKey: "mpAdmin_promoNew",
    defaultTargetTab: "home_promo",
    contentType: "info",
  },
  new_menu: {
    titleKey: "mpAdmin_newMenuTitle",
    descKey: "mpAdmin_newMenuDesc",
    emptyKey: "mpAdmin_newMenuEmpty",
    newKey: "mpAdmin_newMenuNew",
    defaultTargetTab: "home_feature",
    contentType: "info",
  },
  info: {
    titleKey: "mpAdmin_infoTitle",
    descKey: "mpAdmin_infoDesc",
    emptyKey: "mpAdmin_infoEmpty",
    newKey: "mpAdmin_infoNew",
    defaultTargetTab: "home",
    contentType: "info",
  },
}

function variantMetaFor(t: (k: string) => string, variant: Exclude<MemberPortalContentAdminTab, "all">) {
  const keys = VARIANT_META_KEYS[variant]
  return {
    title: t(keys.titleKey),
    description: t(keys.descKey),
    empty: t(keys.emptyKey),
    newLabel: t(keys.newKey),
    defaultTargetTab: keys.defaultTargetTab,
    contentType: keys.contentType,
  }
}

const INFO_TARGET_OPTION_KEYS = [
  { value: "home", labelKey: "mpAdmin_targetHomeNotice" },
  { value: "location", labelKey: "mpAdmin_targetLocation" },
] as const

function emptyForm(variant: Exclude<MemberPortalContentAdminTab, "all">, t: (k: string) => string): FormState {
  const meta = variantMetaFor(t, variant)
  return {
    contentKey: "",
    contentType: meta.contentType,
    storeCode: "",
    title: "",
    body: "",
    imageUrl: "",
    targetTab: meta.defaultTargetTab,
    isActive: true,
    sortOrder: 0,
    startsAt: "",
    endsAt: "",
  }
}

function itemToForm(item: MemberPortalContentAdminItem): FormState {
  return {
    contentKey: item.contentKey,
    contentType: item.contentType === "store_photo" ? "info" : item.contentType,
    storeCode: item.storeCode,
    title: item.title,
    body: item.body,
    imageUrl: item.imageUrl,
    targetTab: item.targetTab,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
    startsAt: toDatetimeLocalValue(item.startsAt),
    endsAt: toDatetimeLocalValue(item.endsAt),
  }
}

function toDatetimeLocalValue(iso: string): string {
  const v = String(iso || "").trim()
  if (!v) return ""
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (!m) return ""
  return `${m[1]}T${m[2]}`
}

function resolveEditVariant(
  variant: MemberPortalContentAdminTab,
  item: MemberPortalContentAdminItem
): Exclude<MemberPortalContentAdminTab, "all"> {
  if (variant !== "all") return variant
  if (item.contentType === "popup") return "popup"
  if (item.contentType === "info" && item.targetTab === "home_promo") return "promo"
  if (item.contentType === "info" && item.targetTab === "home_feature") return "new_menu"
  return "info"
}

type MemberPortalContentAdminPanelProps = {
  variant: MemberPortalContentAdminTab
  items: MemberPortalContentAdminItem[]
  loading?: boolean
  canEdit?: boolean
  onSaved: () => void | Promise<void>
  onNotice: (msg: string) => void
  onError: (msg: string) => void
}

export function MemberPortalContentAdminPanel({
  variant,
  items,
  loading,
  canEdit = true,
  onSaved,
  onNotice,
  onError,
}: MemberPortalContentAdminPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const panelVariant = variant === "all" ? "promo" : variant
  const meta = variantMetaFor(t, panelVariant)
  const filtered = React.useMemo(() => filterContentForAdminTab(items, variant), [items, variant])

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [formVariant, setFormVariant] = React.useState<Exclude<MemberPortalContentAdminTab, "all">>(panelVariant)
  const [form, setForm] = React.useState<FormState>(() => emptyForm(panelVariant, t))
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [imageUploadError, setImageUploadError] = React.useState("")
  const [imageUploadNotice, setImageUploadNotice] = React.useState("")
  const [togglingKey, setTogglingKey] = React.useState<string | null>(null)
  const [deletingKey, setDeletingKey] = React.useState<string | null>(null)

  const formMeta = variantMetaFor(t, formVariant)
  const imageRule = React.useMemo(() => resolveMemberPortalContentImageRule(formVariant), [formVariant])
  const imageHint = formatMemberPortalContentImageHint(imageRule, t)

  const openNew = React.useCallback(
    (targetVariant?: Exclude<MemberPortalContentAdminTab, "all">) => {
      const nextVariant = targetVariant || panelVariant
      setFormVariant(nextVariant)
      setForm(emptyForm(nextVariant, t))
      setImageUploadError("")
      setImageUploadNotice("")
      setSheetOpen(true)
    },
    [panelVariant, t]
  )

  const openEdit = React.useCallback(
    (contentKey: string) => {
      const item = filtered.find((x) => x.contentKey === contentKey)
      if (!item) return
      const editVariant = resolveEditVariant(variant, item)
      setFormVariant(editVariant)
      setForm(itemToForm(item))
      setImageUploadError("")
      setImageUploadNotice("")
      setSheetOpen(true)
    },
    [filtered, variant]
  )

  const openDuplicate = React.useCallback(
    (contentKey: string) => {
      const item = filtered.find((x) => x.contentKey === contentKey)
      if (!item) return
      const editVariant = resolveEditVariant(variant, item)
      setFormVariant(editVariant)
      setForm({ ...itemToForm(item), contentKey: "" })
      setImageUploadError("")
      setImageUploadNotice("")
      setSheetOpen(true)
    },
    [filtered, variant]
  )

  const reportUploadError = React.useCallback(
    (msg: string) => {
      setImageUploadNotice("")
      setImageUploadError(msg)
      onError(msg)
    },
    [onError]
  )

  const persist = React.useCallback(async (payload: FormState) => {
    const res = await apiFetch("/api/member-portal/admin/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = (await res.json()) as { success: boolean; message?: string }
    if (!res.ok || !data.success) {
      throw new Error(data.message || t("mpAdmin_errSave"))
    }
  }, [t])

  const onSave = React.useCallback(async () => {
    setSaving(true)
    onError("")
    try {
      await persist(form)
      onNotice(t("mpAdmin_noticeSaved"))
      setSheetOpen(false)
      await onSaved()
    } catch (e) {
      onError(e instanceof Error ? e.message : t("mpAdmin_errSaveGeneric"))
    } finally {
      setSaving(false)
    }
  }, [form, onError, onNotice, onSaved, persist, t])

  const onToggleActive = React.useCallback(
    async (contentKey: string) => {
      const item = filtered.find((x) => x.contentKey === contentKey)
      if (!item) return
      setTogglingKey(contentKey)
      onError("")
      try {
        await persist({ ...itemToForm(item), isActive: !item.isActive })
        onNotice(item.isActive ? t("mpAdmin_noticePaused") : t("mpAdmin_noticeActivated"))
        await onSaved()
      } catch (e) {
        onError(e instanceof Error ? e.message : t("mpAdmin_errToggle"))
      } finally {
        setTogglingKey(null)
      }
    },
    [filtered, onError, onNotice, onSaved, persist, t]
  )

  const onDelete = React.useCallback(
    async (contentKey: string) => {
      const item = filtered.find((x) => x.contentKey === contentKey)
      if (!item) return
      const ok = await appConfirm(
        tr(t, "mpAdmin_confirmDeleteBody", { title: item.title || contentKey }),
        {
          title: t("mpAdmin_confirmDeleteTitle"),
          confirmLabel: t("delete"),
          cancelLabel: t("cancel"),
        }
      )
      if (!ok) return
      setDeletingKey(contentKey)
      onError("")
      try {
        const res = await apiFetch(
          `/api/member-portal/admin/content?contentKey=${encodeURIComponent(contentKey)}`,
          { method: "DELETE" }
        )
        const data = (await res.json()) as { success: boolean; message?: string }
        if (!res.ok || !data.success) {
          throw new Error(data.message || t("mpAdmin_errDelete"))
        }
        onNotice(t("mpAdmin_noticeDeleted"))
        await onSaved()
      } catch (e) {
        onError(e instanceof Error ? e.message : t("mpAdmin_errDeleteGeneric"))
      } finally {
        setDeletingKey(null)
      }
    },
    [filtered, onError, onNotice, onSaved, t]
  )

  const onUploadImage = React.useCallback(
    async (file: File) => {
      setUploading(true)
      setImageUploadError("")
      setImageUploadNotice("")
      onError("")
      try {
        const rule = resolveMemberPortalContentImageRule(formVariant)
        const size = await readMemberPortalImageSize(file)
        const validation = validateMemberPortalImageByRule(size.width, size.height, rule, t, formVariant)
        if (!validation.ok) {
          reportUploadError(validation.message)
          return
        }

        const uploaded = await uploadMemberPortalContentImageToStorage(file)
        if (!uploaded.ok) {
          reportUploadError(
            uploaded.message === "UPLOAD_PRESIGN_FAIL"
              ? t("mpAdmin_errImagePresign")
              : uploaded.message.startsWith("STORAGE_PUT_FAIL_")
                ? t("mpAdmin_errImageUpload")
                : uploaded.message || t("mpAdmin_errImageUpload")
          )
          return
        }
        setForm((prev) => ({ ...prev, imageUrl: uploaded.publicUrl || "" }))
        setImageUploadError("")
        const noticeMsg = t("mpAdmin_noticeImageUploaded")
        setImageUploadNotice(noticeMsg)
        onNotice(noticeMsg)
      } catch (e) {
        reportUploadError(memberPortalImageUploadCatchMessage(t, e))
      } finally {
        setUploading(false)
      }
    },
    [formVariant, onError, onNotice, reportUploadError, t]
  )

  const headerTitle = variant === "all" ? t("mpAdmin_allListTitle") : meta.title
  const headerDescription = variant === "all" ? t("mpAdmin_allListDesc") : meta.description
  const emptyMessage = variant === "all" ? t("mpAdmin_allListEmpty") : meta.empty

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{headerTitle}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{headerDescription}</p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {variant === "all" ? (
              <>
                <Button type="button" variant="outline" onClick={() => openNew("promo")}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t("mpAdmin_btnPromo")}
                </Button>
                <Button type="button" variant="outline" onClick={() => openNew("popup")}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t("mpAdmin_btnPopup")}
                </Button>
                <Button type="button" onClick={() => openNew("info")} className="bg-[#06c755] hover:bg-[#05b34c]">
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t("mpAdmin_btnNotice")}
                </Button>
              </>
            ) : (
              <Button type="button" onClick={() => openNew()} className="shrink-0 bg-[#06c755] hover:bg-[#05b34c]">
                <Plus className="mr-1.5 h-4 w-4" />
                {meta.newLabel}
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-lg border px-6 py-10 text-center text-sm text-muted-foreground">{t("loading")}</div>
      ) : (
        <MemberPortalContentAdminList
          variant={variant}
          items={filtered}
          emptyMessage={emptyMessage}
          canEdit={canEdit}
          togglingKey={togglingKey}
          deletingKey={deletingKey}
          onToggleActive={onToggleActive}
          onEdit={openEdit}
          onDuplicate={canEdit ? openDuplicate : undefined}
          onDelete={canEdit ? onDelete : undefined}
        />
      )}

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) {
            setImageUploadError("")
            setImageUploadNotice("")
          }
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b px-6 py-5 pr-14">
            <SheetTitle>
              {form.contentKey ? `${formMeta.title} ${t("mpAdmin_editSuffix")}` : formMeta.newLabel}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-6 px-6 py-6 pb-10">
            {form.contentKey ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                {t("mpAdmin_contentKey")}: <span className="font-mono text-foreground">{form.contentKey}</span>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="mp-content-title">{t("mpAdmin_fieldTitle")}</Label>
              <Input
                id="mp-content-title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder={t("mpAdmin_fieldTitlePh")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mp-content-image-url">{t("mpAdmin_fieldImage")}</Label>
              <Input
                id="mp-content-image-url"
                value={form.imageUrl}
                onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                placeholder="https://..."
              />
              <CrmImageUploadField
                disabled={!canEdit}
                uploading={uploading}
                buttonLabel={t("mpAdmin_selectImage")}
                hint={imageHint}
                error={imageUploadError}
                previewUrl={form.imageUrl || undefined}
                alt={form.title || t("mpAdmin_fieldImage")}
                onFile={(file) => void onUploadImage(file)}
              />
              {imageUploadNotice ? (
                <p className="text-xs leading-relaxed text-emerald-700">{imageUploadNotice}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mp-content-body">{t("mpAdmin_fieldBody")}</Label>
              <Textarea
                id="mp-content-body"
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                rows={5}
                placeholder={t("mpAdmin_fieldBodyPh")}
              />
            </div>

            {formVariant !== "popup" ? (
              <div className="space-y-2">
                <Label htmlFor="mp-content-target-tab">{t("mpAdmin_fieldTargetTab")}</Label>
                {formVariant === "promo" || formVariant === "new_menu" ? (
                  <>
                    <Input id="mp-content-target-tab" value={form.targetTab} readOnly />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {formVariant === "promo" ? t("mpAdmin_promoTargetFixed") : t("mpAdmin_newMenuTargetFixed")}
                    </p>
                  </>
                ) : (
                  <>
                    <select
                      id="mp-content-target-tab"
                      value={form.targetTab || "home"}
                      onChange={(e) => setForm((p) => ({ ...p, targetTab: e.target.value }))}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      {INFO_TARGET_OPTION_KEYS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {t(opt.labelKey)}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs leading-relaxed text-muted-foreground">{t("mpAdmin_targetTabHint")}</p>
                  </>
                )}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mp-content-starts">{t("mpAdmin_startsBangkok")}</Label>
                <Input
                  id="mp-content-starts"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mp-content-ends">{t("mpAdmin_endsBangkok")}</Label>
                <Input
                  id="mp-content-ends"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mp-content-sort">{t("sortOrder")}</Label>
                <Input
                  id="mp-content-sort"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mp-content-store">{t("mpAdmin_storeCodeOptional")}</Label>
                <Input
                  id="mp-content-store"
                  value={form.storeCode}
                  onChange={(e) => setForm((p) => ({ ...p, storeCode: e.target.value }))}
                  placeholder="CM01"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border px-4 py-3">
              <input
                id={`active-${variant}-${formVariant}`}
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              <label htmlFor={`active-${variant}-${formVariant}`} className="text-sm">
                {t("mpAdmin_isActive")}
              </label>
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" onClick={() => void onSave()} disabled={saving || uploading} className="flex-1">
                {saving ? t("mpAdmin_saving") : t("save")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                {t("close")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

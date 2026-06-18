"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { apiFetch } from "@/lib/api/fetch"
import { DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL } from "@/lib/member-portal-stamp-food-image"
import {
  uploadMemberPortalContentImageToStorage,
  verifyMemberPortalImagePublicUrl,
  withMemberPortalImageCacheBust,
} from "@/lib/member-portal-image-upload"
import { MP_HOME_STAMP_FOOD_H, MP_HOME_STAMP_FOOD_W } from "@/lib/member-portal-home-layout"

type Props = {
  canEdit?: boolean
  onNotice?: (message: string) => void
  onError?: (message: string) => void
  onSaved?: () => void
}

export function MemberPortalStampFoodImageAdminPanel({
  canEdit = true,
  onNotice,
  onError,
  onSaved,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [imageUrl, setImageUrl] = React.useState(DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL)
  const [previewNonce, setPreviewNonce] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)

  const persistImageUrl = React.useCallback(
    async (url: string) => {
      const res = await apiFetch("/api/member-portal/admin/settings/stamp-food-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      })
      const data = (await res.json()) as { success: boolean; imageUrl?: string; message?: string }
      if (!data.success) throw new Error(data.message || t("mpAdmin_errSave"))
      const saved = String(data.imageUrl || url)
      setImageUrl(saved)
      setPreviewNonce((n) => n + 1)
      onSaved?.()
      return saved
    },
    [onSaved, t]
  )

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/stamp-food-image", { cache: "no-store" })
      const data = (await res.json()) as { success: boolean; imageUrl?: string; message?: string }
      if (!data.success) throw new Error(data.message || t("mpAdmin_errLoadContent"))
      setImageUrl(String(data.imageUrl || DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL))
      setPreviewNonce((n) => n + 1)
    } catch (e) {
      onError?.(e instanceof Error ? e.message : t("mpAdmin_errLoadContent"))
    } finally {
      setLoading(false)
    }
  }, [onError, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    try {
      await persistImageUrl(imageUrl)
      onNotice?.(t("mpAdmin_stampFoodImageSaved"))
    } catch (e) {
      onError?.(e instanceof Error ? e.message : t("mpAdmin_errSaveGeneric"))
    } finally {
      setSaving(false)
    }
  }

  const onUpload = async (file: File) => {
    setUploading(true)
    try {
      const result = await uploadMemberPortalContentImageToStorage(file)
      if (!result.ok) throw new Error(result.message)
      const readable = await verifyMemberPortalImagePublicUrl(result.publicUrl)
      await persistImageUrl(result.publicUrl)
      onNotice?.(
        readable ? t("mpAdmin_stampFoodImageUploadedAndSaved") : t("mpAdmin_stampFoodImageUploadedSaveWarn")
      )
    } catch (e) {
      onError?.(e instanceof Error ? e.message : t("mpAdmin_errImageUploadGeneric"))
    } finally {
      setUploading(false)
    }
  }

  const previewSrc = withMemberPortalImageCacheBust(imageUrl, previewNonce)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("mpAdmin_stampFoodImageDesc")}</p>
      <fieldset disabled={!canEdit || loading} className="space-y-3 disabled:opacity-60">
        <div className="space-y-1.5">
          <Label>{t("mpAdmin_stampFoodImageUrl")}</Label>
          <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="cursor-pointer">
            <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent">
              {uploading ? t("mpAdmin_uploading") : t("mpAdmin_uploadImage")}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={!canEdit || uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onUpload(file)
                e.target.value = ""
              }}
            />
          </Label>
          <Button type="button" onClick={() => void save()} disabled={saving || uploading}>
            {saving ? t("mpAdmin_saving") : t("mpAdmin_stampFoodImageSave")}
          </Button>
          <Button type="button" variant="outline" onClick={() => void load()}>
            {t("mpAdmin_reload")}
          </Button>
        </div>
        {imageUrl ? (
          <div className="relative inline-block overflow-hidden rounded-xl border bg-gradient-to-r from-[#f2faeb] to-[#fff8eb] p-4">
            <p className="mb-2 text-xs text-muted-foreground">{t("mpAdmin_stampFoodImagePreview")}</p>
            <div className={`relative ${MP_HOME_STAMP_FOOD_W} ${MP_HOME_STAMP_FOOD_H}`}>
              <img
                src={previewSrc}
                alt=""
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        ) : null}
      </fieldset>
    </div>
  )
}

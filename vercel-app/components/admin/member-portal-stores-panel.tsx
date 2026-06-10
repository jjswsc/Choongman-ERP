"use client"

import * as React from "react"
import { MemberPortalLineList } from "@/components/admin/member-portal-line-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/api/fetch"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import { putFileToSupabaseSignedUploadUrl } from "@/lib/storage-client-upload"
import { memberPortalImageUploadCatchMessage } from "@/lib/member-portal-content-image-rules"

type StoreRow = {
  storeCode: string
  displayName: string
  address: string
  mapQuery: string
  photoUrl: string
  sortOrder: number
  isActive: boolean
}

type StoreForm = {
  storeCode: string
  displayName: string
  address: string
  mapQuery: string
  photoUrl: string
  sortOrder: number
  isActive: boolean
  aliases: string
}

function emptyForm(): StoreForm {
  return {
    storeCode: "",
    displayName: "",
    address: "",
    mapQuery: "",
    photoUrl: "",
    sortOrder: 0,
    isActive: true,
    aliases: "",
  }
}

const STORE_PHOTO_RULE = {
  minWidth: 1200,
  minHeight: 800,
  aspectW: 3,
  aspectH: 2,
}

async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error("IMAGE_SIZE_READ_FAIL"))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

type MemberPortalStoresPanelProps = {
  canEdit?: boolean
  onNotice: (msg: string) => void
  onError: (msg: string) => void
}

export function MemberPortalStoresPanel({ canEdit = true, onNotice, onError }: MemberPortalStoresPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [stores, setStores] = React.useState<StoreRow[]>([])
  const [form, setForm] = React.useState<StoreForm>(emptyForm())
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [editMode, setEditMode] = React.useState(false)
  const [togglingCode, setTogglingCode] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    onError("")
    try {
      const res = await apiFetch("/api/member-portal/admin/stores", { cache: "no-store" })
      const data = (await res.json()) as { success: boolean; message?: string; stores?: StoreRow[] }
      if (!res.ok || !data.success) {
        setStores([])
        onError(data.message || t("mpAdmin_errLoadStores"))
        return
      }
      setStores(data.stores || [])
    } catch {
      setStores([])
      onError(t("mpAdmin_errLoadStores"))
    } finally {
      setLoading(false)
    }
  }, [onError, t])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const onSave = React.useCallback(async () => {
    setSaving(true)
    onError("")
    try {
      const res = await apiFetch("/api/member-portal/admin/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeCode: form.storeCode,
          displayName: form.displayName,
          address: form.address,
          mapQuery: form.mapQuery,
          photoUrl: form.photoUrl,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
          aliases: form.aliases,
        }),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        onError(data.message || t("mpAdmin_errSave"))
        return
      }
      onNotice(t("mpAdmin_noticeStoreSaved"))
      setForm(emptyForm())
      setEditMode(false)
      await refresh()
    } catch {
      onError(t("mpAdmin_errSaveGeneric"))
    } finally {
      setSaving(false)
    }
  }, [form, onError, onNotice, refresh, t])

  const onUploadPhoto = React.useCallback(
    async (file: File) => {
      setUploading(true)
      onError("")
      try {
        const size = await readImageSize(file)
        if (size.width < STORE_PHOTO_RULE.minWidth || size.height < STORE_PHOTO_RULE.minHeight) {
          onError(
            tr(t, "mpAdmin_storePhotoTooSmall", {
              minW: String(STORE_PHOTO_RULE.minWidth),
              minH: String(STORE_PHOTO_RULE.minHeight),
            })
          )
          return
        }
        const presignRes = await apiFetch("/api/uploadMemberPortalContentImage/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || "image/jpeg",
            fileSize: file.size,
          }),
        })
        const presign = (await presignRes.json()) as {
          success: boolean
          message?: string
          signedUrl?: string
          publicUrl?: string
        }
        if (!presignRes.ok || !presign.success || !presign.signedUrl || !presign.publicUrl) {
          onError(presign.message || t("mpAdmin_errImagePresign"))
          return
        }
        const putRes = await putFileToSupabaseSignedUploadUrl(presign.signedUrl, file, { timeoutMs: 180000 })
        if (!putRes.ok) {
          onError(t("mpAdmin_errImageUpload"))
          return
        }
        setForm((p) => ({ ...p, photoUrl: presign.publicUrl || "" }))
        onNotice(t("mpAdmin_noticeStorePhotoUploaded"))
      } catch (e) {
        onError(memberPortalImageUploadCatchMessage(t, e))
      } finally {
        setUploading(false)
      }
    },
    [onError, onNotice, t]
  )

  const persistStore = React.useCallback(async (payload: StoreForm & { storeCode: string }) => {
    const res = await apiFetch("/api/member-portal/admin/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeCode: payload.storeCode,
        displayName: payload.displayName,
        address: payload.address,
        mapQuery: payload.mapQuery,
        photoUrl: payload.photoUrl,
        sortOrder: payload.sortOrder,
        isActive: payload.isActive,
        aliases: payload.aliases,
      }),
    })
    const data = (await res.json()) as { success: boolean; message?: string }
    if (!res.ok || !data.success) {
      throw new Error(data.message || t("mpAdmin_errSave"))
    }
  }, [t])

  const onToggleStoreActive = React.useCallback(
    async (storeCode: string) => {
      const row = stores.find((s) => s.storeCode === storeCode)
      if (!row) return
      setTogglingCode(storeCode)
      onError("")
      try {
        await persistStore({
          storeCode: row.storeCode,
          displayName: row.displayName,
          address: row.address,
          mapQuery: row.mapQuery,
          photoUrl: row.photoUrl,
          sortOrder: row.sortOrder,
          isActive: !row.isActive,
          aliases: "",
        })
        onNotice(row.isActive ? t("mpAdmin_noticeStorePaused") : t("mpAdmin_noticeStoreActivated"))
        await refresh()
      } catch (e) {
        onError(e instanceof Error ? e.message : t("mpAdmin_errToggle"))
      } finally {
        setTogglingCode(null)
      }
    },
    [onError, onNotice, persistStore, refresh, stores, t]
  )

  const loadStoreToForm = React.useCallback((s: StoreRow) => {
    setEditMode(true)
    setForm({
      storeCode: s.storeCode,
      displayName: s.displayName,
      address: s.address,
      mapQuery: s.mapQuery,
      photoUrl: s.photoUrl,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
      aliases: "",
    })
  }, [])

  const sortedStores = React.useMemo(
    () =>
      [...stores].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        return a.displayName.localeCompare(b.displayName, "ko")
      }),
    [stores]
  )

  const storeListRows = sortedStores.map((s) => ({
    id: s.storeCode,
    imageUrl: s.photoUrl,
    title: s.displayName,
    subtitle: s.address || s.storeCode,
    placement: t("mpAdmin_storePlacement"),
    periodLabel: s.mapQuery ? tr(t, "mpAdmin_mapLabel", { query: s.mapQuery }) : undefined,
    sortOrder: s.sortOrder,
    isActive: s.isActive,
    toggling: togglingCode === s.storeCode,
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("mpAdmin_storesTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("mpAdmin_storesDesc")}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border px-6 py-10 text-center text-sm text-muted-foreground">{t("loading")}</div>
      ) : (
        <MemberPortalLineList
          rows={storeListRows}
          emptyMessage={t("mpAdmin_storesEmpty")}
          onToggleActive={onToggleStoreActive}
          onEdit={(storeCode) => {
            const s = stores.find((x) => x.storeCode === storeCode)
            if (s) loadStoreToForm(s)
          }}
          canEdit={canEdit}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{editMode ? t("mpAdmin_storeEdit") : t("mpAdmin_storeAdd")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{t("mpAdmin_storesFormDesc1")}</p>
            <p>{t("mpAdmin_storesFormDesc2")}</p>
          </div>
          <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("mpAdmin_storeCode")}</Label>
              <Input
                value={form.storeCode}
                onChange={(e) => setForm((p) => ({ ...p, storeCode: e.target.value }))}
                placeholder="예: CM Silom"
                readOnly={editMode}
                className={editMode ? "bg-muted" : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("mpAdmin_storeName")}</Label>
              <Input
                value={form.displayName}
                onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                placeholder="예: CM Silom"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>{t("mpAdmin_storeAddress")}</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                placeholder={t("mpAdmin_storeAddressPh")}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>{t("mpAdmin_storeMapQuery")}</Label>
              <Input
                value={form.mapQuery}
                onChange={(e) => setForm((p) => ({ ...p, mapQuery: e.target.value }))}
                placeholder={t("mpAdmin_storeMapQueryPh")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("sortOrder")}</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value || 0) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("mpAdmin_storeAliases")}</Label>
              <Input
                value={form.aliases}
                onChange={(e) => setForm((p) => ({ ...p, aliases: e.target.value }))}
                placeholder="에까마이, Ekamai"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>{t("mpAdmin_storePhotoUrl")}</Label>
              <Input
                value={form.photoUrl}
                onChange={(e) => setForm((p) => ({ ...p, photoUrl: e.target.value }))}
                placeholder="https://..."
              />
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void onUploadPhoto(file)
                  }}
                />
                {uploading ? <span className="text-xs text-muted-foreground">{t("mpAdmin_uploading")}</span> : null}
              </div>
              {form.photoUrl ? (
                <img src={form.photoUrl} alt="store" className="mt-2 h-28 w-full max-w-md rounded object-cover" />
              ) : null}
            </div>
            <div className="flex h-10 items-center rounded-md border px-3 md:col-span-2">
              <input
                id="storeIsActive"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              <label htmlFor="storeIsActive" className="ml-2 text-sm">
                {t("mpAdmin_storeActive")}
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void onSave()} disabled={saving || uploading}>
              {saving ? t("mpAdmin_saving") : t("save")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setForm(emptyForm())
                setEditMode(false)
              }}
            >
              {t("mpAdmin_storeNewForm")}
            </Button>
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? t("loading") : t("mpAdmin_refreshList")}
            </Button>
          </div>
          </fieldset>
        </CardContent>
      </Card>

    </div>
  )
}

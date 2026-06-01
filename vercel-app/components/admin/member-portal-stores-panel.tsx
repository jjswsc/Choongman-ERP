"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/api/fetch"
import { putFileToSupabaseSignedUploadUrl } from "@/lib/storage-client-upload"

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
      img.onerror = () => reject(new Error("이미지 크기를 읽을 수 없습니다."))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

type MemberPortalStoresPanelProps = {
  onNotice: (msg: string) => void
  onError: (msg: string) => void
}

export function MemberPortalStoresPanel({ onNotice, onError }: MemberPortalStoresPanelProps) {
  const [stores, setStores] = React.useState<StoreRow[]>([])
  const [form, setForm] = React.useState<StoreForm>(emptyForm())
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [editMode, setEditMode] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    onError("")
    try {
      const res = await apiFetch("/api/member-portal/admin/stores", { cache: "no-store" })
      const data = (await res.json()) as { success: boolean; message?: string; stores?: StoreRow[] }
      if (!res.ok || !data.success) {
        setStores([])
        onError(data.message || "매장 목록을 불러오지 못했습니다.")
        return
      }
      setStores(data.stores || [])
    } catch {
      setStores([])
      onError("매장 목록을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [onError])

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
        onError(data.message || "저장에 실패했습니다.")
        return
      }
      onNotice("매장 정보를 저장했습니다.")
      setForm(emptyForm())
      setEditMode(false)
      await refresh()
    } catch {
      onError("저장 중 오류가 발생했습니다.")
    } finally {
      setSaving(false)
    }
  }, [form, onError, onNotice, refresh])

  const onDeactivate = React.useCallback(
    async (storeCode: string) => {
      if (!window.confirm(`매장 "${storeCode}"을(를) 비활성화할까요? 회원앱 목록에서 숨겨집니다.`)) return
      onError("")
      try {
        const res = await apiFetch(
          `/api/member-portal/admin/stores?storeCode=${encodeURIComponent(storeCode)}`,
          { method: "DELETE" }
        )
        const data = (await res.json()) as { success: boolean; message?: string }
        if (!res.ok || !data.success) {
          onError(data.message || "비활성화에 실패했습니다.")
          return
        }
        onNotice("매장을 비활성화했습니다.")
        await refresh()
      } catch {
        onError("비활성화 중 오류가 발생했습니다.")
      }
    },
    [onError, onNotice, refresh]
  )

  const onUploadPhoto = React.useCallback(
    async (file: File) => {
      setUploading(true)
      onError("")
      try {
        const size = await readImageSize(file)
        if (size.width < STORE_PHOTO_RULE.minWidth || size.height < STORE_PHOTO_RULE.minHeight) {
          onError(
            `매장 사진은 최소 ${STORE_PHOTO_RULE.minWidth}x${STORE_PHOTO_RULE.minHeight}px 이상이어야 합니다.`
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
          onError(presign.message || "이미지 업로드 준비에 실패했습니다.")
          return
        }
        const putRes = await putFileToSupabaseSignedUploadUrl(presign.signedUrl, file, { timeoutMs: 180000 })
        if (!putRes.ok) {
          onError("이미지 업로드에 실패했습니다.")
          return
        }
        setForm((p) => ({ ...p, photoUrl: presign.publicUrl || "" }))
        onNotice("사진을 업로드했습니다. 저장 버튼을 눌러 반영하세요.")
      } catch {
        onError("이미지 업로드 중 오류가 발생했습니다.")
      } finally {
        setUploading(false)
      }
    },
    [onError, onNotice]
  )

  const activeStores = stores.filter((s) => s.isActive)
  const inactiveStores = stores.filter((s) => !s.isActive)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>매장 정보 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            회원앱 <strong>매장</strong> 탭·픽업 주문 매장 선택에 노출되는 목록입니다. 매장 코드는 POS·직원
            매장(<code className="rounded bg-muted px-1">store_code</code>)과 동일하게 맞추세요.
          </p>
          <p>권장 사진: 1200×800px, 3:2. 위치는 Google Maps 검색어 또는 주소를 입력합니다.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{editMode ? "매장 수정" : "매장 추가"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>매장 코드 *</Label>
              <Input
                value={form.storeCode}
                onChange={(e) => setForm((p) => ({ ...p, storeCode: e.target.value }))}
                placeholder="예: CM Silom"
                readOnly={editMode}
                className={editMode ? "bg-muted" : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label>매장명 *</Label>
              <Input
                value={form.displayName}
                onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                placeholder="예: CM Silom"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>주소 / 위치 설명</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="회원앱에 표시할 주소"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>지도 검색어 (Google Maps)</Label>
              <Input
                value={form.mapQuery}
                onChange={(e) => setForm((p) => ({ ...p, mapQuery: e.target.value }))}
                placeholder="비우면 Choongman Chicken + 매장명"
              />
            </div>
            <div className="space-y-1.5">
              <Label>정렬순서</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value || 0) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>별칭 (쉼표 구분, 선택)</Label>
              <Input
                value={form.aliases}
                onChange={(e) => setForm((p) => ({ ...p, aliases: e.target.value }))}
                placeholder="에까마이, Ekamai"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>매장 사진 URL</Label>
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
                {uploading ? <span className="text-xs text-muted-foreground">업로드 중...</span> : null}
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
                회원앱에 노출 (활성)
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void onSave()} disabled={saving || uploading}>
              {saving ? "저장 중..." : "저장"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setForm(emptyForm())
                setEditMode(false)
              }}
            >
              새로 작성
            </Button>
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? "불러오는 중..." : "목록 새로고침"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>등록된 매장 ({activeStores.length}개 노출)</CardTitle>
        </CardHeader>
        <CardContent>
          {stores.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              등록된 매장이 없습니다. 위에서 추가하거나 Supabase erp_stores를 확인하세요.
            </div>
          ) : (
            <div className="overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-left">코드</th>
                    <th className="p-2 text-left">매장명</th>
                    <th className="p-2 text-left">주소</th>
                    <th className="p-2 text-left">사진</th>
                    <th className="p-2 text-left">활성</th>
                    <th className="p-2 text-left">정렬</th>
                    <th className="p-2 text-left">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {[...activeStores, ...inactiveStores].map((s) => (
                    <tr key={s.storeCode} className={`border-t ${!s.isActive ? "opacity-50" : ""}`}>
                      <td className="p-2 font-mono text-xs">{s.storeCode}</td>
                      <td className="p-2">{s.displayName}</td>
                      <td className="max-w-[12rem] truncate p-2 text-muted-foreground">{s.address || "-"}</td>
                      <td className="p-2">
                        {s.photoUrl ? (
                          <img src={s.photoUrl} alt="" className="h-10 w-16 rounded object-cover" />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-2">{s.isActive ? "Y" : "N"}</td>
                      <td className="p-2">{s.sortOrder}</td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
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
                            }}
                          >
                            수정
                          </Button>
                          {s.isActive ? (
                            <Button size="sm" variant="outline" onClick={() => void onDeactivate(s.storeCode)}>
                              비활성
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

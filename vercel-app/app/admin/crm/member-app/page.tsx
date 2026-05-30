"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { apiFetch } from "@/lib/api/fetch"
import { putFileToSupabaseSignedUploadUrl } from "@/lib/storage-client-upload"

type ContentType = "popup" | "info" | "store_photo"

type ContentItem = {
  id: number
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
  updatedAt: string
  updatedBy: string
}

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

function emptyForm(): FormState {
  return {
    contentKey: "",
    contentType: "popup",
    storeCode: "",
    title: "",
    body: "",
    imageUrl: "",
    targetTab: "",
    isActive: true,
    sortOrder: 0,
    startsAt: "",
    endsAt: "",
  }
}

function toDatetimeLocal(iso: string): string {
  const v = String(iso || "").trim()
  if (!v) return ""
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (!m) return ""
  return `${m[1]}T${m[2]}`
}

export default function CrmMemberAppContentPage() {
  const [items, setItems] = React.useState<ContentItem[]>([])
  const [form, setForm] = React.useState<FormState>(emptyForm())
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [notice, setNotice] = React.useState("")
  const [error, setError] = React.useState("")

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await apiFetch("/api/member-portal/admin/content", { cache: "no-store" })
      const data = (await res.json()) as {
        success: boolean
        needsSetup?: boolean
        message?: string
        items?: ContentItem[]
      }
      if (!res.ok || !data.success) {
        setItems([])
        setError(data.message || "회원앱 콘텐츠를 불러오지 못했습니다.")
        return
      }
      setItems(data.items || [])
      if (data.needsSetup) {
        setError(data.message || "DB 테이블 설정이 필요합니다.")
      }
    } catch {
      setError("회원앱 콘텐츠를 불러오지 못했습니다.")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const onSave = React.useCallback(async () => {
    setSaving(true)
    setError("")
    setNotice("")
    try {
      const res = await apiFetch("/api/member-portal/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        setError(data.message || "저장에 실패했습니다.")
        return
      }
      setNotice("저장되었습니다.")
      setForm(emptyForm())
      await refresh()
    } catch {
      setError("저장 중 오류가 발생했습니다.")
    } finally {
      setSaving(false)
    }
  }, [form, refresh])

  const onUploadImage = React.useCallback(async (file: File) => {
    setUploading(true)
    setError("")
    try {
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
        setError(presign.message || "이미지 업로드 준비에 실패했습니다.")
        return
      }
      const putRes = await putFileToSupabaseSignedUploadUrl(presign.signedUrl, file, { timeoutMs: 180000 })
      if (!putRes.ok) {
        setError("이미지 업로드에 실패했습니다.")
        return
      }
      setForm((prev) => ({ ...prev, imageUrl: presign.publicUrl || "" }))
      setNotice("이미지가 업로드되었습니다.")
    } catch {
      setError("이미지 업로드 중 오류가 발생했습니다.")
    } finally {
      setUploading(false)
    }
  }, [])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <CrmSubnav />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">회원앱 운영</h1>
            <p className="text-sm text-muted-foreground">매장 사진, 팝업, 안내 정보를 ERP에서 통합 관리합니다.</p>
          </div>
          <Button variant="outline" onClick={() => refresh()} disabled={loading}>
            {loading ? "불러오는 중..." : "새로고침"}
          </Button>
        </div>

        {!!notice && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
        )}
        {!!error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <Card>
          <CardHeader>
            <CardTitle>콘텐츠 등록/수정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>유형</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.contentType}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, contentType: e.target.value as ContentType }))
                  }
                >
                  <option value="popup">팝업</option>
                  <option value="info">정보 업데이트</option>
                  <option value="store_photo">매장 사진</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>매장 코드 (선택)</Label>
                <Input
                  value={form.storeCode}
                  onChange={(e) => setForm((p) => ({ ...p, storeCode: e.target.value }))}
                  placeholder="예: CM01"
                />
              </div>
              <div className="space-y-1.5">
                <Label>노출 탭 (선택)</Label>
                <Input
                  value={form.targetTab}
                  onChange={(e) => setForm((p) => ({ ...p, targetTab: e.target.value }))}
                  placeholder="예: home / location / privilege"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>제목</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="팝업 제목 또는 안내 제목"
                />
              </div>
              <div className="space-y-1.5">
                <Label>이미지 URL</Label>
                <Input
                  value={form.imageUrl}
                  onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                  placeholder="https://..."
                />
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void onUploadImage(file)
                    }}
                  />
                  {uploading ? <span className="text-xs text-muted-foreground">업로드 중...</span> : null}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>본문</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                rows={4}
                placeholder="회원앱에 보여줄 설명/안내 문구"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label>시작일시(방콕)</Label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>종료일시(방콕)</Label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))}
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
                <Label>활성화</Label>
                <div className="flex h-10 items-center rounded-md border px-3">
                  <input
                    id="isActive"
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                  />
                  <label htmlFor="isActive" className="ml-2 text-sm">
                    노출
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => onSave()} disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
              <Button variant="outline" onClick={() => setForm(emptyForm())}>
                새로 작성
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>등록된 콘텐츠</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                등록된 회원앱 콘텐츠가 없습니다.
              </div>
            ) : (
              <div className="overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-left">유형</th>
                      <th className="p-2 text-left">제목</th>
                      <th className="p-2 text-left">매장</th>
                      <th className="p-2 text-left">활성</th>
                      <th className="p-2 text-left">정렬</th>
                      <th className="p-2 text-left">수정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.contentKey} className="border-t">
                        <td className="p-2">{it.contentType}</td>
                        <td className="p-2">{it.title || "-"}</td>
                        <td className="p-2">{it.storeCode || "-"}</td>
                        <td className="p-2">{it.isActive ? "Y" : "N"}</td>
                        <td className="p-2">{it.sortOrder}</td>
                        <td className="p-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setForm({
                                contentKey: it.contentKey,
                                contentType: it.contentType,
                                storeCode: it.storeCode,
                                title: it.title,
                                body: it.body,
                                imageUrl: it.imageUrl,
                                targetTab: it.targetTab,
                                isActive: it.isActive,
                                sortOrder: it.sortOrder,
                                startsAt: toDatetimeLocal(it.startsAt),
                                endsAt: toDatetimeLocal(it.endsAt),
                              })
                            }
                          >
                            불러오기
                          </Button>
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
    </div>
  )
}


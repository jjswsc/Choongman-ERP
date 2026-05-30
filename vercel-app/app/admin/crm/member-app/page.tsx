"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

type ImageRule = {
  label: string
  minWidth: number
  minHeight: number
  aspectW: number
  aspectH: number
}

const IMAGE_RULES = {
  login: {
    label: "로그인 배경",
    minWidth: 1080,
    minHeight: 1920,
    aspectW: 9,
    aspectH: 16,
  } satisfies ImageRule,
  app: {
    label: "접속 후 배경",
    minWidth: 1080,
    minHeight: 1920,
    aspectW: 9,
    aspectH: 16,
  } satisfies ImageRule,
  popup: {
    label: "팝업",
    minWidth: 1080,
    minHeight: 1350,
    aspectW: 4,
    aspectH: 5,
  } satisfies ImageRule,
  store_photo: {
    label: "매장 사진",
    minWidth: 1200,
    minHeight: 800,
    aspectW: 3,
    aspectH: 2,
  } satisfies ImageRule,
} as const

async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error("이미지 크기를 읽을 수 없습니다."))
      img.src = url
    })
    return size
  } finally {
    URL.revokeObjectURL(url)
  }
}

function validateImageByRule(
  width: number,
  height: number,
  rule: ImageRule
): { ok: true } | { ok: false; message: string } {
  if (width < rule.minWidth || height < rule.minHeight) {
    return {
      ok: false,
      message: `${rule.label} 이미지는 최소 ${rule.minWidth}x${rule.minHeight}px 이상이어야 합니다. (현재 ${width}x${height}px)`,
    }
  }
  const actual = width / height
  const expected = rule.aspectW / rule.aspectH
  const ratioDiff = Math.abs(actual - expected)
  // 2% 오차 허용(리사이즈 과정에서 미세 오차 대응)
  if (ratioDiff > expected * 0.02) {
    return {
      ok: false,
      message: `${rule.label} 비율은 ${rule.aspectW}:${rule.aspectH} 이어야 합니다. (현재 ${width}x${height}px)`,
    }
  }
  return { ok: true }
}

export default function CrmMemberAppContentPage() {
  const [activeTab, setActiveTab] = React.useState<"design" | "popup" | "info" | "store_photo" | "contact">("design")
  const [items, setItems] = React.useState<ContentItem[]>([])
  const [form, setForm] = React.useState<FormState>(emptyForm())
  const [contactFacebookUrl, setContactFacebookUrl] = React.useState("")
  const [contactInstagramUrl, setContactInstagramUrl] = React.useState("")
  const [loginBackgroundUrl, setLoginBackgroundUrl] = React.useState("")
  const [appBackgroundUrl, setAppBackgroundUrl] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [contactSaving, setContactSaving] = React.useState(false)
  const [designSaving, setDesignSaving] = React.useState(false)
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

  const loadContactSettings = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/contact-links", { cache: "no-store" })
      const data = (await res.json()) as {
        success: boolean
        facebookUrl?: string
        instagramUrl?: string
      }
      if (!res.ok || !data.success) return
      setContactFacebookUrl(String(data.facebookUrl || ""))
      setContactInstagramUrl(String(data.instagramUrl || ""))
    } catch {
      /* ignore */
    }
  }, [])

  const loadDesignSettings = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/design", { cache: "no-store" })
      const data = (await res.json()) as {
        success: boolean
        loginBackgroundUrl?: string
        appBackgroundUrl?: string
      }
      if (!res.ok || !data.success) return
      setLoginBackgroundUrl(String(data.loginBackgroundUrl || ""))
      setAppBackgroundUrl(String(data.appBackgroundUrl || ""))
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    refresh().catch(() => {})
    loadContactSettings().catch(() => {})
    loadDesignSettings().catch(() => {})
  }, [loadContactSettings, loadDesignSettings, refresh])

  React.useEffect(() => {
    if (activeTab === "popup" || activeTab === "info" || activeTab === "store_photo") {
      setForm((prev) => ({ ...prev, contentType: activeTab }))
    }
  }, [activeTab])

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
      const size = await readImageSize(file)
      const rule =
        form.contentType === "popup"
          ? IMAGE_RULES.popup
          : form.contentType === "store_photo"
            ? IMAGE_RULES.store_photo
            : null
      if (rule) {
        const v = validateImageByRule(size.width, size.height, rule)
        if (!v.ok) {
          setError(v.message)
          return
        }
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
  }, [form.contentType])

  const saveContactSettings = React.useCallback(async () => {
    setContactSaving(true)
    setError("")
    setNotice("")
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/contact-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facebookUrl: contactFacebookUrl,
          instagramUrl: contactInstagramUrl,
        }),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        setError(data.message || "문의 채널 설정 저장에 실패했습니다.")
        return
      }
      setNotice("문의 채널 설정을 저장했습니다.")
      await loadContactSettings()
    } catch {
      setError("문의 채널 설정 저장 중 오류가 발생했습니다.")
    } finally {
      setContactSaving(false)
    }
  }, [contactFacebookUrl, contactInstagramUrl, loadContactSettings])

  const saveDesignSettings = React.useCallback(async () => {
    setDesignSaving(true)
    setError("")
    setNotice("")
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginBackgroundUrl, appBackgroundUrl }),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        setError(data.message || "디자인 설정 저장에 실패했습니다.")
        return
      }
      setNotice("디자인 설정을 저장했습니다.")
      await loadDesignSettings()
    } catch {
      setError("디자인 설정 저장 중 오류가 발생했습니다.")
    } finally {
      setDesignSaving(false)
    }
  }, [appBackgroundUrl, loadDesignSettings, loginBackgroundUrl])

  const uploadDesignImage = React.useCallback(async (file: File, target: "login" | "app") => {
    setUploading(true)
    setError("")
    try {
      const size = await readImageSize(file)
      const rule = target === "login" ? IMAGE_RULES.login : IMAGE_RULES.app
      const v = validateImageByRule(size.width, size.height, rule)
      if (!v.ok) {
        setError(v.message)
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
        setError(presign.message || "이미지 업로드 준비에 실패했습니다.")
        return
      }
      const putRes = await putFileToSupabaseSignedUploadUrl(presign.signedUrl, file, { timeoutMs: 180000 })
      if (!putRes.ok) {
        setError("이미지 업로드에 실패했습니다.")
        return
      }
      if (target === "login") setLoginBackgroundUrl(presign.publicUrl || "")
      if (target === "app") setAppBackgroundUrl(presign.publicUrl || "")
      setNotice("이미지를 업로드했습니다. 저장 버튼을 눌러 반영하세요.")
    } catch {
      setError("이미지 업로드 중 오류가 발생했습니다.")
    } finally {
      setUploading(false)
    }
  }, [])

  const filteredItems = React.useMemo(() => {
    if (activeTab === "popup" || activeTab === "info" || activeTab === "store_photo") {
      return items.filter((x) => x.contentType === activeTab)
    }
    return items
  }, [activeTab, items])

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

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-5">
            <TabsTrigger value="design">디자인</TabsTrigger>
            <TabsTrigger value="popup">팝업</TabsTrigger>
            <TabsTrigger value="info">정보 업데이트</TabsTrigger>
            <TabsTrigger value="store_photo">매장 사진</TabsTrigger>
            <TabsTrigger value="contact">문의 채널</TabsTrigger>
          </TabsList>

          <TabsContent value="design" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>배경화면 디자인 관리</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  로그인 화면 / 접속 후 메인 화면 배경을 업로드합니다. 권장 포맷: JPG/PNG, 1080x1920(px) 세로형.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 rounded-lg border p-3">
                    <Label>로그인 배경 URL</Label>
                    <Input
                      value={loginBackgroundUrl}
                      onChange={(e) => setLoginBackgroundUrl(e.target.value)}
                      placeholder="https://..."
                    />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void uploadDesignImage(file, "login")
                      }}
                    />
                    {loginBackgroundUrl ? (
                      <img src={loginBackgroundUrl} alt="login bg" className="h-28 w-full rounded object-cover" />
                    ) : null}
                  </div>
                  <div className="space-y-2 rounded-lg border p-3">
                    <Label>접속 후 배경 URL</Label>
                    <Input
                      value={appBackgroundUrl}
                      onChange={(e) => setAppBackgroundUrl(e.target.value)}
                      placeholder="https://..."
                    />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void uploadDesignImage(file, "app")
                      }}
                    />
                    {appBackgroundUrl ? (
                      <img src={appBackgroundUrl} alt="app bg" className="h-28 w-full rounded object-cover" />
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveDesignSettings()} disabled={designSaving || uploading}>
                    {designSaving ? "저장 중..." : "디자인 저장"}
                  </Button>
                  <Button variant="outline" onClick={() => loadDesignSettings().catch(() => {})}>
                    다시 불러오기
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>문의 채널 설정</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  회원앱 로그인 화면의 Contact us에서 열리는 Facebook / Instagram 링크를 관리합니다.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Facebook URL</Label>
                    <Input
                      value={contactFacebookUrl}
                      onChange={(e) => setContactFacebookUrl(e.target.value)}
                      placeholder="https://www.facebook.com/..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Instagram URL</Label>
                    <Input
                      value={contactInstagramUrl}
                      onChange={(e) => setContactInstagramUrl(e.target.value)}
                      placeholder="https://www.instagram.com/..."
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveContactSettings()} disabled={contactSaving}>
                    {contactSaving ? "저장 중..." : "문의 채널 저장"}
                  </Button>
                  <Button variant="outline" onClick={() => loadContactSettings().catch(() => {})}>
                    다시 불러오기
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="popup" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>팝업 관리</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">권장 이미지 사이즈: 1080x1350(px), 모바일 카드형.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>정보 업데이트 관리</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">공지/이벤트/운영 안내 등 텍스트 중심 콘텐츠를 관리합니다.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="store_photo" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>매장 사진 관리</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">권장 이미지 사이즈: 1200x800(px), 3:2 비율.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {(activeTab === "popup" || activeTab === "info" || activeTab === "store_photo") && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>콘텐츠 등록/수정</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>관리 탭</Label>
                      <Input value={form.contentType} readOnly />
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
                    <Button
                      variant="outline"
                      onClick={() => setForm({ ...emptyForm(), contentType: activeTab as ContentType })}
                    >
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
                  {filteredItems.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      등록된 콘텐츠가 없습니다.
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
                          {filteredItems.map((it) => (
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
            </>
          )}
        </Tabs>
      </div>
    </div>
  )
}


"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { MemberPortalContentAdminPanel } from "@/components/admin/member-portal-content-admin-panel"
import { MemberPortalStoresPanel } from "@/components/admin/member-portal-stores-panel"
import type { MemberPortalContentAdminItem } from "@/lib/member-portal-content-admin"
import { countContentForAdminTab } from "@/lib/member-portal-content-admin"
import { useAuth } from "@/lib/auth-context"
import { canEditMemberPortalAdmin } from "@/lib/permissions"
import { apiFetch } from "@/lib/api/fetch"
import { putFileToSupabaseSignedUploadUrl } from "@/lib/storage-client-upload"

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
  const { auth } = useAuth()
  const canEdit = canEditMemberPortalAdmin(auth?.role || "", auth?.store)
  const [activeTab, setActiveTab] = React.useState<
    "all" | "design" | "popup" | "promo" | "info" | "stores" | "contact" | "delivery"
  >("all")
  const [items, setItems] = React.useState<MemberPortalContentAdminItem[]>([])
  const [contactFacebookUrl, setContactFacebookUrl] = React.useState("")
  const [contactInstagramUrl, setContactInstagramUrl] = React.useState("")
  const [deliveryGrabUrl, setDeliveryGrabUrl] = React.useState("")
  const [deliveryLinemanUrl, setDeliveryLinemanUrl] = React.useState("")
  const [deliveryShopeeUrl, setDeliveryShopeeUrl] = React.useState("")
  const [loginBackgroundUrl, setLoginBackgroundUrl] = React.useState("")
  const [appBackgroundUrl, setAppBackgroundUrl] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [contactSaving, setContactSaving] = React.useState(false)
  const [deliverySaving, setDeliverySaving] = React.useState(false)
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
        items?: MemberPortalContentAdminItem[]
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

  const loadDeliverySettings = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/delivery-links", { cache: "no-store" })
      const data = (await res.json()) as {
        success: boolean
        grabUrl?: string
        linemanUrl?: string
        shopeeUrl?: string
      }
      if (!res.ok || !data.success) return
      setDeliveryGrabUrl(String(data.grabUrl || ""))
      setDeliveryLinemanUrl(String(data.linemanUrl || ""))
      setDeliveryShopeeUrl(String(data.shopeeUrl || ""))
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
    loadDeliverySettings().catch(() => {})
    loadDesignSettings().catch(() => {})
  }, [loadContactSettings, loadDeliverySettings, loadDesignSettings, refresh])

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

  const saveDeliverySettings = React.useCallback(async () => {
    setDeliverySaving(true)
    setError("")
    setNotice("")
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/delivery-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grabUrl: deliveryGrabUrl,
          linemanUrl: deliveryLinemanUrl,
          shopeeUrl: deliveryShopeeUrl,
        }),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        setError(data.message || "배달 앱 링크 저장에 실패했습니다.")
        return
      }
      setNotice("배달 앱 링크를 저장했습니다.")
      await loadDeliverySettings()
    } catch {
      setError("배달 앱 링크 저장 중 오류가 발생했습니다.")
    } finally {
      setDeliverySaving(false)
    }
  }, [deliveryGrabUrl, deliveryLinemanUrl, deliveryShopeeUrl, loadDeliverySettings])

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

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <CrmSubnav />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">회원앱 운영</h1>
            <p className="text-sm text-muted-foreground">
              월별 프로모션·팝업·정보·공지 목록을 검색·필터하고, 매장·디자인·문의 채널을 함께 관리합니다.
            </p>
          </div>
          <Button variant="outline" onClick={() => refresh()} disabled={loading}>
            {loading ? "불러오는 중..." : "새로고침"}
          </Button>
        </div>

        {!!notice && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
        )}
        {!!error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {!canEdit ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            이 화면은 조회만 가능합니다. 편집은 본사·회계·매장 관리자 계정으로 로그인해 주세요.
          </div>
        ) : null}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-8">
            <TabsTrigger value="all">
              전체 목록
              {items.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {countContentForAdminTab(items, "all")}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="promo">
              월별 프로모션
              {items.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {countContentForAdminTab(items, "promo")}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="popup">
              팝업
              {items.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {countContentForAdminTab(items, "popup")}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="info">
              정보·공지
              {items.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {countContentForAdminTab(items, "info")}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="stores">매장</TabsTrigger>
            <TabsTrigger value="design">디자인</TabsTrigger>
            <TabsTrigger value="contact">문의</TabsTrigger>
            <TabsTrigger value="delivery">배달</TabsTrigger>
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
                <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
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
                  <Button onClick={() => saveDesignSettings()} disabled={designSaving || uploading || !canEdit}>
                    {designSaving ? "저장 중..." : "디자인 저장"}
                  </Button>
                  <Button variant="outline" onClick={() => loadDesignSettings().catch(() => {})}>
                    다시 불러오기
                  </Button>
                </div>
                </fieldset>
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
                <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
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
                  <Button onClick={() => saveContactSettings()} disabled={contactSaving || !canEdit}>
                    {contactSaving ? "저장 중..." : "문의 채널 저장"}
                  </Button>
                  <Button variant="outline" onClick={() => loadContactSettings().catch(() => {})}>
                    다시 불러오기
                  </Button>
                </div>
                </fieldset>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="delivery" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>배달 앱 링크</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  회원앱 주문 탭에서 배달 선택 시 열리는 GrabFood / LINE MAN / ShopeeFood 링크입니다. 비워 두면 기본 URL을 사용합니다.
                </p>
                <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label>GrabFood URL</Label>
                    <Input
                      value={deliveryGrabUrl}
                      onChange={(e) => setDeliveryGrabUrl(e.target.value)}
                      placeholder="https://food.grab.com/..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>LINE MAN URL</Label>
                    <Input
                      value={deliveryLinemanUrl}
                      onChange={(e) => setDeliveryLinemanUrl(e.target.value)}
                      placeholder="https://lineman.line.me/..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ShopeeFood URL</Label>
                    <Input
                      value={deliveryShopeeUrl}
                      onChange={(e) => setDeliveryShopeeUrl(e.target.value)}
                      placeholder="https://shopeefood.th/..."
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveDeliverySettings()} disabled={deliverySaving || !canEdit}>
                    {deliverySaving ? "저장 중..." : "배달 링크 저장"}
                  </Button>
                  <Button variant="outline" onClick={() => loadDeliverySettings().catch(() => {})}>
                    다시 불러오기
                  </Button>
                </div>
                </fieldset>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            <MemberPortalContentAdminPanel
              variant="all"
              items={items}
              loading={loading}
              canEdit={canEdit}
              onSaved={refresh}
              onNotice={setNotice}
              onError={setError}
            />
          </TabsContent>

          <TabsContent value="promo" className="space-y-4">
            <MemberPortalContentAdminPanel
              variant="promo"
              items={items}
              loading={loading}
              canEdit={canEdit}
              onSaved={refresh}
              onNotice={setNotice}
              onError={setError}
            />
          </TabsContent>

          <TabsContent value="popup" className="space-y-4">
            <MemberPortalContentAdminPanel
              variant="popup"
              items={items}
              loading={loading}
              canEdit={canEdit}
              onSaved={refresh}
              onNotice={setNotice}
              onError={setError}
            />
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            <MemberPortalContentAdminPanel
              variant="info"
              items={items}
              loading={loading}
              canEdit={canEdit}
              onSaved={refresh}
              onNotice={setNotice}
              onError={setError}
            />
          </TabsContent>

          <TabsContent value="stores" className="space-y-4">
            <MemberPortalStoresPanel
              canEdit={canEdit}
              onNotice={(msg) => {
                setNotice(msg)
                setError("")
              }}
              onError={(msg) => {
                setError(msg)
                setNotice("")
              }}
            />
          </TabsContent>

        </Tabs>
      </div>
    </div>
  )
}


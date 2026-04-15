"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { appAlert } from "@/lib/app-message"
import { uploadPosMenuImage } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, RefreshCw, Save, Upload, Plus } from "lucide-react"

type ProductItem = {
  id: string
  slug: string
  title: string
  subtitle: string
  summary: string
  description: string
  priceLabel: string
  coverImageUrl: string
  galleryUrls: string[]
  featureBullets: string[]
  ctaLabel: string
  ctaUrl: string
  isActive: boolean
  sortOrder: number
}

type ProductForm = {
  id: string
  slug: string
  title: string
  subtitle: string
  summary: string
  description: string
  priceLabel: string
  coverImageUrl: string
  galleryUrlsText: string
  featureBulletsText: string
  ctaLabel: string
  ctaUrl: string
  isActive: boolean
  sortOrder: string
}

function emptyForm(): ProductForm {
  return {
    id: "",
    slug: "",
    title: "",
    subtitle: "",
    summary: "",
    description: "",
    priceLabel: "",
    coverImageUrl: "",
    galleryUrlsText: "",
    featureBulletsText: "",
    ctaLabel: "",
    ctaUrl: "",
    isActive: true,
    sortOrder: "0",
  }
}

function toForm(item: ProductItem): ProductForm {
  return {
    id: item.id,
    slug: item.slug || "",
    title: item.title || "",
    subtitle: item.subtitle || "",
    summary: item.summary || "",
    description: item.description || "",
    priceLabel: item.priceLabel || "",
    coverImageUrl: item.coverImageUrl || "",
    galleryUrlsText: (item.galleryUrls || []).join("\n"),
    featureBulletsText: (item.featureBullets || []).join("\n"),
    ctaLabel: item.ctaLabel || "",
    ctaUrl: item.ctaUrl || "",
    isActive: item.isActive !== false,
    sortOrder: String(item.sortOrder ?? 0),
  }
}

function parseMultiline(text: string): string[] {
  return text
    .split(/\r?\n/g)
    .map((x) => x.trim())
    .filter(Boolean)
}

export function AdminProductCatalog() {
  const { auth } = useAuth()
  const [items, setItems] = useState<ProductItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState<ProductForm>(emptyForm)

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [items]
  )

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/productCatalog?admin=1", { cache: "no-store" })
      const data = (await res.json()) as { items?: ProductItem[]; message?: string }
      if (!res.ok) {
        throw new Error(data.message || `요청 실패 (${res.status})`)
      }
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const handlePickItem = (item: ProductItem) => {
    setForm(toForm(item))
  }

  const handleResetForm = () => {
    setForm(emptyForm())
  }

  const handleUploadCoverImage = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const r = await uploadPosMenuImage({ file })
      if (!r.success || !r.url) {
        throw new Error(r.message || "이미지 업로드에 실패했습니다.")
      }
      setForm((prev) => ({ ...prev, coverImageUrl: r.url || "" }))
      await appAlert("이미지가 업로드되었습니다.")
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      await appAlert("상품명을 입력해 주세요.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/productCatalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined,
          slug: form.slug,
          title: form.title,
          subtitle: form.subtitle,
          summary: form.summary,
          description: form.description,
          priceLabel: form.priceLabel,
          coverImageUrl: form.coverImageUrl,
          galleryUrls: parseMultiline(form.galleryUrlsText),
          featureBullets: parseMultiline(form.featureBulletsText),
          ctaLabel: form.ctaLabel,
          ctaUrl: form.ctaUrl,
          isActive: form.isActive,
          sortOrder: Number(form.sortOrder || 0),
          userRole: auth?.role,
          userName: auth?.user,
          userStore: auth?.store,
        }),
      })
      const data = (await res.json()) as { success?: boolean; message?: string; item?: ProductItem }
      if (!res.ok || data.success !== true) {
        throw new Error(data.message || "저장 실패")
      }
      await appAlert(data.message || "저장되었습니다.")
      await loadItems()
      if (data.item) {
        setForm(toForm(data.item))
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">상품 소개 페이지 관리</h1>
            <p className="text-xs text-muted-foreground">
              상품명, 설명, 가격, 이미지, CTA 버튼을 저장하면 공개 페이지 <code>/products</code>에 바로 반영됩니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-9 gap-1.5" onClick={() => void loadItems()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Button variant="outline" className="h-9 gap-1.5" onClick={handleResetForm}>
              <Plus className="h-4 w-4" />
              신규 등록
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">등록된 상품</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sortedItems.length === 0 ? (
                <p className="rounded border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  등록된 상품이 없습니다.
                </p>
              ) : (
                sortedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handlePickItem(item)}
                    className="w-full rounded-lg border p-3 text-left transition hover:border-primary/40 hover:bg-muted/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          item.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {item.isActive ? "노출" : "숨김"}
                      </span>
                    </div>
                    {item.priceLabel ? (
                      <p className="mt-1 text-xs text-muted-foreground">{item.priceLabel}</p>
                    ) : null}
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{form.id ? "상품 수정" : "상품 등록"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">상품명 *</label>
                  <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">슬러그 (선택)</label>
                  <Input
                    value={form.slug}
                    onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                    placeholder="quickpos-basic"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">짧은 소개</label>
                  <Input
                    value={form.subtitle}
                    onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
                    placeholder="예: 소형 매장을 위한 기본형 POS"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">가격 라벨</label>
                  <Input
                    value={form.priceLabel}
                    onChange={(e) => setForm((p) => ({ ...p, priceLabel: e.target.value }))}
                    placeholder="예: 시작가 1,900 THB"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">요약 문구</label>
                <Textarea
                  value={form.summary}
                  onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
                  className="min-h-[70px]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">상세 설명</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="min-h-[120px]"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr,auto]">
                <div>
                  <label className="mb-1 block text-xs font-semibold">대표 이미지 URL</label>
                  <Input
                    value={form.coverImageUrl}
                    onChange={(e) => setForm((p) => ({ ...p, coverImageUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
                <div className="self-end">
                  <label className="inline-flex cursor-pointer items-center">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        void handleUploadCoverImage(e.target.files?.[0] || null)
                        e.currentTarget.value = ""
                      }}
                    />
                    <span className="inline-flex h-10 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      이미지 업로드
                    </span>
                  </label>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">갤러리 이미지 URL (줄바꿈)</label>
                  <Textarea
                    value={form.galleryUrlsText}
                    onChange={(e) => setForm((p) => ({ ...p, galleryUrlsText: e.target.value }))}
                    className="min-h-[90px]"
                    placeholder={"https://...\nhttps://..."}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">특징 포인트 (줄바꿈)</label>
                  <Textarea
                    value={form.featureBulletsText}
                    onChange={(e) => setForm((p) => ({ ...p, featureBulletsText: e.target.value }))}
                    className="min-h-[90px]"
                    placeholder={"재고 관리\n바코드 스캔\n오프라인 동작"}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr,1fr,120px]">
                <div>
                  <label className="mb-1 block text-xs font-semibold">CTA 버튼 텍스트</label>
                  <Input
                    value={form.ctaLabel}
                    onChange={(e) => setForm((p) => ({ ...p, ctaLabel: e.target.value }))}
                    placeholder="상담 문의"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">CTA 링크 URL</label>
                  <Input
                    value={form.ctaUrl}
                    onChange={(e) => setForm((p) => ({ ...p, ctaUrl: e.target.value }))}
                    placeholder="https://line.me/..."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">정렬 순서</label>
                  <Input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v === true }))}
                  />
                  공개 페이지에 노출
                </label>
                <Button className="h-9 gap-1.5" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  저장
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}


"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { MemberPortalLineList } from "@/components/admin/member-portal-line-list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { apiFetch } from "@/lib/api/fetch"
import {
  filterContentForAdminTab,
  formatMemberPortalAdminPeriod,
  memberPortalContentPlacementLabel,
  toDatetimeLocalValue,
  type MemberPortalContentAdminItem,
} from "@/lib/member-portal-content-admin"
import { putFileToSupabaseSignedUploadUrl } from "@/lib/storage-client-upload"

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

const VARIANT_META = {
  popup: {
    title: "팝업",
    description: "로그인 후 홈에 뜨는 팝업 배너입니다. LINE OA 쿠폰 목록처럼 등록·사용 중지를 바로 전환할 수 있습니다.",
    empty: "등록된 팝업이 없습니다. 「새 팝업」으로 추가하세요.",
    newLabel: "새 팝업",
    defaultTargetTab: "home",
    contentType: "popup" as const,
  },
  promo: {
    title: "월별 프로모션",
    description:
      "회원앱 홈 「이달의 프로모션」 가로 목록에 노출됩니다. 시작·종료일(방콕)로 월별 필터가 적용됩니다.",
    empty: "등록된 월별 프로모션이 없습니다.",
    newLabel: "새 프로모션",
    defaultTargetTab: "home_promo",
    contentType: "info" as const,
  },
  info: {
    title: "정보·공지",
    description: "홈 공지·추천 타일(home_feature) 등 텍스트 안내를 관리합니다.",
    empty: "등록된 정보 콘텐츠가 없습니다.",
    newLabel: "새 공지",
    defaultTargetTab: "home",
    contentType: "info" as const,
  },
}

function emptyForm(variant: keyof typeof VARIANT_META): FormState {
  const meta = VARIANT_META[variant]
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
    contentType: item.contentType,
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

type MemberPortalContentAdminPanelProps = {
  variant: keyof typeof VARIANT_META
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
  const meta = VARIANT_META[variant]
  const filtered = React.useMemo(() => filterContentForAdminTab(items, variant), [items, variant])

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(() => emptyForm(variant))
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [togglingKey, setTogglingKey] = React.useState<string | null>(null)

  const openNew = React.useCallback(() => {
    setForm(emptyForm(variant))
    setSheetOpen(true)
  }, [variant])

  const openEdit = React.useCallback(
    (contentKey: string) => {
      const item = filtered.find((x) => x.contentKey === contentKey)
      if (!item) return
      setForm(itemToForm(item))
      setSheetOpen(true)
    },
    [filtered]
  )

  const persist = React.useCallback(
    async (payload: FormState) => {
      const res = await apiFetch("/api/member-portal/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        throw new Error(data.message || "저장에 실패했습니다.")
      }
    },
    []
  )

  const onSave = React.useCallback(async () => {
    setSaving(true)
    onError("")
    try {
      await persist(form)
      onNotice("저장되었습니다.")
      setSheetOpen(false)
      await onSaved()
    } catch (e) {
      onError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.")
    } finally {
      setSaving(false)
    }
  }, [form, onError, onNotice, onSaved, persist])

  const onToggleActive = React.useCallback(
    async (contentKey: string) => {
      const item = filtered.find((x) => x.contentKey === contentKey)
      if (!item) return
      setTogglingKey(contentKey)
      onError("")
      try {
        await persist({ ...itemToForm(item), isActive: !item.isActive })
        onNotice(item.isActive ? "노출을 중지했습니다." : "사용 중으로 전환했습니다.")
        await onSaved()
      } catch (e) {
        onError(e instanceof Error ? e.message : "상태 변경에 실패했습니다.")
      } finally {
        setTogglingKey(null)
      }
    },
    [filtered, onError, onNotice, onSaved, persist]
  )

  const onUploadImage = React.useCallback(
    async (file: File) => {
      setUploading(true)
      onError("")
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
          onError(presign.message || "이미지 업로드 준비에 실패했습니다.")
          return
        }
        const putRes = await putFileToSupabaseSignedUploadUrl(presign.signedUrl, file, { timeoutMs: 180000 })
        if (!putRes.ok) {
          onError("이미지 업로드에 실패했습니다.")
          return
        }
        setForm((prev) => ({ ...prev, imageUrl: presign.publicUrl || "" }))
        onNotice("이미지가 업로드되었습니다.")
      } catch {
        onError("이미지 업로드 중 오류가 발생했습니다.")
      } finally {
        setUploading(false)
      }
    },
    [onError, onNotice]
  )

  const listRows = filtered.map((it) => ({
    id: it.contentKey,
    imageUrl: it.imageUrl,
    title: it.title,
    subtitle: it.body ? it.body.slice(0, 80) : undefined,
    placement: memberPortalContentPlacementLabel(it.targetTab, it.contentType),
    periodLabel: formatMemberPortalAdminPeriod(it.startsAt, it.endsAt),
    sortOrder: it.sortOrder,
    isActive: it.isActive,
    toggling: togglingKey === it.contentKey,
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{meta.title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{meta.description}</p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={openNew} className="shrink-0 bg-[#06c755] hover:bg-[#05b34c]">
            <Plus className="mr-1.5 h-4 w-4" />
            {meta.newLabel}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-lg border px-6 py-10 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : (
        <MemberPortalLineList
          rows={listRows}
          emptyMessage={meta.empty}
          onToggleActive={onToggleActive}
          onEdit={openEdit}
          canEdit={canEdit}
        />
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {form.contentKey ? `${meta.title} 편집` : meta.newLabel}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-4 pb-8">
            <div className="space-y-1.5">
              <Label>제목</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="회원에게 보이는 제목"
              />
            </div>

            <div className="space-y-1.5">
              <Label>이미지</Label>
              <Input
                value={form.imageUrl}
                onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                placeholder="https://..."
              />
              <input
                type="file"
                accept="image/*"
                className="text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onUploadImage(file)
                }}
              />
              {uploading ? <p className="text-xs text-muted-foreground">업로드 중...</p> : null}
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="" className="mt-2 max-h-40 w-full rounded-lg object-cover" />
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>본문</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                rows={4}
                placeholder="상세 설명 (탭 시 시트에 표시)"
              />
            </div>

            {variant !== "popup" ? (
              <div className="space-y-1.5">
                <Label>노출 탭</Label>
                <Input
                  value={form.targetTab}
                  onChange={(e) => setForm((p) => ({ ...p, targetTab: e.target.value }))}
                  placeholder={meta.defaultTargetTab}
                  readOnly={variant === "promo"}
                />
                {variant === "promo" ? (
                  <p className="text-xs text-muted-foreground">월별 프로모션은 home_promo로 고정됩니다.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    예: home, home_feature, home_promo, location
                  </p>
                )}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>시작 (방콕)</Label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>종료 (방콕)</Label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>정렬순서</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>매장 코드 (선택)</Label>
                <Input
                  value={form.storeCode}
                  onChange={(e) => setForm((p) => ({ ...p, storeCode: e.target.value }))}
                  placeholder="CM01"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <input
                id={`active-${variant}`}
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              <label htmlFor={`active-${variant}`} className="text-sm">
                사용 중 (회원앱 노출)
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" onClick={() => void onSave()} disabled={saving || uploading} className="flex-1">
                {saving ? "저장 중..." : "저장"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                닫기
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

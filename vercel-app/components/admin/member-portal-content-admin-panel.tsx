"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { MemberPortalContentAdminList } from "@/components/admin/member-portal-content-admin-list"
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
import { putFileToSupabaseSignedUploadUrl } from "@/lib/storage-client-upload"
import {
  formatMemberPortalContentImageHint,
  readMemberPortalImageSize,
  resolveMemberPortalContentImageRule,
  validateMemberPortalImageByRule,
} from "@/lib/member-portal-content-image-rules"

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

const VARIANT_META: Record<
  Exclude<MemberPortalContentAdminTab, "all">,
  {
    title: string
    description: string
    empty: string
    newLabel: string
    defaultTargetTab: string
    contentType: ContentType
  }
> = {
  popup: {
    title: "팝업",
    description: "로그인 후 홈에 뜨는 팝업 배너입니다. 목록에서 노출 상태·기간·미리보기를 확인하고 바로 편집할 수 있습니다.",
    empty: "등록된 팝업이 없습니다. 「새 팝업」으로 추가하세요.",
    newLabel: "새 팝업",
    defaultTargetTab: "home",
    contentType: "popup",
  },
  promo: {
    title: "월별 프로모션",
    description:
      "회원앱 홈 「이달의 프로모션」 가로 목록에 노출됩니다. 시작·종료일(방콕)로 월별 필터가 적용됩니다.",
    empty: "등록된 월별 프로모션이 없습니다.",
    newLabel: "새 프로모션",
    defaultTargetTab: "home_promo",
    contentType: "info",
  },
  info: {
    title: "정보·공지",
    description: "홈 공지·추천 타일(home_feature) 등 텍스트 안내를 관리합니다.",
    empty: "등록된 정보 콘텐츠가 없습니다.",
    newLabel: "새 공지",
    defaultTargetTab: "home",
    contentType: "info",
  },
}

const INFO_TARGET_OPTIONS = [
  { value: "home", label: "홈 · 공지" },
  { value: "home_feature", label: "홈 · 추천 타일" },
  { value: "location", label: "매장 탭" },
] as const

function emptyForm(variant: Exclude<MemberPortalContentAdminTab, "all">): FormState {
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
  const panelVariant = variant === "all" ? "promo" : variant
  const meta = VARIANT_META[panelVariant]
  const filtered = React.useMemo(() => filterContentForAdminTab(items, variant), [items, variant])

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [formVariant, setFormVariant] = React.useState<Exclude<MemberPortalContentAdminTab, "all">>(panelVariant)
  const [form, setForm] = React.useState<FormState>(() => emptyForm(panelVariant))
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [togglingKey, setTogglingKey] = React.useState<string | null>(null)
  const [deletingKey, setDeletingKey] = React.useState<string | null>(null)

  const formMeta = VARIANT_META[formVariant]
  const imageRule = React.useMemo(() => resolveMemberPortalContentImageRule(formVariant), [formVariant])
  const imageHint = formatMemberPortalContentImageHint(imageRule)

  const openNew = React.useCallback(
    (targetVariant?: Exclude<MemberPortalContentAdminTab, "all">) => {
      const nextVariant = targetVariant || panelVariant
      setFormVariant(nextVariant)
      setForm(emptyForm(nextVariant))
      setSheetOpen(true)
    },
    [panelVariant]
  )

  const openEdit = React.useCallback(
    (contentKey: string) => {
      const item = filtered.find((x) => x.contentKey === contentKey)
      if (!item) return
      const editVariant = resolveEditVariant(variant, item)
      setFormVariant(editVariant)
      setForm(itemToForm(item))
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
      setSheetOpen(true)
    },
    [filtered, variant]
  )

  const persist = React.useCallback(async (payload: FormState) => {
    const res = await apiFetch("/api/member-portal/admin/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = (await res.json()) as { success: boolean; message?: string }
    if (!res.ok || !data.success) {
      throw new Error(data.message || "저장에 실패했습니다.")
    }
  }, [])

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

  const onDelete = React.useCallback(
    async (contentKey: string) => {
      const item = filtered.find((x) => x.contentKey === contentKey)
      if (!item) return
      const ok = await appConfirm(`「${item.title || contentKey}」 항목을 삭제할까요?`, {
        title: "콘텐츠 삭제",
        confirmLabel: "삭제",
        cancelLabel: "취소",
      })
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
          throw new Error(data.message || "삭제에 실패했습니다.")
        }
        onNotice("삭제되었습니다.")
        await onSaved()
      } catch (e) {
        onError(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.")
      } finally {
        setDeletingKey(null)
      }
    },
    [filtered, onError, onNotice, onSaved]
  )

  const onUploadImage = React.useCallback(
    async (file: File) => {
      setUploading(true)
      onError("")
      try {
        const rule = resolveMemberPortalContentImageRule(formVariant)
        const size = await readMemberPortalImageSize(file)
        const validation = validateMemberPortalImageByRule(size.width, size.height, rule)
        if (!validation.ok) {
          onError(validation.message)
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
        setForm((prev) => ({ ...prev, imageUrl: presign.publicUrl || "" }))
        onNotice("이미지가 업로드되었습니다.")
      } catch {
        onError("이미지 업로드 중 오류가 발생했습니다.")
      } finally {
        setUploading(false)
      }
    },
    [formVariant, onError, onNotice]
  )

  const headerTitle =
    variant === "all" ? "전체 콘텐츠 목록" : meta.title
  const headerDescription =
    variant === "all"
      ? "월별 프로모션·팝업·정보·공지를 한 화면에서 검색·필터·미리보기할 수 있습니다."
      : meta.description
  const emptyMessage =
    variant === "all"
      ? "등록된 콘텐츠가 없습니다. 아래 탭에서 새 항목을 추가하세요."
      : meta.empty

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
                  프로모션
                </Button>
                <Button type="button" variant="outline" onClick={() => openNew("popup")}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  팝업
                </Button>
                <Button type="button" onClick={() => openNew("info")} className="bg-[#06c755] hover:bg-[#05b34c]">
                  <Plus className="mr-1.5 h-4 w-4" />
                  공지
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
        <div className="rounded-lg border px-6 py-10 text-center text-sm text-muted-foreground">불러오는 중...</div>
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b px-6 py-5 pr-14">
            <SheetTitle>{form.contentKey ? `${formMeta.title} 편집` : formMeta.newLabel}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-6 px-6 py-6 pb-10">
            {form.contentKey ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                콘텐츠 키: <span className="font-mono text-foreground">{form.contentKey}</span>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="mp-content-title">제목</Label>
              <Input
                id="mp-content-title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="회원에게 보이는 제목"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mp-content-image-url">이미지</Label>
              <p className="text-xs leading-relaxed text-muted-foreground">{imageHint}</p>
              <Input
                id="mp-content-image-url"
                value={form.imageUrl}
                onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                placeholder="https://..."
              />
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-5 text-center transition hover:bg-muted/35">
                <span className="text-sm font-medium text-foreground">
                  {uploading ? "업로드 중..." : "이미지 파일 선택"}
                </span>
                <span className="text-xs text-muted-foreground">{imageHint}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void onUploadImage(file)
                    e.target.value = ""
                  }}
                />
              </label>
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="" className="max-h-44 w-full rounded-lg border object-cover" />
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mp-content-body">본문</Label>
              <Textarea
                id="mp-content-body"
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                rows={5}
                placeholder="상세 설명 (탭 시 시트에 표시)"
              />
            </div>

            {formVariant !== "popup" ? (
              <div className="space-y-2">
                <Label htmlFor="mp-content-target-tab">노출 탭</Label>
                {formVariant === "promo" ? (
                  <>
                    <Input id="mp-content-target-tab" value={form.targetTab} readOnly />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      월별 프로모션은 home_promo로 고정됩니다.
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
                      {INFO_TARGET_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      home_feature = 홈 신메뉴·프로모션 타일 / home = 홈 하단 공지
                    </p>
                  </>
                )}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mp-content-starts">시작 (방콕)</Label>
                <Input
                  id="mp-content-starts"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mp-content-ends">종료 (방콕)</Label>
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
                <Label htmlFor="mp-content-sort">정렬순서</Label>
                <Input
                  id="mp-content-sort"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mp-content-store">매장 코드 (선택)</Label>
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
                사용 중 (회원앱 노출)
              </label>
            </div>

            <div className="flex gap-3 border-t pt-6">
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

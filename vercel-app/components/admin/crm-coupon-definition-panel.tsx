"use client"

import * as React from "react"
import { Plus, RotateCw, Save, Search, Tag, Trash2 } from "lucide-react"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  deletePosCoupon,
  getPosMenus,
  getPosCoupons,
  savePosCoupon,
  type PosCoupon,
  type PosMenu,
} from "@/lib/api-client"
import { formatCouponBenefit, redemptionModeLabel, sortCouponsForAdmin, type CrmPromoCodePrefill } from "@/lib/crm-coupon-admin"
import {
  buildItemScopePayload,
  emptyCouponItemScope,
  formatCouponItemScopeSummary,
  itemScopeFromCoupon,
  type CouponItemScope,
} from "@/lib/crm-coupon-item-scope"
import { CrmCouponMenuScopePicker } from "@/components/admin/crm-coupon-menu-scope-picker"
import { CrmImageUploadField } from "@/components/crm/crm-image-upload-field"
import { cn } from "@/lib/utils"
import { AdminDesktopOnly, AdminMobileOnly } from "@/components/erp/admin-responsive-list"
import {
  MEMBER_PORTAL_CONTENT_IMAGE_RULES,
  readMemberPortalImageSize,
  validateMemberPortalImageByRule,
  memberPortalImageUploadCatchMessage,
} from "@/lib/member-portal-content-image-rules"
import {
  uploadMemberPortalContentImageToStorage,
  verifyMemberPortalImagePublicUrl,
  withMemberPortalImageCacheBust,
} from "@/lib/member-portal-image-upload"

type CouponForm = {
  code: string
  name: string
  discountType: "percent" | "fixed" | "bogo" | "set_fixed" | "item_fixed"
  discountValue: string
  validFrom: string
  validTo: string
  minOrderAmt: string
  maxPerOrder: string
  redemptionMode: "reusable_code" | "single_use_serial" | "member_issue"
  stackMode: "fixed_only" | "percent_only" | "any"
  maxUses: string
  setQty: string
  priority: string
  allowWithManualDiscount: boolean
  isActive: boolean
  portalImageUrl: string
  portalVisible: boolean
  portalClaimMode: "none" | "free" | "points"
  portalPointCost: string
  portalMaxClaimsPerMember: string
  portalSortOrder: string
}

const EMPTY_FORM: CouponForm = {
  code: "",
  name: "",
  discountType: "fixed",
  discountValue: "",
  validFrom: "",
  validTo: "",
  minOrderAmt: "0",
  maxPerOrder: "1",
  redemptionMode: "member_issue",
  stackMode: "fixed_only",
  maxUses: "",
  setQty: "2",
  priority: "0",
  allowWithManualDiscount: true,
  isActive: true,
  portalImageUrl: "",
  portalVisible: false,
  portalClaimMode: "none",
  portalPointCost: "0",
  portalMaxClaimsPerMember: "1",
  portalSortOrder: "0",
}

function couponToForm(c: PosCoupon): CouponForm {
  return {
    code: c.code ?? "",
    name: c.name ?? "",
    discountType: (
      c.discountType === "percent" ||
      c.discountType === "bogo" ||
      c.discountType === "set_fixed" ||
      c.discountType === "item_fixed"
        ? c.discountType
        : "fixed"
    ) as CouponForm["discountType"],
    discountValue: String(c.discountValue ?? 0),
    validFrom: c.validFrom ?? c.startDate ?? "",
    validTo: c.validTo ?? c.endDate ?? "",
    minOrderAmt: String(c.minOrderAmt ?? 0),
    maxPerOrder: String(c.maxPerOrder ?? 1),
    redemptionMode: (c.redemptionMode ?? "member_issue") as CouponForm["redemptionMode"],
    stackMode: (c.stackMode ?? "fixed_only") as CouponForm["stackMode"],
    maxUses: c.maxUses != null ? String(c.maxUses) : "",
    setQty: String(c.setQty ?? 2),
    priority: String(c.priority ?? 0),
    allowWithManualDiscount: c.allowWithManualDiscount !== false,
    isActive: c.isActive !== false,
    portalImageUrl: String(c.portalImageUrl || "").trim(),
    portalVisible: Boolean(c.portalVisible),
    portalClaimMode: (c.portalClaimMode === "free" || c.portalClaimMode === "points"
      ? c.portalClaimMode
      : "none") as CouponForm["portalClaimMode"],
    portalPointCost: String(c.portalPointCost ?? 0),
    portalMaxClaimsPerMember: String(c.portalMaxClaimsPerMember ?? 1),
    portalSortOrder: String(c.portalSortOrder ?? 0),
  }
}

function CouponFormSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-5 shadow-sm ring-1 ring-black/[0.02]">
      <div className="mb-4 flex items-center gap-2 border-b border-border/60 pb-3">
        <span className="h-4 w-1 rounded-full bg-indigo-500" aria-hidden />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function CouponFormField({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export function CrmCouponDefinitionPanel({
  onOfferSecretPromo,
}: {
  onOfferSecretPromo?: (prefill: CrmPromoCodePrefill) => void
} = {}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [coupons, setCoupons] = React.useState<PosCoupon[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [form, setForm] = React.useState<CouponForm>(EMPTY_FORM)
  const [itemScope, setItemScope] = React.useState<CouponItemScope>(emptyCouponItemScope())
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [searchDraft, setSearchDraft] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [portalImageUploading, setPortalImageUploading] = React.useState(false)
  const [portalImageError, setPortalImageError] = React.useState("")
  const [portalImagePreviewNonce, setPortalImagePreviewNonce] = React.useState(0)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const [rows, menuRows] = await Promise.all([getPosCoupons(), getPosMenus()])
      setCoupons(sortCouponsForAdmin(rows || []))
      setMenus(menuRows || [])
    } catch {
      setCoupons([])
      setMenus([])
    } finally {
      setLoading(false)
    }
  }, [])

  const menuById = React.useMemo(() => {
    const map = new Map<string, PosMenu>()
    for (const m of menus) map.set(String(m.id), m)
    return map
  }, [menus])

  React.useEffect(() => {
    loadData().catch(() => {})
  }, [loadData])

  const openNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setItemScope(emptyCouponItemScope())
    setPortalImageError("")
    setSheetOpen(true)
  }

  const openEdit = (c: PosCoupon) => {
    setEditingId(c.id ?? null)
    setForm(couponToForm(c))
    setItemScope(itemScopeFromCoupon(c))
    setPortalImageError("")
    setSheetOpen(true)
  }

  const handlePortalImageUpload = async (file: File) => {
    setPortalImageError("")
    setPortalImageUploading(true)
    try {
      const rule = MEMBER_PORTAL_CONTENT_IMAGE_RULES.coupon_portal
      const size = await readMemberPortalImageSize(file)
      const v = validateMemberPortalImageByRule(size.width, size.height, rule, t, "coupon_portal")
      if (!v.ok) {
        setPortalImageError(v.message)
        return
      }
      const uploaded = await uploadMemberPortalContentImageToStorage(file)
      if (!uploaded.ok) {
        setPortalImageError(
          uploaded.message === "UPLOAD_PRESIGN_FAIL"
            ? t("mpAdmin_errImageUpload") || "업로드에 실패했습니다."
            : uploaded.message
        )
        return
      }
      const verified = await verifyMemberPortalImagePublicUrl(uploaded.publicUrl)
      if (!verified) {
        setPortalImageError(t("mpAdmin_errImageUpload") || "업로드한 이미지를 불러올 수 없습니다.")
        return
      }
      setForm((f) => ({ ...f, portalImageUrl: uploaded.publicUrl }))
      setPortalImagePreviewNonce((n) => n + 1)
    } catch (e) {
      setPortalImageError(memberPortalImageUploadCatchMessage(t, e))
    } finally {
      setPortalImageUploading(false)
    }
  }

  const handleSave = async () => {
    const code = form.code.trim().toUpperCase()
    const val = Number(form.discountValue) || 0
    if (!code) {
      await appAlert(t("posCouponCodeRequired") || "쿠폰 코드를 입력하세요.")
      return
    }
    if (form.discountType === "percent" && (val < 1 || val > 100)) {
      await appAlert(t("posCouponPercentRange") || "할인율은 1~100입니다.")
      return
    }
    setSaving(true)
    try {
      const res = await savePosCoupon({
        id: editingId ?? undefined,
        code,
        name: form.name.trim() || code,
        discountType: form.discountType,
        discountValue: val,
        validFrom: form.validFrom.trim() || null,
        validTo: form.validTo.trim() || null,
        isActive: form.isActive,
        minOrderAmt: Math.max(0, Number(form.minOrderAmt || 0)),
        maxPerOrder: Math.max(1, Math.trunc(Number(form.maxPerOrder || 1))),
        redemptionMode: form.redemptionMode,
        allowQuantityEntry: form.redemptionMode !== "member_issue",
        stackMode: form.stackMode,
        maxUses: form.maxUses.trim() ? Math.max(1, Math.trunc(Number(form.maxUses))) : null,
        setQty: form.setQty.trim() ? Math.max(2, Math.trunc(Number(form.setQty))) : undefined,
        priority: Math.max(-100, Math.min(100, Math.trunc(Number(form.priority || 0)))),
        allowWithManualDiscount: form.allowWithManualDiscount,
        itemScope: buildItemScopePayload(itemScope),
        portalImageUrl: form.portalImageUrl.trim(),
        portalVisible: form.portalVisible,
        portalClaimMode: form.portalClaimMode,
        portalPointCost: Math.max(0, Math.trunc(Number(form.portalPointCost || 0))),
        portalMaxClaimsPerMember: Math.max(
          1,
          Math.trunc(Number(form.portalMaxClaimsPerMember || 1))
        ),
        portalSortOrder: Math.trunc(Number(form.portalSortOrder || 0)),
      })
      if (!res.success) {
        await appAlert(res.message || t("posSaveFail") || "저장 실패")
        return
      }
      await appAlert(t("itemsAlertSaved") || "저장되었습니다.")
      setSheetOpen(false)
      await loadData()

      // 카탈로그 셀프클레임이 아닌 회원발급 → 앱 코드 입력용 시크릿 프로모 등록 유도 (RPKM 누락 방지)
      const claimMode = String(form.portalClaimMode || "none").toLowerCase()
      const wantsTypedSecret =
        form.redemptionMode === "member_issue" &&
        claimMode === "none" &&
        typeof onOfferSecretPromo === "function"
      if (wantsTypedSecret) {
        const go = await appConfirm(
          (t("crmCouponOfferSecretPromo") || "").replace("{code}", code),
          {
            confirmLabel: t("crmCouponOfferSecretPromoConfirm") || "프로모 코드 등록",
            cancelLabel: t("crmCouponOfferSecretPromoCancel") || "나중에",
          }
        )
        if (go) {
          onOfferSecretPromo({
            code,
            couponCode: code,
            label: form.name.trim() || code,
            validFrom: form.validFrom.trim(),
            validTo: form.validTo.trim(),
          })
        }
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: PosCoupon) => {
    if (c.id == null) return
    if (!(await appConfirm(`${c.code} ${t("posMenuConfirmDelete") || "삭제하시겠습니까?"}`))) return
    const res = await deletePosCoupon({ id: c.id })
    if (res.success) {
      await loadData()
      if (editingId === c.id) setSheetOpen(false)
    } else {
      await appAlert(res.message)
    }
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return coupons
    return coupons.filter((c) => {
      const hay = [c.code, c.name, c.redemptionMode].filter(Boolean).join(" ").toLowerCase()
      return hay.includes(q)
    })
  }, [coupons, search])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-950">
        <p className="font-medium">{t("crmCouponPosAppTitle") || "POS · 회원앱 연동"}</p>
        <p className="mt-1 text-xs text-indigo-900/80">
          {t("crmCouponPosAppDesc") ||
            "「회원 발급」 유형 쿠폰은 CRM에서 지급 → 회원앱 「내 혜택」에 표시 → POS 결제 시 회원 연결 후 자동 적용됩니다."}
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(searchDraft.trim())
        }}
      >
        <Input
          placeholder={t("crmCouponSearchPh") || "코드·이름 검색"}
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" size="sm">
          <Search className="mr-1 h-4 w-4" />
          {t("btn_query") || "검색"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => loadData()} disabled={loading}>
          <RotateCw className={cn("mr-1 h-4 w-4", loading && "animate-spin")} />
          {t("posRefresh") || "새로고침"}
        </Button>
        <Button type="button" size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" />
          {t("crmCouponNew") || "새 쿠폰"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border bg-card">
        <AdminDesktopOnly>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">{t("crmCouponColCode") || "코드"}</th>
                <th className="p-3 font-medium">{t("crmCouponColName") || "이름"}</th>
                <th className="p-3 font-medium">{t("crmCouponBenefit") || "혜택"}</th>
                <th className="p-3 font-medium">{t("crmCouponScopeTitle") || "적용 메뉴"}</th>
                <th className="p-3 font-medium">{t("posCouponRedemptionMode") || "사용 방식"}</th>
                <th className="p-3 font-medium">{t("crmCouponColValidPeriod") || "유효기간"}</th>
                <th className="p-3 font-medium">{t("crmCouponColStatus") || "상태"}</th>
                <th className="p-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {loading ? t("loading") : t("posCouponEmpty") || "등록된 쿠폰이 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id ?? c.code} className="border-t hover:bg-muted/20">
                    <td className="p-3 font-mono font-semibold">{c.code}</td>
                    <td className="p-3">{c.name || c.code}</td>
                    <td className="p-3 tabular-nums">{formatCouponBenefit(c, t)}</td>
                    <td className="p-3 max-w-[200px] text-xs text-muted-foreground">
                      {formatCouponItemScopeSummary(itemScopeFromCoupon(c), menuById, t)}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">{redemptionModeLabel(c.redemptionMode, t)}</Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {(c.validFrom || "—") + " ~ " + (c.validTo || "—")}
                    </td>
                    <td className="p-3">
                      <Badge variant={c.isActive === false ? "secondary" : "default"}>
                        {c.isActive === false
                          ? t("crmCouponStatusInactive") || "비활성"
                          : t("crmCouponStatusActive") || "활성"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          {t("posEdit") || "수정"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(c)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </AdminDesktopOnly>
        <AdminMobileOnly>
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {loading ? t("loading") : t("posCouponEmpty") || "등록된 쿠폰이 없습니다."}
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {filtered.map((c) => (
                <div key={c.id ?? c.code} className="space-y-2 px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold">{c.code}</p>
                      <p className="text-sm">{c.name || c.code}</p>
                    </div>
                    <Badge variant={c.isActive === false ? "secondary" : "default"} className="shrink-0 text-[10px]">
                      {c.isActive === false
                        ? t("crmCouponStatusInactive") || "비활성"
                        : t("crmCouponStatusActive") || "활성"}
                    </Badge>
                  </div>
                  <p className="text-xs tabular-nums">{formatCouponBenefit(c, t)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {(c.validFrom || "—") + " ~ " + (c.validTo || "—")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => openEdit(c)}>
                      {t("posEdit") || "수정"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs text-destructive" onClick={() => handleDelete(c)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminMobileOnly>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <SheetHeader className="shrink-0 space-y-2 border-b bg-muted/30 px-8 py-6 pr-14 text-left">
            <SheetTitle className="flex items-center gap-3 text-lg">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20">
                <Tag className="h-4 w-4" />
              </span>
              {editingId ? t("posCouponEdit") || "쿠폰 수정" : t("crmCouponNew") || "새 쿠폰"}
            </SheetTitle>
            <SheetDescription className="max-w-prose pl-[3.25rem] text-xs leading-relaxed">
              {t("crmCouponPosAppDesc") ||
                "회원 발급 쿠폰은 CRM 지급 → 회원앱 혜택 → POS 결제 시 자동 적용됩니다."}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <div className="space-y-5 pb-4">
              <CouponFormSection title={t("crmCouponSectionBasic") || "기본 정보"}>
                <CouponFormField label={t("posCouponCode") || "쿠폰 코드"}>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    disabled={!!editingId}
                    className="font-mono"
                    placeholder="WELCOME100"
                  />
                </CouponFormField>
                <CouponFormField label={t("posCouponName") || "쿠폰명"}>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("posCouponName") || "쿠폰명"}
                  />
                </CouponFormField>
              </CouponFormSection>

              <CouponFormSection title={t("crmCouponSectionDiscount") || "할인 · 기간"}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CouponFormField label={t("posCouponType") || "할인 유형"}>
                    <Select
                      value={form.discountType}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, discountType: v as CouponForm["discountType"] }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">{t("posCouponTypeFixed") || "정액"}</SelectItem>
                        <SelectItem value="percent">{t("posCouponTypePercent") || "정률"}</SelectItem>
                        <SelectItem value="bogo">{t("posCouponTypeBogo") || "1+1"}</SelectItem>
                        <SelectItem value="set_fixed">{t("posCouponTypeSetFixed") || "세트"}</SelectItem>
                        <SelectItem value="item_fixed">{t("posCouponTypeItemFixed") || "품목"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </CouponFormField>
                  <CouponFormField
                    label={
                      form.discountType === "percent"
                        ? t("posCouponDiscountPercentLabel") || "할인율 (%)"
                        : t("posCouponDiscountValueLabel") || "할인 값"
                    }
                  >
                    <Input
                      type="number"
                      value={form.discountValue}
                      onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                      disabled={form.discountType === "bogo"}
                    />
                  </CouponFormField>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CouponFormField label={t("posValidFrom") || "시작일"}>
                    <Input
                      type="date"
                      value={form.validFrom}
                      onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                    />
                  </CouponFormField>
                  <CouponFormField label={t("posValidTo") || "종료일"}>
                    <Input
                      type="date"
                      value={form.validTo}
                      onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
                    />
                  </CouponFormField>
                </div>
              </CouponFormSection>

              <CouponFormSection title={t("crmCouponPortalImage") || "회원앱 쿠폰 카드 이미지"}>
                <CouponFormField label={t("crmCouponPortalImage") || "회원앱 쿠폰 카드 이미지"}>
                  <Input
                    value={form.portalImageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, portalImageUrl: e.target.value }))}
                    placeholder={t("crmCouponPortalImageUrlPh") || "https://..."}
                  />
                </CouponFormField>
                <CrmImageUploadField
                  uploading={portalImageUploading}
                  onFile={handlePortalImageUpload}
                  hint={t("crmCouponPortalImageHint")}
                  error={portalImageError}
                  previewUrl={
                    form.portalImageUrl.trim()
                      ? withMemberPortalImageCacheBust(form.portalImageUrl.trim(), portalImagePreviewNonce)
                      : undefined
                  }
                  previewSlot={
                    form.portalImageUrl.trim() ? (
                      <img
                        src={withMemberPortalImageCacheBust(form.portalImageUrl.trim(), portalImagePreviewNonce)}
                        alt=""
                        className="mx-auto h-36 w-36 rounded-xl border object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : undefined
                  }
                />
                {form.portalImageUrl.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setForm((f) => ({ ...f, portalImageUrl: "" }))}
                  >
                    {t("crmCouponPortalImageClear") || "이미지 제거"}
                  </Button>
                ) : null}
                <div className="space-y-3 rounded-lg border border-dashed bg-muted/15 px-4 py-3">
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                      checked={form.portalVisible}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          portalVisible: e.target.checked,
                          portalClaimMode:
                            e.target.checked && f.portalClaimMode === "none" ? "free" : f.portalClaimMode,
                        }))
                      }
                    />
                    <span>{t("crmCouponPortalVisible") || "회원앱 혜택 탭 카탈로그에 노출"}</span>
                  </label>
                  {form.portalVisible ? (
                    <>
                      <CouponFormField label={t("crmCouponPortalClaimMode") || "수령 방식"}>
                        <Select
                          value={form.portalClaimMode}
                          onValueChange={(v) =>
                            setForm((f) => ({
                              ...f,
                              portalClaimMode: v as CouponForm["portalClaimMode"],
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">
                              {t("crmCouponPortalClaimFree") || "무료 받기"}
                            </SelectItem>
                            <SelectItem value="points">
                              {t("crmCouponPortalClaimPoints") || "포인트 교환"}
                            </SelectItem>
                            <SelectItem value="none">
                              {t("crmCouponPortalClaimNone") || "노출만 (직접 수령 불가)"}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </CouponFormField>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <CouponFormField label={t("crmCouponPortalPointCost") || "교환 포인트"}>
                          <Input
                            type="number"
                            min={0}
                            value={form.portalPointCost}
                            disabled={form.portalClaimMode !== "points"}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, portalPointCost: e.target.value }))
                            }
                          />
                        </CouponFormField>
                        <CouponFormField label={t("crmCouponPortalMaxClaims") || "1인 수령 한도"}>
                          <Input
                            type="number"
                            min={1}
                            value={form.portalMaxClaimsPerMember}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, portalMaxClaimsPerMember: e.target.value }))
                            }
                          />
                        </CouponFormField>
                      </div>
                      <CouponFormField label={t("crmCouponPortalSortOrder") || "목록 순서"}>
                        <Input
                          type="number"
                          value={form.portalSortOrder}
                          onChange={(e) => setForm((f) => ({ ...f, portalSortOrder: e.target.value }))}
                        />
                      </CouponFormField>
                    </>
                  ) : null}
                </div>
              </CouponFormSection>

              <CouponFormSection title={t("crmCouponSectionRules") || "사용 규칙"}>
                <CouponFormField label={t("posCouponRedemptionMode") || "사용 방식"}>
                  <Select
                    value={form.redemptionMode}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, redemptionMode: v as CouponForm["redemptionMode"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member_issue">
                        {t("posCouponModeMemberRecommended") || t("posCouponModeMember") || "회원 발급 (권장)"}
                      </SelectItem>
                      <SelectItem value="reusable_code">{t("posCouponModeReusable") || "공통 코드"}</SelectItem>
                      <SelectItem value="single_use_serial">{t("posCouponModeSerial") || "1회용 시리얼"}</SelectItem>
                    </SelectContent>
                  </Select>
                </CouponFormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CouponFormField label={t("posCouponMinOrder") || "최소 주문"}>
                    <Input
                      type="number"
                      min={0}
                      value={form.minOrderAmt}
                      onChange={(e) => setForm((f) => ({ ...f, minOrderAmt: e.target.value }))}
                    />
                  </CouponFormField>
                  <CouponFormField label={t("posCouponMaxPerOrder") || "주문당 장수"}>
                    <Input
                      type="number"
                      min={1}
                      value={form.maxPerOrder}
                      onChange={(e) => setForm((f) => ({ ...f, maxPerOrder: e.target.value }))}
                    />
                  </CouponFormField>
                </div>
                <CouponFormField label={t("posCouponStackMode") || "중복 규칙"}>
                  <Select
                    value={form.stackMode}
                    onValueChange={(v) => setForm((f) => ({ ...f, stackMode: v as CouponForm["stackMode"] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_only">{t("posCouponStackFixed") || "정액만"}</SelectItem>
                      <SelectItem value="percent_only">{t("posCouponStackPercent") || "정률만"}</SelectItem>
                      <SelectItem value="any">{t("posCouponStackAny") || "혼합"}</SelectItem>
                    </SelectContent>
                  </Select>
                </CouponFormField>
                <div className="space-y-2 rounded-lg border border-dashed bg-muted/20 px-4 py-3">
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                      checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    />
                    <span>{t("crmCouponActiveCheckbox") || "활성 (비활성 시 발급·사용 불가)"}</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                      checked={form.allowWithManualDiscount}
                      onChange={(e) => setForm((f) => ({ ...f, allowWithManualDiscount: e.target.checked }))}
                    />
                    <span>{t("crmCouponAllowManualDiscount") || "수동 할인과 동시 사용 허용"}</span>
                  </label>
                </div>
              </CouponFormSection>

              <CrmCouponMenuScopePicker value={itemScope} onChange={setItemScope} t={t} />
            </div>
          </div>

          <div className="shrink-0 border-t bg-background/95 px-8 py-5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={saving} className="min-w-[7.5rem]">
                <Save className="mr-2 h-4 w-4" />
                {saving ? t("loading") : t("itemsBtnSave") || "저장"}
              </Button>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>
                {t("posCancel") || "취소"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

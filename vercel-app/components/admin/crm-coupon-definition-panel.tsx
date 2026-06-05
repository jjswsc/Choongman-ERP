"use client"

import * as React from "react"
import { Plus, RotateCw, Save, Tag, Trash2 } from "lucide-react"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
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
import { formatCouponBenefit, redemptionModeLabel, sortCouponsForAdmin } from "@/lib/crm-coupon-admin"
import {
  buildItemScopePayload,
  emptyCouponItemScope,
  formatCouponItemScopeSummary,
  itemScopeFromCoupon,
  type CouponItemScope,
} from "@/lib/crm-coupon-item-scope"
import { CrmCouponMenuScopePicker } from "@/components/admin/crm-coupon-menu-scope-picker"
import { cn } from "@/lib/utils"

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
  }
}

export function CrmCouponDefinitionPanel() {
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
  const [search, setSearch] = React.useState("")

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
    setSheetOpen(true)
  }

  const openEdit = (c: PosCoupon) => {
    setEditingId(c.id ?? null)
    setForm(couponToForm(c))
    setItemScope(itemScopeFromCoupon(c))
    setSheetOpen(true)
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
      })
      if (!res.success) {
        await appAlert(res.message || t("posSaveFail") || "저장 실패")
        return
      }
      await appAlert(t("itemsAlertSaved") || "저장되었습니다.")
      setSheetOpen(false)
      await loadData()
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

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t("crmCouponSearchPh") || "코드·이름 검색"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={() => loadData()} disabled={loading}>
          <RotateCw className={cn("mr-1 h-4 w-4", loading && "animate-spin")} />
          {t("posRefresh") || "새로고침"}
        </Button>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" />
          {t("crmCouponNew") || "새 쿠폰"}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
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
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              {editingId ? t("posCouponEdit") || "쿠폰 수정" : t("crmCouponNew") || "새 쿠폰"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("posCouponCode") || "쿠폰 코드"}</label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                disabled={!!editingId}
                className="mt-1 font-mono"
                placeholder="WELCOME100"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("posCouponName") || "쿠폰명"}</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">{t("posCouponType") || "할인 유형"}</label>
                <Select
                  value={form.discountType}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, discountType: v as CouponForm["discountType"] }))
                  }
                >
                  <SelectTrigger className="mt-1">
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
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {form.discountType === "percent"
                    ? t("posCouponDiscountPercentLabel") || "할인율 (%)"
                    : t("posCouponDiscountValueLabel") || "할인 값"}
                </label>
                <Input
                  type="number"
                  value={form.discountValue}
                  onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                  className="mt-1"
                  disabled={form.discountType === "bogo"}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">{t("posValidFrom") || "시작일"}</label>
                <Input type="date" value={form.validFrom} onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("posValidTo") || "종료일"}</label>
                <Input type="date" value={form.validTo} onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("posCouponRedemptionMode") || "사용 방식"}</label>
              <Select
                value={form.redemptionMode}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, redemptionMode: v as CouponForm["redemptionMode"] }))
                }
              >
                <SelectTrigger className="mt-1">
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
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">{t("posCouponMinOrder") || "최소 주문"}</label>
                <Input type="number" min={0} value={form.minOrderAmt} onChange={(e) => setForm((f) => ({ ...f, minOrderAmt: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("posCouponMaxPerOrder") || "주문당 장수"}</label>
                <Input type="number" min={1} value={form.maxPerOrder} onChange={(e) => setForm((f) => ({ ...f, maxPerOrder: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("posCouponStackMode") || "중복 규칙"}</label>
              <Select value={form.stackMode} onValueChange={(v) => setForm((f) => ({ ...f, stackMode: v as CouponForm["stackMode"] }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_only">{t("posCouponStackFixed") || "정액만"}</SelectItem>
                  <SelectItem value="percent_only">{t("posCouponStackPercent") || "정률만"}</SelectItem>
                  <SelectItem value="any">{t("posCouponStackAny") || "혼합"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              {t("crmCouponActiveCheckbox") || "활성 (비활성 시 발급·사용 불가)"}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.allowWithManualDiscount}
                onChange={(e) => setForm((f) => ({ ...f, allowWithManualDiscount: e.target.checked }))}
              />
              {t("crmCouponAllowManualDiscount") || "수동 할인과 동시 사용 허용"}
            </label>
            <CrmCouponMenuScopePicker value={itemScope} onChange={setItemScope} t={t} />
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "..." : t("itemsBtnSave") || "저장"}
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

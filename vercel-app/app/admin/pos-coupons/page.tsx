"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { Tag, Save, Plus, Trash2, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPosCoupons,
  savePosCoupon,
  deletePosCoupon,
  type PosCoupon,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { canAccessPosMenus } from "@/lib/permissions"
import { cn } from "@/lib/utils"

export default function PosCouponsPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [coupons, setCoupons] = React.useState<PosCoupon[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [campaigns] = React.useState<{ id: string; topic: string }[]>([])
  const [form, setForm] = React.useState({
    code: "",
    name: "",
    discountType: "fixed" as "percent" | "fixed" | "bogo" | "set_fixed" | "item_fixed",
    discountValue: "",
    validFrom: "",
    validTo: "",
    marketingCampaignId: "" as string,
    minOrderAmt: "",
    maxPerOrder: "10",
    redemptionMode: "reusable_code" as "reusable_code" | "single_use_serial" | "member_issue",
    allowQuantityEntry: true,
    stackMode: "fixed_only" as "fixed_only" | "percent_only" | "any",
    maxUses: "",
    setQty: "2",
    itemScopeMenuIds: "",
    itemScopeCategoryCodes: "",
    priority: "0",
    allowWithManualDiscount: true,
  })

  const loadData = React.useCallback(() => {
    getPosCoupons()
      .then(setCoupons)
      .catch(() => setCoupons([]))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleNew = () => {
    setEditingId(null)
    setForm({
      code: "",
      name: "",
      discountType: "fixed",
      discountValue: "",
      validFrom: "",
      validTo: "",
      marketingCampaignId: "",
      minOrderAmt: "",
      maxPerOrder: "10",
      redemptionMode: "reusable_code",
      allowQuantityEntry: true,
      stackMode: "fixed_only",
      maxUses: "",
      setQty: "2",
      itemScopeMenuIds: "",
      itemScopeCategoryCodes: "",
      priority: "0",
      allowWithManualDiscount: true,
    })
  }

  const handleEdit = (c: PosCoupon) => {
    setEditingId(c.id != null ? c.id : null)
    setForm({
      code: c.code ?? "",
      name: c.name ?? "",
      discountType: (
        c.discountType === "percent" ||
        c.discountType === "bogo" ||
        c.discountType === "set_fixed" ||
        c.discountType === "item_fixed"
          ? c.discountType
          : "fixed"
      ) as "percent" | "fixed" | "bogo" | "set_fixed" | "item_fixed",
      discountValue: String(c.discountValue ?? 0),
      validFrom: c.validFrom ?? c.startDate ?? "",
      validTo: c.validTo ?? c.endDate ?? "",
      marketingCampaignId: (c as { marketingCampaignId?: string | null }).marketingCampaignId ?? "",
      minOrderAmt: String((c as { minOrderAmt?: number }).minOrderAmt ?? 0),
      maxPerOrder: String((c as { maxPerOrder?: number }).maxPerOrder ?? 10),
      redemptionMode: ((c as { redemptionMode?: string }).redemptionMode ?? "reusable_code") as
        | "reusable_code"
        | "single_use_serial"
        | "member_issue",
      allowQuantityEntry: (c as { allowQuantityEntry?: boolean }).allowQuantityEntry !== false,
      stackMode: ((c as { stackMode?: string }).stackMode ?? "fixed_only") as
        | "fixed_only"
        | "percent_only"
        | "any",
      maxUses: (c as { maxUses?: number | null }).maxUses != null ? String((c as { maxUses?: number }).maxUses) : "",
      setQty: String((c as { setQty?: number | null }).setQty ?? 2),
      itemScopeMenuIds: Array.isArray((c as { itemScope?: { menuIds?: string[] } }).itemScope?.menuIds)
        ? ((c as { itemScope?: { menuIds?: string[] } }).itemScope?.menuIds || []).join(", ")
        : "",
      itemScopeCategoryCodes: Array.isArray((c as { itemScope?: { categoryCodes?: string[] } }).itemScope?.categoryCodes)
        ? ((c as { itemScope?: { categoryCodes?: string[] } }).itemScope?.categoryCodes || []).join(", ")
        : "",
      priority: String((c as { priority?: number }).priority ?? 0),
      allowWithManualDiscount: (c as { allowWithManualDiscount?: boolean }).allowWithManualDiscount !== false,
    })
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
        marketingCampaignId: form.marketingCampaignId || null,
        minOrderAmt: Math.max(0, Number(form.minOrderAmt || 0)),
        maxPerOrder: Math.max(1, Math.trunc(Number(form.maxPerOrder || 10))),
        redemptionMode: form.redemptionMode,
        allowQuantityEntry: form.allowQuantityEntry,
        stackMode: form.stackMode,
        maxUses: form.maxUses.trim() ? Math.max(1, Math.trunc(Number(form.maxUses))) : null,
        setQty: form.setQty.trim() ? Math.max(2, Math.trunc(Number(form.setQty))) : undefined,
        itemScope: {
          menuIds: form.itemScopeMenuIds
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          categoryCodes: form.itemScopeCategoryCodes
            .split(",")
            .map((x) => x.trim().toUpperCase())
            .filter(Boolean),
        },
        priority: Math.max(-100, Math.min(100, Math.trunc(Number(form.priority || 0)))),
        allowWithManualDiscount: form.allowWithManualDiscount,
      })
      if (res.success) {
        await appAlert(t("itemsAlertSaved") || "저장되었습니다.")
        loadData()
        handleNew()
      } else {
        await appAlert(res.message)
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: PosCoupon) => {
    if (c.id == null) return
    if (!await appConfirm(`${c.code} ${t("posMenuConfirmDelete") || "삭제하시겠습니까?"}`)) return
    const res = await deletePosCoupon({ id: c.id })
    if (res.success) {
      loadData()
      if (editingId === c.id) handleNew()
    } else {
      await appAlert(res.message)
    }
  }

  if (!canAccessPosMenus(auth?.role || "")) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground">{t("noPermission") || "접근 권한이 없습니다."}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("adminPosCoupons") || "POS 쿠폰"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posCouponSub") || "주문 시 쿠폰 코드 입력으로 할인 적용"}
            </p>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={loadData} disabled={loading}>
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t("posRefresh") || "새로고침"}
          </Button>
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={handleNew}>
            <Plus className="h-4 w-4" />
            {t("posCouponAdd") || "쿠폰 추가"}
          </Button>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        <div className="space-y-4">
          {(editingId !== null || form.code) && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">
                {editingId ? t("posCouponEdit") || "쿠폰 수정" : t("posCouponAdd") || "쿠폰 추가"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">{t("posCouponCode") || "쿠폰 코드"}</label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="SUMMER10"
                    className="mt-1"
                    disabled={!!editingId}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("posCouponName") || "쿠폰명"}</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("posCouponNamePh") || "선택"}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("posCouponType") || "할인 유형"}</label>
                  <Select
                    value={form.discountType}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        discountType: v as "percent" | "fixed" | "bogo" | "set_fixed" | "item_fixed",
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">fixed (정액)</SelectItem>
                      <SelectItem value="percent">percent (정률)</SelectItem>
                      <SelectItem value="bogo">bogo (1+1)</SelectItem>
                      <SelectItem value="set_fixed">set_fixed (세트)</SelectItem>
                      <SelectItem value="item_fixed">item_fixed (품목당)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    {form.discountType === "percent"
                      ? t("posDiscountRate") || "할인율 (%)"
                      : form.discountType === "bogo"
                        ? "BOGO 규칙 (금액 자동 계산)"
                        : t("posDiscountAmt") || "할인 금액 (฿)"}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={form.discountType === "percent" ? 100 : undefined}
                    value={form.discountValue}
                    onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                    className="mt-1"
                    disabled={form.discountType === "bogo"}
                  />
                </div>
                {form.discountType === "set_fixed" ? (
                  <div>
                    <label className="text-xs text-muted-foreground">세트 수량 기준</label>
                    <Input
                      type="number"
                      min={2}
                      value={form.setQty}
                      onChange={(e) => setForm((f) => ({ ...f, setQty: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                ) : null}
                <div>
                  <label className="text-xs text-muted-foreground">{t("posValidFrom") || "유효 기간 시작"}</label>
                  <Input
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("posValidTo") || "유효 기간 종료"}</label>
                  <Input
                    type="date"
                    value={form.validTo}
                    onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">마케팅 캠페인</label>
                  <Select value={form.marketingCampaignId || "_"} onValueChange={(v) => setForm((f) => ({ ...f, marketingCampaignId: v === "_" ? "" : v }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">없음</SelectItem>
                      {campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.topic}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("posCouponMinOrder") || "최소 주문(฿)"}</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.minOrderAmt}
                    onChange={(e) => setForm((f) => ({ ...f, minOrderAmt: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("posCouponMaxPerOrder") || "주문당 최대 장수"}</label>
                  <Input
                    type="number"
                    min={1}
                    value={form.maxPerOrder}
                    onChange={(e) => setForm((f) => ({ ...f, maxPerOrder: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("posCouponRedemptionMode") || "사용 방식"}</label>
                  <Select
                    value={form.redemptionMode}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        redemptionMode: v as "reusable_code" | "single_use_serial" | "member_issue",
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reusable_code">{t("posCouponModeReusable") || "재사용 코드"}</SelectItem>
                      <SelectItem value="single_use_serial">{t("posCouponModeSerial") || "1회용 시리얼"}</SelectItem>
                      <SelectItem value="member_issue">{t("posCouponModeMember") || "회원 발급"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("posCouponStackMode") || "중복 규칙"}</label>
                  <Select
                    value={form.stackMode}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        stackMode: v as "fixed_only" | "percent_only" | "any",
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_only">{t("posCouponStackFixed") || "고정액만 중복"}</SelectItem>
                      <SelectItem value="percent_only">{t("posCouponStackPercent") || "퍼센트만 중복"}</SelectItem>
                      <SelectItem value="any">{t("posCouponStackAny") || "혼합 허용"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.allowQuantityEntry}
                      onChange={(e) => setForm((f) => ({ ...f, allowQuantityEntry: e.target.checked }))}
                    />
                    {t("posCouponAllowQuantity") || "수량 입력 허용"}
                  </label>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("posCouponMaxUses") || "전체 사용 한도"}</label>
                  <Input
                    type="number"
                    min={1}
                    value={form.maxUses}
                    onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                    className="mt-1"
                    placeholder={t("posOptional") || "선택"}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">대상 메뉴 ID (쉼표 구분)</label>
                  <Input
                    value={form.itemScopeMenuIds}
                    onChange={(e) => setForm((f) => ({ ...f, itemScopeMenuIds: e.target.value }))}
                    className="mt-1"
                    placeholder="101, 102, 205"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">대상 카테고리 코드 (쉼표 구분)</label>
                  <Input
                    value={form.itemScopeCategoryCodes}
                    onChange={(e) => setForm((f) => ({ ...f, itemScopeCategoryCodes: e.target.value }))}
                    className="mt-1"
                    placeholder="CHICKEN, SIDE, DRINK"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">우선순위 (높을수록 먼저)</label>
                  <Input
                    type="number"
                    min={-100}
                    max={100}
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.allowWithManualDiscount}
                      onChange={(e) => setForm((f) => ({ ...f, allowWithManualDiscount: e.target.checked }))}
                    />
                    수동할인과 동시 사용 허용
                  </label>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "..." : t("itemsBtnSave") || "저장"}
                </Button>
                <Button variant="outline" onClick={handleNew}>
                  {t("posCancel") || "취소"}
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card">
            <h3 className="border-b px-4 py-3 text-sm font-semibold">{t("posCouponList") || "쿠폰 목록"}</h3>
            <div className="divide-y">
              {coupons.length === 0 && !loading && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("posCouponEmpty") || "등록된 쿠폰이 없습니다."}
                </p>
              )}
              {coupons.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center justify-between px-4 py-3",
                    editingId === c.id && "bg-primary/5"
                  )}
                >
                  <div>
                    <span className="font-mono font-bold">{c.code}</span>
                    {c.name && c.name !== c.code && (
                      <span className="ml-2 text-sm text-muted-foreground">{c.name}</span>
                    )}
                    <span className="ml-2 text-sm">
                      {c.discountType === "percent"
                        ? `${c.discountValue}%`
                        : `${c.discountValue} ฿`}
                    </span>
                    {(c.validFrom || c.validTo) && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.validFrom || "~"} ~ {c.validTo || "~"}
                      </span>
                    )}
                    {(c as { maxPerOrder?: number }).maxPerOrder != null &&
                      Number((c as { maxPerOrder?: number }).maxPerOrder) > 1 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          max {(c as { maxPerOrder?: number }).maxPerOrder}
                        </span>
                      )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(c)}>
                      {t("posEdit") || "수정"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(c)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

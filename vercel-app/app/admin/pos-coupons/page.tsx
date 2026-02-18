"use client"

import * as React from "react"
import { Tag, Save, Plus, Trash2, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPosCoupons,
  savePosCoupon,
  deletePosCoupon,
  type PosCoupon,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { canAccessPosCoupons } from "@/lib/permissions"
import { cn } from "@/lib/utils"

export default function PosCouponsPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [coupons, setCoupons] = React.useState<PosCoupon[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [form, setForm] = React.useState({
    code: "",
    name: "",
    discountType: "fixed" as "percent" | "fixed",
    discountValue: "",
    validFrom: "",
    validTo: "",
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
    })
  }

  const handleEdit = (c: PosCoupon) => {
    setEditingId(c.id)
    setForm({
      code: c.code,
      name: c.name,
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      validFrom: c.validFrom || "",
      validTo: c.validTo || "",
    })
  }

  const handleSave = async () => {
    const code = form.code.trim().toUpperCase()
    const val = Number(form.discountValue) || 0
    if (!code) {
      alert(t("posCouponCodeRequired") || "쿠폰 코드를 입력하세요.")
      return
    }
    if (form.discountType === "percent" && (val < 1 || val > 100)) {
      alert(t("posCouponPercentRange") || "할인율은 1~100입니다.")
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
      })
      if (res.success) {
        alert(t("itemsAlertSaved") || "저장되었습니다.")
        loadData()
        handleNew()
      } else {
        alert(res.message)
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: PosCoupon) => {
    if (!confirm(`${c.code} ${t("posMenuConfirmDelete") || "삭제하시겠습니까?"}`)) return
    const res = await deletePosCoupon({ id: c.id })
    if (res.success) {
      loadData()
      if (editingId === c.id) handleNew()
    } else {
      alert(res.message)
    }
  }

  if (!canAccessPosCoupons(auth?.role || "")) {
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
                  <div className="mt-1 flex gap-2">
                    <Button
                      type="button"
                      variant={form.discountType === "fixed" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, discountType: "fixed" }))}
                    >
                      ฿ {t("posFixed") || "고정"}
                    </Button>
                    <Button
                      type="button"
                      variant={form.discountType === "percent" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, discountType: "percent" }))}
                    >
                      % {t("posPercent") || "퍼센트"}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    {form.discountType === "percent"
                      ? t("posDiscountRate") || "할인율 (%)"
                      : t("posDiscountAmt") || "할인 금액 (฿)"}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={form.discountType === "percent" ? 100 : undefined}
                    value={form.discountValue}
                    onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                    className="mt-1"
                  />
                </div>
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

"use client"

import * as React from "react"
import { Tag, Plus, Save, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getPosCoupons, savePosCoupon, deletePosCoupon, type PosCoupon } from "@/lib/api-client"
import { cn } from "@/lib/utils"

const emptyForm = {
  code: "",
  name: "",
  discountType: "amount" as const,
  discountValue: "",
  startDate: "",
  endDate: "",
  maxUses: "",
  isActive: true,
}

export default function PosCouponsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [coupons, setCoupons] = React.useState<PosCoupon[]>([])
  const [loading, setLoading] = React.useState(true)
  const [formData, setFormData] = React.useState(emptyForm)
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [saving, setSaving] = React.useState(false)

  const loadCoupons = React.useCallback(() => {
    setLoading(true)
    getPosCoupons()
      .then(setCoupons)
      .catch(() => setCoupons([]))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    loadCoupons()
  }, [loadCoupons])

  const handleNew = () => {
    setFormData(emptyForm)
    setEditingId(null)
  }

  const handleEdit = (c: PosCoupon) => {
    setFormData({
      code: c.code,
      name: c.name || "",
      discountType: c.discountType || "amount",
      discountValue: String(c.discountValue ?? 0),
      startDate: c.startDate || "",
      endDate: c.endDate || "",
      maxUses: c.maxUses != null ? String(c.maxUses) : "",
      isActive: c.isActive !== false,
    })
    setEditingId(c.id ?? null)
  }

  const handleSave = async () => {
    const code = formData.code.trim().toUpperCase()
    if (!code) {
      alert(t("posCouponCodeRequired") || "쿠폰 코드를 입력하세요.")
      return
    }
    const val = Number(formData.discountValue) ?? 0
    if (val <= 0) {
      alert(t("posCouponValueRequired") || "할인 값을 입력하세요.")
      return
    }
    setSaving(true)
    try {
      const res = await savePosCoupon({
        id: editingId ?? undefined,
        code,
        name: formData.name.trim() || code,
        discountType: formData.discountType,
        discountValue: val,
        startDate: formData.startDate.trim() || null,
        endDate: formData.endDate.trim() || null,
        maxUses: formData.maxUses.trim() ? Number(formData.maxUses) : null,
        isActive: formData.isActive,
      })
      if (res.success) {
        alert(t("itemsAlertSaved") || "저장되었습니다.")
        loadCoupons()
        handleNew()
      } else {
        alert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: PosCoupon) => {
    if (!confirm(`"${c.code}" ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosCoupon({ id: c.id! })
    if (res.success) {
      loadCoupons()
      if (editingId === c.id) handleNew()
      alert(t("itemsAlertDeleted"))
    } else {
      alert(res.message)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("posCouponMgmt") || "쿠폰 관리"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posCouponMgmtSub") || "POS 주문 시 적용할 쿠폰을 등록합니다."}
            </p>
          </div>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="mb-4 text-sm font-bold">{t("posCouponForm") || "쿠폰 등록"}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium">{t("posCouponCode") || "코드"}</label>
                <Input
                  placeholder="WELCOME10"
                  className="mt-1 h-10 uppercase"
                  value={formData.code}
                  onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  disabled={!!editingId}
                />
              </div>
              <div>
                <label className="text-xs font-medium">{t("posCouponName") || "이름"}</label>
                <Input
                  placeholder={t("posCouponNamePh") || "웰컴 할인"}
                  className="mt-1 h-10"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium">{t("posCouponType") || "할인 유형"}</label>
                <Select
                  value={formData.discountType}
                  onValueChange={(v: "percent" | "amount") =>
                    setFormData((p) => ({ ...p, discountType: v }))
                  }
                >
                  <SelectTrigger className="mt-1 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">{t("posCouponAmount") || "금액 (฿)"}</SelectItem>
                    <SelectItem value="percent">{t("posCouponPercent") || "비율 (%)"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">{t("posCouponValue") || "할인 값"}</label>
                <Input
                  type="number"
                  placeholder={formData.discountType === "percent" ? "10" : "50"}
                  className="mt-1 h-10"
                  value={formData.discountValue}
                  onChange={(e) => setFormData((p) => ({ ...p, discountValue: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium">{t("posCouponStart") || "시작일"}</label>
                  <Input
                    type="date"
                    className="mt-1 h-10"
                    value={formData.startDate}
                    onChange={(e) => setFormData((p) => ({ ...p, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("posCouponEnd") || "종료일"}</label>
                  <Input
                    type="date"
                    className="mt-1 h-10"
                    value={formData.endDate}
                    onChange={(e) => setFormData((p) => ({ ...p, endDate: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">{t("posCouponMaxUses") || "최대 사용 횟수"}</label>
                <Input
                  type="number"
                  placeholder={t("posCouponUnlimited") || "무제한"}
                  className="mt-1 h-10"
                  value={formData.maxUses}
                  onChange={(e) => setFormData((p) => ({ ...p, maxUses: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))}
                />
                {t("posMenuActive") || "활성"}
              </label>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={handleSave} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {t("itemsBtnSave")}
                </Button>
                <Button variant="outline" onClick={handleNew}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("itemsBtnNewRegister")}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="border-b px-6 py-4">
              <h3 className="text-sm font-bold">{t("itemsList") || "목록"}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">코드</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[100px]">이름</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">할인</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">기간</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-16">사용</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-16">상태</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                        {t("itemsNoResults")}
                      </td>
                    </tr>
                  ) : (
                    coupons.map((c) => (
                      <tr
                        key={c.id}
                        className={cn(
                          "border-b hover:bg-muted/20",
                          !c.isActive && "opacity-60"
                        )}
                      >
                        <td className="px-5 py-3 font-mono text-xs">{c.code}</td>
                        <td className="px-5 py-3">{c.name || "-"}</td>
                        <td className="px-5 py-3 text-right">
                          {c.discountType === "percent"
                            ? `${c.discountValue}%`
                            : `${c.discountValue} ฿`}
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {c.startDate || "-"} ~ {c.endDate || "-"}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {c.maxUses != null ? `${c.usedCount}/${c.maxUses}` : c.usedCount}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {c.isActive ? (
                            <span className="text-[10px] text-green-600">Y</span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">N</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => handleEdit(c)}
                            >
                              <Pencil className="mr-1 h-2.5 w-2.5" />
                              {t("itemsBtnEdit")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px] text-destructive"
                              onClick={() => handleDelete(c)}
                            >
                              <Trash2 className="mr-1 h-2.5 w-2.5" />
                              {t("itemsBtnDelete")}
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
        </div>
      </div>
    </div>
  )
}

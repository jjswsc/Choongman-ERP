"use client"

import * as React from "react"
import { KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { apiFetch } from "@/lib/api/fetch"
import { getPosCoupons, type PosCoupon } from "@/lib/api-client"
import { couponsForMemberIssue, formatCouponBenefit, type CrmPromoCodePrefill } from "@/lib/crm-coupon-admin"
import type { MemberCouponPromoCodeRow } from "@/lib/member-portal-promo-code"

type FormState = {
  id: number | null
  code: string
  couponCode: string
  label: string
  note: string
  isActive: boolean
  validFrom: string
  validTo: string
  maxRedemptions: string
  maxPerMember: string
}

const EMPTY_FORM: FormState = {
  id: null,
  code: "",
  couponCode: "",
  label: "",
  note: "",
  isActive: true,
  validFrom: "",
  validTo: "",
  maxRedemptions: "",
  maxPerMember: "1",
}

export function CrmCouponPromoCodePanel({
  prefill,
  onPrefillConsumed,
}: {
  prefill?: CrmPromoCodePrefill | null
  onPrefillConsumed?: () => void
} = {}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [rows, setRows] = React.useState<MemberCouponPromoCodeRow[]>([])
  const [coupons, setCoupons] = React.useState<PosCoupon[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [promoRes, couponRows] = await Promise.all([
        apiFetch("/api/crm/coupon-promo-codes?limit=200", { cache: "no-store" }).then(
          (r) => r.json() as Promise<{ success?: boolean; rows?: MemberCouponPromoCodeRow[]; message?: string }>
        ),
        getPosCoupons().catch(() => [] as PosCoupon[]),
      ])
      setCoupons(couponsForMemberIssue(couponRows || []))
      if (promoRes.success) setRows(promoRes.rows || [])
      else {
        setRows([])
        if (promoRes.message) void appAlert(promoRes.message)
      }
    } catch (e) {
      setRows([])
      void appAlert(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!prefill?.code && !prefill?.couponCode) return
    const code = String(prefill.code || prefill.couponCode || "")
      .trim()
      .toUpperCase()
    const couponCode = String(prefill.couponCode || prefill.code || "")
      .trim()
      .toUpperCase()
    setForm({
      id: null,
      code,
      couponCode,
      label: String(prefill.label || "").trim() || code,
      note: "",
      isActive: true,
      validFrom: String(prefill.validFrom || "").trim(),
      validTo: String(prefill.validTo || "").trim(),
      maxRedemptions: "",
      maxPerMember: "1",
    })
    onPrefillConsumed?.()
  }, [prefill, onPrefillConsumed])

  const startEdit = (row: MemberCouponPromoCodeRow) => {
    setForm({
      id: row.id,
      code: row.code,
      couponCode: row.couponCode,
      label: row.label,
      note: row.note,
      isActive: row.isActive,
      validFrom: row.validFrom,
      validTo: row.validTo,
      maxRedemptions: row.maxRedemptions == null ? "" : String(row.maxRedemptions),
      maxPerMember: String(row.maxPerMember || 1),
    })
  }

  const resetForm = () => setForm(EMPTY_FORM)

  const save = async () => {
    const code = form.code.trim()
    const couponCode = form.couponCode.trim()
    if (!code) {
      void appAlert(t("crmPromoCodeCodeRequired") || "프로모 코드를 입력해 주세요.")
      return
    }
    if (!couponCode) {
      void appAlert(t("crmPromoCodeCouponRequired") || "연결할 쿠폰을 선택해 주세요.")
      return
    }
    setSaving(true)
    try {
      const body = {
        id: form.id || undefined,
        code,
        couponCode,
        label: form.label.trim(),
        note: form.note.trim(),
        isActive: form.isActive,
        validFrom: form.validFrom.trim(),
        validTo: form.validTo.trim(),
        maxRedemptions: form.maxRedemptions.trim() === "" ? null : Number(form.maxRedemptions),
        maxPerMember: Math.max(1, Number(form.maxPerMember || 1)),
      }
      const url = form.id
        ? `/api/crm/coupon-promo-codes/${form.id}`
        : "/api/crm/coupon-promo-codes"
      const res = await apiFetch(url, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { success?: boolean; message?: string }
      if (!data.success) {
        void appAlert(data.message || "저장에 실패했습니다.")
        return
      }
      resetForm()
      await load()
    } catch (e) {
      void appAlert(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: MemberCouponPromoCodeRow) => {
    try {
      const res = await apiFetch(`/api/crm/coupon-promo-codes/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      })
      const data = (await res.json()) as { success?: boolean; message?: string }
      if (!data.success) {
        void appAlert(data.message || "상태 변경에 실패했습니다.")
        return
      }
      await load()
    } catch (e) {
      void appAlert(e instanceof Error ? e.message : "상태 변경 중 오류가 발생했습니다.")
    }
  }

  const remove = async (row: MemberCouponPromoCodeRow) => {
    const ok = await appConfirm(
      (t("crmPromoCodeDeleteConfirm") || "프로모 코드「{code}」를 삭제할까요?").replace(
        "{code}",
        row.code
      )
    )
    if (!ok) return
    try {
      const res = await apiFetch(`/api/crm/coupon-promo-codes/${row.id}`, { method: "DELETE" })
      const data = (await res.json()) as { success?: boolean; message?: string }
      if (!data.success) {
        void appAlert(data.message || "삭제에 실패했습니다.")
        return
      }
      if (form.id === row.id) resetForm()
      await load()
    } catch (e) {
      void appAlert(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.")
    }
  }

  const couponLabel = (code: string) => {
    const c = coupons.find((x) => x.code === code)
    if (!c) return code
    return `${c.code} · ${c.name || ""} (${formatCouponBenefit(c, t)})`
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">{t("crmPromoCodeIntroTitle") || "회원앱 시크릿 코드"}</p>
        <p className="mt-1 text-amber-900/80">
          {t("crmPromoCodeIntroBody") ||
            "회원이 /m 혜택 탭에서 코드를 입력하면 「회원 발급」 쿠폰이 지갑에 들어갑니다. POS 공통 재사용 코드와는 별개입니다. 시크릿 전용은 쿠폰 정의에서 회원앱 카탈로그 노출을 끄세요."}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          {form.id ? <Pencil className="h-4 w-4 text-muted-foreground" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
          <h2 className="text-sm font-semibold">
            {form.id
              ? t("crmPromoCodeEdit") || "프로모 코드 수정"
              : t("crmPromoCodeCreate") || "프로모 코드 등록"}
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("crmPromoCodeCode") || "시크릿 코드"}</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="1234"
              className="font-mono tracking-wide"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
            <Label>{t("crmPromoCodeCoupon") || "연결 쿠폰 (회원 발급)"}</Label>
            <Select
              value={form.couponCode || undefined}
              onValueChange={(v) => setForm((f) => ({ ...f, couponCode: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("crmPromoCodeCouponPh") || "쿠폰 선택"} />
              </SelectTrigger>
              <SelectContent>
                {coupons.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} · {c.name || "-"} ({formatCouponBenefit(c, t)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("crmPromoCodeLabel") || "표시 이름 (관리용)"}</Label>
            <Input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder={t("crmPromoCodeLabelPh") || "예: 7월 LINE 시크릿"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("crmPromoCodeValidFrom") || "코드 시작일"}</Label>
            <Input
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("crmPromoCodeValidTo") || "코드 종료일"}</Label>
            <Input
              type="date"
              value={form.validTo}
              onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("crmPromoCodeMaxTotal") || "전체 한도 (비우면 무제한)"}</Label>
            <Input
              type="number"
              min={1}
              value={form.maxRedemptions}
              onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
              placeholder="500"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("crmPromoCodeMaxPerMember") || "회원당 한도"}</Label>
            <Input
              type="number"
              min={1}
              value={form.maxPerMember}
              onChange={(e) => setForm((f) => ({ ...f, maxPerMember: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Checkbox
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v === true }))}
              id="promo-active"
            />
            <Label htmlFor="promo-active">{t("crmPromoCodeActive") || "활성"}</Label>
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>{t("crmPromoCodeNote") || "메모"}</Label>
            <Input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("save") || "저장"}
          </Button>
          {form.id ? (
            <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
              {t("crmPromoCodeCancelEdit") || "신규 등록으로"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{t("crmPromoCodeList") || "등록된 프로모 코드"}</h2>
            <Badge variant="secondary">{rows.length}</Badge>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("refresh") || "새로고침"}
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loading") || "불러오는 중…"}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("crmPromoCodeEmpty") || "등록된 프로모 코드가 없습니다."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("crmPromoCodeCode") || "코드"}</th>
                  <th className="px-3 py-2 font-medium">{t("crmPromoCodeCoupon") || "쿠폰"}</th>
                  <th className="px-3 py-2 font-medium">{t("crmPromoCodePeriod") || "기간"}</th>
                  <th className="px-3 py-2 font-medium">{t("crmPromoCodeUsage") || "사용"}</th>
                  <th className="px-3 py-2 font-medium">{t("crmPromoCodeActive") || "활성"}</th>
                  <th className="px-3 py-2 font-medium text-right">{t("actions") || "작업"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-sm font-semibold tracking-wide">{row.code}</div>
                      {row.label ? (
                        <div className="text-xs text-muted-foreground">{row.label}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{couponLabel(row.couponCode)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                      {(row.validFrom || "—") + " ~ " + (row.validTo || "—")}
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">
                      {row.redemptionCount}
                      {row.maxRedemptions != null ? ` / ${row.maxRedemptions}` : ""}
                      <span className="text-muted-foreground">
                        {" "}
                        (≤{row.maxPerMember}/{t("crmPromoCodePerMemberShort") || "인"})
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={row.isActive}
                        onCheckedChange={() => void toggleActive(row)}
                        aria-label={t("crmPromoCodeActive") || "활성"}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button type="button" variant="ghost" size="icon" onClick={() => startEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => void remove(row)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

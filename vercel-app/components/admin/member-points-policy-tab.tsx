"use client"

import * as React from "react"
import { appAlert } from "@/lib/app-message"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MemberTierBenefitsPreview } from "@/components/admin/member-tier-benefits-preview"
import { MemberTierDiscountScopeForm } from "@/components/admin/member-tier-discount-scope-form"
import { CrmTierLadder } from "@/components/crm/crm-tier-ladder"
import { getMemberTierPolicy, getMemberTiers, recalculateMemberTier, saveMemberTier, saveMemberTierPolicy } from "@/lib/api-client"
import type { MemberPortalLang } from "@/lib/member-tier-public"
import {
  DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY,
  type MemberPointEarnBonusPolicy,
} from "@/lib/member-point-earn-policy"
import {
  DEFAULT_MEMBER_TIER_DISCOUNT_POLICY,
  type MemberTierDiscountPolicy,
} from "@/lib/member-tier-discount-policy"
import { useLang } from "@/lib/lang-context"
import { useT, tr } from "@/lib/i18n"
import {
  formatTierRatePercentInput,
  parseTierRatePercentInput,
} from "@/lib/member-tier-rate-percent"

type TierRow = {
  code: string
  name: string
  min_amount: number
  min_points: number
  point_rate: number
  discount_rate: number
  sort_order: number
  benefits_ko?: string | null
  benefits_en?: string | null
  benefits_th?: string | null
}

function emptyForm(): Omit<TierRow, "code"> & { code: string } {
  return {
    code: "BRONZE",
    name: "Bronze",
    min_amount: 0,
    min_points: 0,
    point_rate: 0.01,
    discount_rate: 0,
    sort_order: 1,
    benefits_ko: "",
    benefits_en: "",
    benefits_th: "",
  }
}

export function MemberPointsPolicyTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const [rows, setRows] = React.useState<TierRow[]>([])
  const [form, setForm] = React.useState(emptyForm())
  const [saving, setSaving] = React.useState(false)
  const [upgradeBasis, setUpgradeBasis] = React.useState<"amount" | "points">("points")
  const [policySaving, setPolicySaving] = React.useState(false)
  const [earnBonus, setEarnBonus] = React.useState<MemberPointEarnBonusPolicy>(
    DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY
  )
  const [earnBonusSaving, setEarnBonusSaving] = React.useState(false)
  const [rowSavingCode, setRowSavingCode] = React.useState("")
  const [pointRetentionYears, setPointRetentionYears] = React.useState(2)
  const [pointRetentionSaving, setPointRetentionSaving] = React.useState(false)
  const [tierDiscountPolicy, setTierDiscountPolicy] = React.useState<MemberTierDiscountPolicy>(
    DEFAULT_MEMBER_TIER_DISCOUNT_POLICY
  )
  const [tierDiscountPolicySaving, setTierDiscountPolicySaving] = React.useState(false)

  const load = React.useCallback(async () => {
    const [tiers, policy] = await Promise.all([getMemberTiers(), getMemberTierPolicy()])
    setRows(tiers as TierRow[])
    if (policy.upgradeBasis === "amount" || policy.upgradeBasis === "points") {
      setUpgradeBasis(policy.upgradeBasis)
    }
    if (typeof policy.pointRetentionYears === "number" && policy.pointRetentionYears > 0) {
      setPointRetentionYears(policy.pointRetentionYears)
    }
    if (policy.earnBonus) {
      setEarnBonus({
        ...DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY,
        ...policy.earnBonus,
        channelMultipliers: {
          ...DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY.channelMultipliers,
          ...policy.earnBonus.channelMultipliers,
        },
        birthday: {
          ...DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY.birthday,
          ...policy.earnBonus.birthday,
        },
        periodPromo: {
          ...DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY.periodPromo,
          ...policy.earnBonus.periodPromo,
        },
      })
    }
    if (policy.tierDiscountPolicy) {
      setTierDiscountPolicy({
        ...DEFAULT_MEMBER_TIER_DISCOUNT_POLICY,
        ...policy.tierDiscountPolicy,
        scopeMainCategories: [...(policy.tierDiscountPolicy.scopeMainCategories || [])],
        scopeCategoryKeys: [...(policy.tierDiscountPolicy.scopeCategoryKeys || [])],
        scopeMenuIds: [...(policy.tierDiscountPolicy.scopeMenuIds || [])],
      })
    }
  }, [])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  const applyRow = React.useCallback((r: TierRow) => {
    setForm({
      code: r.code,
      name: r.name,
      min_amount: Number(r.min_amount || 0),
      min_points: Number(r.min_points || 0),
      point_rate: Number(r.point_rate || 0),
      discount_rate: Number(r.discount_rate || 0),
      sort_order: Number(r.sort_order || 0),
      benefits_ko: String(r.benefits_ko || ""),
      benefits_en: String(r.benefits_en || ""),
      benefits_th: String(r.benefits_th || ""),
    })
  }, [])

  const saveTier = React.useCallback(async () => {
    setSaving(true)
    try {
      const res = await saveMemberTier({
        code: form.code.trim(),
        name: form.name.trim(),
        minAmount: Number(form.min_amount || 0),
        minPoints: Number(form.min_points || 0),
        pointRate: Number(form.point_rate || 0),
        discountRate: Number(form.discount_rate || 0),
        sortOrder: Number(form.sort_order || 0),
        benefitsKo: String(form.benefits_ko || ""),
        benefitsEn: String(form.benefits_en || ""),
        benefitsTh: String(form.benefits_th || ""),
      })
      if (!res.success) await appAlert(res.message || t("msg_save_fail"))
      await load()
    } finally {
      setSaving(false)
    }
  }, [form, load, t])

  const patchRow = React.useCallback((code: string, patch: Partial<TierRow>) => {
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, ...patch } : r)))
    if (form.code === code) {
      setForm((prev) => ({ ...prev, ...patch }))
    }
  }, [form.code])

  const saveRowTier = React.useCallback(
    async (row: TierRow) => {
      setRowSavingCode(row.code)
      try {
        const res = await saveMemberTier({
          code: row.code.trim(),
          name: row.name.trim(),
          minAmount: Number(row.min_amount || 0),
          minPoints: Number(row.min_points || 0),
          pointRate: Number(row.point_rate || 0),
          discountRate: Number(row.discount_rate || 0),
          sortOrder: Number(row.sort_order || 0),
          benefitsKo: String(row.benefits_ko || ""),
          benefitsEn: String(row.benefits_en || ""),
          benefitsTh: String(row.benefits_th || ""),
        })
        if (!res.success) await appAlert(res.message || t("msg_save_fail"))
        else await appAlert(t("msg_saved"))
        await load()
      } finally {
        setRowSavingCode("")
      }
    },
    [load, t]
  )

  const previewLangDefault: MemberPortalLang = lang === "ko" ? "ko" : lang === "th" ? "th" : "en"

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("memberPointsEarnHint")}</p>
      <p className="text-sm text-muted-foreground">{t("memberTierLineHint")}</p>
      <CrmTierLadder rows={rows} upgradeBasis={upgradeBasis} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("memberTierUpgradeBasisTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("memberTierUpgradeBasisDesc")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {(["points", "amount"] as const).map((value) => {
              const active = upgradeBasis === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setUpgradeBasis(value)}
                  className={`rounded-lg border px-4 py-3 text-left text-sm transition ${
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                  }`}
                >
                  <p className="font-medium">
                    {value === "points" ? t("memberTierUpgradeBasisPoints") : t("memberTierUpgradeBasisAmount")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {value === "points" ? t("memberTierUpgradeBasisPointsHint") : t("memberTierUpgradeBasisAmountHint")}
                  </p>
                </button>
              )
            })}
          </div>
          <Button
            variant="outline"
            disabled={policySaving}
            onClick={async () => {
              setPolicySaving(true)
              try {
                const res = await saveMemberTierPolicy({ upgradeBasis })
                if (!res.success) await appAlert(res.message || t("msg_save_fail"))
                else await appAlert(t("memberTierUpgradeBasisSaved"))
              } finally {
                setPolicySaving(false)
              }
            }}
          >
            {policySaving ? t("loading") : t("memberTierUpgradeBasisSave")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr(t, "memberPointExpiryTitle", { years: pointRetentionYears })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{tr(t, "memberPointExpiryDesc", { years: pointRetentionYears })}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{tr(t, "memberPointExpiryTierNote", { years: pointRetentionYears })}</li>
            <li>{tr(t, "memberPointExpiryBalanceNote", { years: pointRetentionYears })}</li>
          </ul>
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <div className="space-y-1">
              <Label htmlFor="point-retention-years">{t("memberPointRetentionYearsLabel")}</Label>
              <Input
                id="point-retention-years"
                type="number"
                min={1}
                max={10}
                className="h-9 w-24"
                value={String(pointRetentionYears)}
                onChange={(e) => setPointRetentionYears(Number(e.target.value || 2))}
              />
            </div>
            <Button
              variant="outline"
              disabled={pointRetentionSaving}
              onClick={async () => {
                setPointRetentionSaving(true)
                try {
                  const res = await saveMemberTierPolicy({ pointRetentionYears })
                  if (!res.success) await appAlert(res.message || t("msg_save_fail"))
                  else {
                    if (typeof res.pointRetentionYears === "number") {
                      setPointRetentionYears(res.pointRetentionYears)
                    }
                    await appAlert(t("memberPointRetentionYearsSaved"))
                  }
                } finally {
                  setPointRetentionSaving(false)
                }
              }}
            >
              {pointRetentionSaving ? t("loading") : t("memberPointRetentionYearsSave")}
            </Button>
          </div>
          <p className="text-xs">{t("memberPointExpiryCronNote")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("memberPointEarnBonusTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("memberPointEarnBonusDesc")}</p>
          <p className="text-sm text-muted-foreground">{t("memberPointEarnBonusNoStack")}</p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["dine_in", t("memberPointEarnChannelDineIn")],
                ["takeout", t("memberPointEarnChannelTakeout")],
                ["delivery", t("memberPointEarnChannelDelivery")],
                ["member_portal", t("memberPointEarnChannelMemberPortal")],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={String(earnBonus.channelMultipliers[key] ?? 1)}
                  onChange={(e) =>
                    setEarnBonus((prev) => ({
                      ...prev,
                      channelMultipliers: {
                        ...prev.channelMultipliers,
                        [key]: Number(e.target.value || 0),
                      },
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-medium">{t("memberPointEarnBirthdayTitle")}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={earnBonus.birthday.enabled}
                onChange={(e) =>
                  setEarnBonus((prev) => ({
                    ...prev,
                    birthday: { ...prev.birthday, enabled: e.target.checked },
                  }))
                }
              />
              {t("memberPointEarnBirthdayEnabled")}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("memberPointEarnBirthdayWindowDays")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={31}
                  value={String(earnBonus.birthday.windowDays)}
                  onChange={(e) =>
                    setEarnBonus((prev) => ({
                      ...prev,
                      birthday: {
                        ...prev.birthday,
                        windowDays: Number(e.target.value || 0),
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t("memberPointEarnBirthdayMultiplier")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={String(earnBonus.birthday.multiplier)}
                  onChange={(e) =>
                    setEarnBonus((prev) => ({
                      ...prev,
                      birthday: {
                        ...prev.birthday,
                        multiplier: Number(e.target.value || 0),
                      },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-medium">{t("memberPointEarnPeriodTitle")}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={earnBonus.periodPromo.enabled}
                onChange={(e) =>
                  setEarnBonus((prev) => ({
                    ...prev,
                    periodPromo: { ...prev.periodPromo, enabled: e.target.checked },
                  }))
                }
              />
              {t("memberPointEarnPeriodEnabled")}
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>{t("memberPointEarnPeriodStart")}</Label>
                <Input
                  type="date"
                  value={earnBonus.periodPromo.startDate}
                  onChange={(e) =>
                    setEarnBonus((prev) => ({
                      ...prev,
                      periodPromo: { ...prev.periodPromo, startDate: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t("memberPointEarnPeriodEnd")}</Label>
                <Input
                  type="date"
                  value={earnBonus.periodPromo.endDate}
                  onChange={(e) =>
                    setEarnBonus((prev) => ({
                      ...prev,
                      periodPromo: { ...prev.periodPromo, endDate: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t("memberPointEarnPeriodMultiplier")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={String(earnBonus.periodPromo.multiplier)}
                  onChange={(e) =>
                    setEarnBonus((prev) => ({
                      ...prev,
                      periodPromo: {
                        ...prev.periodPromo,
                        multiplier: Number(e.target.value || 0),
                      },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            disabled={earnBonusSaving}
            onClick={async () => {
              setEarnBonusSaving(true)
              try {
                const res = await saveMemberTierPolicy({ earnBonus })
                if (!res.success) await appAlert(res.message || t("msg_save_fail"))
                else {
                  if (res.earnBonus) setEarnBonus(res.earnBonus)
                  await appAlert(t("memberPointEarnBonusSaved"))
                }
              } finally {
                setEarnBonusSaving(false)
              }
            }}
          >
            {earnBonusSaving ? t("loading") : t("memberPointEarnBonusSave")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("memberTierRuleTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Input
              placeholder="CODE"
              value={form.code}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
            />
            <Input
              placeholder={t("name")}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <Input
              placeholder={t("memberTierMinPoints")}
              value={String(form.min_points)}
              onChange={(e) => setForm((prev) => ({ ...prev, min_points: Number(e.target.value || 0) }))}
            />
            <Input
              placeholder={t("memberTierMinAmount")}
              value={String(form.min_amount)}
              onChange={(e) => setForm((prev) => ({ ...prev, min_amount: Number(e.target.value || 0) }))}
            />
            <Input
              type="number"
              min={0}
              step={0.1}
              placeholder={t("memberTierPointRatePh")}
              value={formatTierRatePercentInput(form.point_rate)}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, point_rate: parseTierRatePercentInput(e.target.value) }))
              }
            />
            <Input
              type="number"
              min={0}
              step={0.1}
              placeholder={t("memberTierDiscountRatePh")}
              value={formatTierRatePercentInput(form.discount_rate)}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, discount_rate: parseTierRatePercentInput(e.target.value) }))
              }
            />
            <Input
              placeholder={t("memberTierSortOrder")}
              value={String(form.sort_order)}
              onChange={(e) => setForm((prev) => ({ ...prev, sort_order: Number(e.target.value || 0) }))}
            />
            <Button disabled={saving} onClick={() => void saveTier()}>
              {saving ? t("loading") : t("commonSave")}
            </Button>
          </div>
        </CardContent>
        <CardContent className="border-t pt-4">
          <p className="text-xs text-muted-foreground">{t("memberPointsPolicyExample")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("memberTierDiscountScopeTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <MemberTierDiscountScopeForm
            t={t}
            policy={tierDiscountPolicy}
            onChange={setTierDiscountPolicy}
          />
          <Button
            disabled={tierDiscountPolicySaving}
            onClick={() => {
              setTierDiscountPolicySaving(true)
              saveMemberTierPolicy({ tierDiscountPolicy })
                .then((res) => {
                  if (!res.success) {
                    void appAlert(res.message || t("saveFailed"))
                    return
                  }
                  if (res.tierDiscountPolicy) setTierDiscountPolicy(res.tierDiscountPolicy)
                  void appAlert(t("memberTierDiscountScopeSaved"))
                })
                .catch(() => appAlert(t("saveFailed")))
                .finally(() => setTierDiscountPolicySaving(false))
            }}
          >
            {tierDiscountPolicySaving ? t("loading") : t("memberTierDiscountScopeSave")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("memberTierListTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("memberTierListInlineHint")}</p>
          <p className="text-xs text-muted-foreground">{t("memberTierDiscountPosHint")}</p>
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-left">{t("code")}</th>
                  <th className="p-2 text-left">{t("name")}</th>
                  <th className="p-2 text-left">{t("memberTierMinPoints")}</th>
                  <th className="p-2 text-left">{t("memberTierMinAmount")}</th>
                  <th className="p-2 text-left">{t("memberTierPointRate")}</th>
                  <th className="p-2 text-left">{t("memberTierDiscountRate")}</th>
                  <th className="p-2 text-left">{t("memberTierBenefitsShort")}</th>
                  <th className="p-2 text-left">{t("commonSave")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.code}
                    className={`border-t hover:bg-muted/20 ${
                      r.code === form.code ? "bg-primary/5" : ""
                    }`}
                  >
                    <td className="p-2">
                      <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => applyRow(r)}>
                        {r.code}
                      </button>
                    </td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-24"
                        value={String(r.min_points ?? 0)}
                        onChange={(e) => patchRow(r.code, { min_points: Number(e.target.value || 0) })}
                      />
                    </td>
                    <td className="p-2">{Number(r.min_amount || 0).toLocaleString()}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        className="h-8 w-24"
                        value={formatTierRatePercentInput(r.point_rate ?? 0)}
                        onChange={(e) =>
                          patchRow(r.code, { point_rate: parseTierRatePercentInput(e.target.value) })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        className="h-8 w-24"
                        value={formatTierRatePercentInput(r.discount_rate ?? 0)}
                        onChange={(e) =>
                          patchRow(r.code, { discount_rate: parseTierRatePercentInput(e.target.value) })
                        }
                      />
                    </td>
                    <td className="max-w-[240px] truncate p-2 text-muted-foreground">
                      {String(r.benefits_th || r.benefits_ko || r.benefits_en || "—")}
                    </td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={rowSavingCode === r.code}
                        onClick={() => void saveRowTier(r)}
                      >
                        {rowSavingCode === r.code ? t("loading") : t("commonSave")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("memberTierBenefitsPortalTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("memberTierBenefitsPortalDesc")}</p>
          <p className="text-sm font-medium">
            {tr(t, "memberTierBenefitsEditingTier", { name: form.name || form.code, code: form.code })}
          </p>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("memberTierBenefitsKo")}</Label>
              <Textarea
                rows={6}
                value={String(form.benefits_ko || "")}
                onChange={(e) => setForm((prev) => ({ ...prev, benefits_ko: e.target.value }))}
                placeholder={t("memberTierBenefitsPh")}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("memberTierBenefitsEn")}</Label>
              <Textarea
                rows={6}
                value={String(form.benefits_en || "")}
                onChange={(e) => setForm((prev) => ({ ...prev, benefits_en: e.target.value }))}
                placeholder={t("memberTierBenefitsPh")}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("memberTierBenefitsTh")}</Label>
              <Textarea
                rows={6}
                value={String(form.benefits_th || "")}
                onChange={(e) => setForm((prev) => ({ ...prev, benefits_th: e.target.value }))}
                placeholder={t("memberTierBenefitsPh")}
              />
            </div>
          </div>
          <MemberTierBenefitsPreview
            key={form.code}
            tierCode={form.code}
            tierName={form.name || form.code}
            pointRate={Number(form.point_rate || 0)}
            benefitsKo={String(form.benefits_ko || "")}
            benefitsEn={String(form.benefits_en || "")}
            benefitsTh={String(form.benefits_th || "")}
            defaultLang={previewLangDefault}
            previewTitle={t("memberTierBenefitsPreviewTitle")}
            previewHint={t("memberTierBenefitsPreviewHint")}
            earnRateLabel={t("memberTierPointRate")}
            emptyLabel={t("memberTierBenefitsPreviewEmpty")}
            langKoLabel="KO"
            langEnLabel="EN"
            langThLabel="TH"
          />
          <Button disabled={saving} onClick={() => void saveTier()}>
            {saving ? t("loading") : t("memberTierBenefitsSave")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("memberTierRecalculateTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={async () => {
              const res = await recalculateMemberTier()
              if (!res.success) await appAlert(res.message || t("memberTierRecalculateFail"))
              else await appAlert(`${t("memberTierRecalculateDone")}: ${res.updated ?? 0}${t("memberCountUnit")}`)
            }}
          >
            {t("memberTierRecalculateAll")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

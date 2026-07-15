"use client"

import * as React from "react"
import {
  Award,
  CalendarHeart,
  Gift,
  Info,
  Percent,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Wallet,
} from "lucide-react"
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
import { resolveTierFamily, type TierFamily } from "@/lib/member-portal-tier-visual"
import { useLang } from "@/lib/lang-context"
import { useT, tr } from "@/lib/i18n"
import {
  formatTierRatePercentInput,
  parseTierRatePercentInput,
} from "@/lib/member-tier-rate-percent"
import { cn } from "@/lib/utils"

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

type SectionTone = "amber" | "violet" | "sky" | "emerald" | "orange" | "rose" | "slate"

const SECTION_TONE: Record<
  SectionTone,
  { border: string; header: string; icon: string; title: string; save: string }
> = {
  amber: {
    border: "border-amber-200/70",
    header: "bg-gradient-to-r from-amber-50/90 to-orange-50/40",
    icon: "bg-amber-500/15 text-amber-700",
    title: "text-amber-950",
    save: "bg-amber-600 text-white hover:bg-amber-700",
  },
  violet: {
    border: "border-violet-200/70",
    header: "bg-gradient-to-r from-violet-50/90 to-fuchsia-50/40",
    icon: "bg-violet-500/15 text-violet-700",
    title: "text-violet-950",
    save: "bg-violet-600 text-white hover:bg-violet-700",
  },
  sky: {
    border: "border-sky-200/70",
    header: "bg-gradient-to-r from-sky-50/90 to-cyan-50/40",
    icon: "bg-sky-500/15 text-sky-700",
    title: "text-sky-950",
    save: "bg-sky-600 text-white hover:bg-sky-700",
  },
  emerald: {
    border: "border-emerald-200/70",
    header: "bg-gradient-to-r from-emerald-50/90 to-teal-50/40",
    icon: "bg-emerald-500/15 text-emerald-700",
    title: "text-emerald-950",
    save: "bg-emerald-600 text-white hover:bg-emerald-700",
  },
  orange: {
    border: "border-orange-200/70",
    header: "bg-gradient-to-r from-orange-50/90 to-amber-50/40",
    icon: "bg-orange-500/15 text-orange-700",
    title: "text-orange-950",
    save: "bg-orange-600 text-white hover:bg-orange-700",
  },
  rose: {
    border: "border-rose-200/70",
    header: "bg-gradient-to-r from-rose-50/90 to-pink-50/40",
    icon: "bg-rose-500/15 text-rose-700",
    title: "text-rose-950",
    save: "bg-rose-600 text-white hover:bg-rose-700",
  },
  slate: {
    border: "border-slate-200/80",
    header: "bg-gradient-to-r from-slate-50 to-zinc-50/60",
    icon: "bg-slate-500/15 text-slate-700",
    title: "text-slate-900",
    save: "bg-slate-700 text-white hover:bg-slate-800",
  },
}

const TIER_ROW_BADGE: Record<TierFamily, string> = {
  bronze: "bg-amber-700/15 text-amber-900 ring-amber-700/20",
  silver: "bg-slate-500/15 text-slate-800 ring-slate-400/25",
  gold: "bg-yellow-500/20 text-yellow-900 ring-yellow-500/25",
  platinum: "bg-sky-500/15 text-sky-900 ring-sky-400/25",
  diamond: "bg-violet-500/15 text-violet-900 ring-violet-400/25",
  vip: "bg-rose-500/15 text-rose-900 ring-rose-400/25",
  default: "bg-amber-500/15 text-amber-900 ring-amber-400/20",
}

function PolicySection({
  tone,
  icon: Icon,
  title,
  description,
  children,
}: {
  tone: SectionTone
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  children: React.ReactNode
}) {
  const s = SECTION_TONE[tone]
  return (
    <Card className={cn("overflow-hidden shadow-sm", s.border)}>
      <CardHeader className={cn("border-b py-3.5", s.header)}>
        <div className="flex items-start gap-3">
          <div className={cn("rounded-xl p-2", s.icon)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className={cn("text-base", s.title)}>{title}</CardTitle>
            {description ? <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">{children}</CardContent>
    </Card>
  )
}

function SaveButton({
  tone,
  loading,
  label,
  loadingLabel,
  disabled,
  onClick,
}: {
  tone: SectionTone
  loading: boolean
  label: string
  loadingLabel: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      disabled={disabled || loading}
      className={cn("gap-1.5 shadow-sm", SECTION_TONE[tone].save)}
      onClick={onClick}
    >
      <Save className="h-3.5 w-3.5" />
      {loading ? loadingLabel : label}
    </Button>
  )
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
  const [recalculating, setRecalculating] = React.useState(false)

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
      <div className="flex flex-col gap-2 rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50/70 to-orange-50/30 px-3.5 py-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex items-start gap-2 text-sm text-amber-950/90">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>{t("memberPointsEarnHint")}</p>
        </div>
        <div className="hidden h-10 w-px bg-amber-200/80 sm:block" />
        <p className="text-sm text-muted-foreground sm:flex-1">{t("memberTierLineHint")}</p>
      </div>

      <CrmTierLadder rows={rows} upgradeBasis={upgradeBasis} />

      <PolicySection
        tone="violet"
        icon={Target}
        title={t("memberTierUpgradeBasisTitle")}
        description={t("memberTierUpgradeBasisDesc")}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {(["points", "amount"] as const).map((value) => {
            const active = upgradeBasis === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setUpgradeBasis(value)}
                className={cn(
                  "rounded-xl border px-4 py-3.5 text-left text-sm transition",
                  active
                    ? "border-violet-400 bg-violet-50/80 shadow-sm ring-2 ring-violet-300/40"
                    : "border-border bg-background hover:border-violet-200 hover:bg-violet-50/40"
                )}
              >
                <p className={cn("font-semibold", active ? "text-violet-900" : "text-foreground")}>
                  {value === "points" ? t("memberTierUpgradeBasisPoints") : t("memberTierUpgradeBasisAmount")}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {value === "points" ? t("memberTierUpgradeBasisPointsHint") : t("memberTierUpgradeBasisAmountHint")}
                </p>
              </button>
            )
          })}
        </div>
        <SaveButton
          tone="violet"
          loading={policySaving}
          label={t("memberTierUpgradeBasisSave")}
          loadingLabel={t("loading")}
          onClick={() => {
            void (async () => {
              setPolicySaving(true)
              try {
                const res = await saveMemberTierPolicy({ upgradeBasis })
                if (!res.success) await appAlert(res.message || t("msg_save_fail"))
                else await appAlert(t("memberTierUpgradeBasisSaved"))
              } finally {
                setPolicySaving(false)
              }
            })()
          }}
        />
      </PolicySection>

      <PolicySection
        tone="sky"
        icon={Timer}
        title={tr(t, "memberPointExpiryTitle", { years: pointRetentionYears })}
        description={tr(t, "memberPointExpiryDesc", { years: pointRetentionYears })}
      >
        <ul className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/40 px-3.5 py-3 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
            {tr(t, "memberPointExpiryTierNote", { years: pointRetentionYears })}
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
            {tr(t, "memberPointExpiryBalanceNote", { years: pointRetentionYears })}
          </li>
        </ul>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="point-retention-years" className="text-xs text-muted-foreground">
              {t("memberPointRetentionYearsLabel")}
            </Label>
            <Input
              id="point-retention-years"
              type="number"
              min={1}
              max={10}
              className="h-9 w-24 bg-background"
              value={String(pointRetentionYears)}
              onChange={(e) => setPointRetentionYears(Number(e.target.value || 2))}
            />
          </div>
          <SaveButton
            tone="sky"
            loading={pointRetentionSaving}
            label={t("memberPointRetentionYearsSave")}
            loadingLabel={t("loading")}
            onClick={() => {
              void (async () => {
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
              })()
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("memberPointExpiryCronNote")}</p>
      </PolicySection>

      <PolicySection
        tone="emerald"
        icon={Wallet}
        title={t("memberPointEarnBonusTitle")}
        description={t("memberPointEarnBonusDesc")}
      >
        <p className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900/80">
          {t("memberPointEarnBonusNoStack")}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["dine_in", t("memberPointEarnChannelDineIn")],
              ["takeout", t("memberPointEarnChannelTakeout")],
              ["delivery", t("memberPointEarnChannelDelivery")],
              ["member_portal", t("memberPointEarnChannelMemberPortal")],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5 rounded-xl border bg-muted/20 p-3">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                className="bg-background"
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

        <div className="rounded-xl border border-pink-200/60 bg-gradient-to-br from-pink-50/70 to-rose-50/30 p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarHeart className="h-4 w-4 text-rose-600" />
            <p className="text-sm font-semibold text-rose-950">{t("memberPointEarnBirthdayTitle")}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-rose-600"
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("memberPointEarnBirthdayWindowDays")}</Label>
              <Input
                type="number"
                min={0}
                max={31}
                className="bg-background"
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("memberPointEarnBirthdayMultiplier")}</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                className="bg-background"
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

        <div className="rounded-xl border border-teal-200/60 bg-gradient-to-br from-teal-50/70 to-emerald-50/30 p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-teal-700" />
            <p className="text-sm font-semibold text-teal-950">{t("memberPointEarnPeriodTitle")}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-teal-600"
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("memberPointEarnPeriodStart")}</Label>
              <Input
                type="date"
                className="bg-background"
                value={earnBonus.periodPromo.startDate}
                onChange={(e) =>
                  setEarnBonus((prev) => ({
                    ...prev,
                    periodPromo: { ...prev.periodPromo, startDate: e.target.value },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("memberPointEarnPeriodEnd")}</Label>
              <Input
                type="date"
                className="bg-background"
                value={earnBonus.periodPromo.endDate}
                onChange={(e) =>
                  setEarnBonus((prev) => ({
                    ...prev,
                    periodPromo: { ...prev.periodPromo, endDate: e.target.value },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("memberPointEarnPeriodMultiplier")}</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                className="bg-background"
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

        <SaveButton
          tone="emerald"
          loading={earnBonusSaving}
          label={t("memberPointEarnBonusSave")}
          loadingLabel={t("loading")}
          onClick={() => {
            void (async () => {
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
            })()
          }}
        />
      </PolicySection>

      <PolicySection tone="amber" icon={Award} title={t("memberTierRuleTitle")}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <Input
            placeholder="CODE"
            className="bg-background font-mono uppercase"
            value={form.code}
            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
          />
          <Input
            placeholder={t("name")}
            className="bg-background"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            placeholder={t("memberTierMinPoints")}
            className="bg-background"
            value={String(form.min_points)}
            onChange={(e) => setForm((prev) => ({ ...prev, min_points: Number(e.target.value || 0) }))}
          />
          <Input
            placeholder={t("memberTierMinAmount")}
            className="bg-background"
            value={String(form.min_amount)}
            onChange={(e) => setForm((prev) => ({ ...prev, min_amount: Number(e.target.value || 0) }))}
          />
          <Input
            type="number"
            min={0}
            step={0.1}
            className="bg-background"
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
            className="bg-background"
            placeholder={t("memberTierDiscountRatePh")}
            value={formatTierRatePercentInput(form.discount_rate)}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, discount_rate: parseTierRatePercentInput(e.target.value) }))
            }
          />
          <Input
            placeholder={t("memberTierSortOrder")}
            className="bg-background"
            value={String(form.sort_order)}
            onChange={(e) => setForm((prev) => ({ ...prev, sort_order: Number(e.target.value || 0) }))}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("memberPointsPolicyExample")}</p>
          <SaveButton
            tone="amber"
            loading={saving}
            label={t("commonSave")}
            loadingLabel={t("loading")}
            onClick={() => void saveTier()}
          />
        </div>
      </PolicySection>

      <PolicySection tone="orange" icon={Percent} title={t("memberTierDiscountScopeTitle")}>
        <MemberTierDiscountScopeForm t={t} policy={tierDiscountPolicy} onChange={setTierDiscountPolicy} />
        <SaveButton
          tone="orange"
          loading={tierDiscountPolicySaving}
          label={t("memberTierDiscountScopeSave")}
          loadingLabel={t("loading")}
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
        />
      </PolicySection>

      <PolicySection
        tone="amber"
        icon={TrendingUp}
        title={t("memberTierListTitle")}
        description={t("memberTierListInlineHint")}
      >
        <p className="text-xs text-muted-foreground">{t("memberTierDiscountPosHint")}</p>
        <div className="overflow-auto rounded-xl border border-amber-100/80 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-amber-50 to-orange-50/50">
              <tr className="text-amber-950/80">
                <th className="p-2.5 text-left text-xs font-semibold">{t("code")}</th>
                <th className="p-2.5 text-left text-xs font-semibold">{t("name")}</th>
                <th className="p-2.5 text-left text-xs font-semibold">{t("memberTierMinPoints")}</th>
                <th className="p-2.5 text-left text-xs font-semibold">{t("memberTierMinAmount")}</th>
                <th className="p-2.5 text-left text-xs font-semibold">{t("memberTierPointRate")}</th>
                <th className="p-2.5 text-left text-xs font-semibold">{t("memberTierDiscountRate")}</th>
                <th className="p-2.5 text-left text-xs font-semibold">{t("memberTierBenefitsShort")}</th>
                <th className="p-2.5 text-left text-xs font-semibold">{t("commonSave")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const family = resolveTierFamily(r.code)
                const selected = r.code === form.code
                return (
                  <tr
                    key={r.code}
                    className={cn(
                      "border-t border-amber-100/60 transition",
                      selected ? "bg-amber-50/70 ring-1 ring-inset ring-amber-300/40" : "hover:bg-amber-50/30"
                    )}
                  >
                    <td className="p-2.5">
                      <button
                        type="button"
                        className={cn(
                          "inline-flex rounded-md px-2 py-0.5 text-xs font-bold tracking-wide ring-1 transition hover:brightness-95",
                          TIER_ROW_BADGE[family]
                        )}
                        onClick={() => applyRow(r)}
                      >
                        {r.code}
                      </button>
                    </td>
                    <td className="p-2.5 font-medium">{r.name}</td>
                    <td className="p-2.5">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-24 bg-background"
                        value={String(r.min_points ?? 0)}
                        onChange={(e) => patchRow(r.code, { min_points: Number(e.target.value || 0) })}
                      />
                    </td>
                    <td className="p-2.5 tabular-nums text-muted-foreground">
                      {Number(r.min_amount || 0).toLocaleString()}
                    </td>
                    <td className="p-2.5">
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        className="h-8 w-24 bg-background"
                        value={formatTierRatePercentInput(r.point_rate ?? 0)}
                        onChange={(e) =>
                          patchRow(r.code, { point_rate: parseTierRatePercentInput(e.target.value) })
                        }
                      />
                    </td>
                    <td className="p-2.5">
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        className="h-8 w-24 bg-background"
                        value={formatTierRatePercentInput(r.discount_rate ?? 0)}
                        onChange={(e) =>
                          patchRow(r.code, { discount_rate: parseTierRatePercentInput(e.target.value) })
                        }
                      />
                    </td>
                    <td className="max-w-[240px] truncate p-2.5 text-muted-foreground">
                      {String(r.benefits_th || r.benefits_ko || r.benefits_en || "—")}
                    </td>
                    <td className="p-2.5">
                      <Button
                        size="sm"
                        disabled={rowSavingCode === r.code}
                        className="gap-1 bg-amber-600 text-white hover:bg-amber-700"
                        onClick={() => void saveRowTier(r)}
                      >
                        <Save className="h-3 w-3" />
                        {rowSavingCode === r.code ? t("loading") : t("commonSave")}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </PolicySection>

      <PolicySection
        tone="rose"
        icon={Sparkles}
        title={t("memberTierBenefitsPortalTitle")}
        description={t("memberTierBenefitsPortalDesc")}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50/80 px-3 py-1 text-xs font-medium text-rose-900">
          <Award className="h-3.5 w-3.5" />
          {tr(t, "memberTierBenefitsEditingTier", { name: form.name || form.code, code: form.code })}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-1.5 rounded-xl border bg-muted/15 p-3">
            <Label className="text-xs font-semibold text-muted-foreground">{t("memberTierBenefitsKo")}</Label>
            <Textarea
              rows={6}
              className="bg-background"
              value={String(form.benefits_ko || "")}
              onChange={(e) => setForm((prev) => ({ ...prev, benefits_ko: e.target.value }))}
              placeholder={t("memberTierBenefitsPh")}
            />
          </div>
          <div className="space-y-1.5 rounded-xl border bg-muted/15 p-3">
            <Label className="text-xs font-semibold text-muted-foreground">{t("memberTierBenefitsEn")}</Label>
            <Textarea
              rows={6}
              className="bg-background"
              value={String(form.benefits_en || "")}
              onChange={(e) => setForm((prev) => ({ ...prev, benefits_en: e.target.value }))}
              placeholder={t("memberTierBenefitsPh")}
            />
          </div>
          <div className="space-y-1.5 rounded-xl border bg-muted/15 p-3">
            <Label className="text-xs font-semibold text-muted-foreground">{t("memberTierBenefitsTh")}</Label>
            <Textarea
              rows={6}
              className="bg-background"
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
        <SaveButton
          tone="rose"
          loading={saving}
          label={t("memberTierBenefitsSave")}
          loadingLabel={t("loading")}
          onClick={() => void saveTier()}
        />
      </PolicySection>

      <PolicySection tone="slate" icon={RefreshCw} title={t("memberTierRecalculateTitle")}>
        <Button
          type="button"
          disabled={recalculating}
          className="gap-1.5 bg-slate-800 text-white shadow-sm hover:bg-slate-900"
          onClick={async () => {
            setRecalculating(true)
            try {
              const res = await recalculateMemberTier()
              if (!res.success) await appAlert(res.message || t("memberTierRecalculateFail"))
              else await appAlert(`${t("memberTierRecalculateDone")}: ${res.updated ?? 0}${t("memberCountUnit")}`)
            } finally {
              setRecalculating(false)
            }
          }}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", recalculating && "animate-spin")} />
          {recalculating ? t("loading") : t("memberTierRecalculateAll")}
        </Button>
      </PolicySection>
    </div>
  )
}

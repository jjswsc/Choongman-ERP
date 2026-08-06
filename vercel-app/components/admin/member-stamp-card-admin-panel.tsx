"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Gift, Plus, Stamp, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { apiFetch } from "@/lib/api/fetch"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type {
  MemberStampAdminStats,
  MemberStampChannel,
  MemberStampEarnMode,
  MemberStampPolicy,
  MemberStampRewardType,
  StampCouponValidationRow,
} from "@/lib/member-stamp-card"

const STAMP_CHANNEL_OPTIONS: MemberStampChannel[] = ["dine_in", "takeout", "delivery", "member_portal"]

type MilestoneFormRow = {
  stampCount: string
  rewardType: MemberStampRewardType
  rewardPoints: string
  couponCode: string
  labelKo: string
  labelEn: string
  labelTh: string
}

type StoreOverrideRow = {
  storeCode: string
  enabled: boolean
  minOrderAmt: string
}

type StampFailureRow = {
  id: number
  memberId: number
  couponCode: string
  errorMessage: string
  createdAt: string
}

function emptyMilestone(): MilestoneFormRow {
  return {
    stampCount: "",
    rewardType: "coupon",
    rewardPoints: "",
    couponCode: "",
    labelKo: "",
    labelEn: "",
    labelTh: "",
  }
}

function emptyStoreOverride(): StoreOverrideRow {
  return { storeCode: "", enabled: true, minOrderAmt: "" }
}

function storeOverridesFromPolicy(
  overrides: Record<string, Partial<MemberStampPolicy["storeOverrides"][string]>>
): StoreOverrideRow[] {
  return Object.entries(overrides || {}).map(([storeCode, o]) => ({
    storeCode,
    enabled: o?.enabled !== false,
    minOrderAmt: o?.minOrderAmt != null ? String(o.minOrderAmt) : "",
  }))
}

function storeOverridesToPolicy(rows: StoreOverrideRow[]): MemberStampPolicy["storeOverrides"] {
  const out: MemberStampPolicy["storeOverrides"] = {}
  for (const row of rows) {
    const code = row.storeCode.trim()
    if (!code) continue
    const entry: Partial<MemberStampPolicy> = { enabled: row.enabled }
    if (row.minOrderAmt.trim()) {
      entry.minOrderAmt = Number(row.minOrderAmt)
    }
    out[code] = entry
  }
  return out
}

function channelLabelKey(channel: MemberStampChannel): string {
  if (channel === "dine_in") return "mpAdmin_stampChannelDineIn"
  if (channel === "takeout") return "mpAdmin_stampChannelTakeout"
  if (channel === "delivery") return "mpAdmin_stampChannelDelivery"
  return "mpAdmin_stampChannelMemberPortal"
}

function StampCardPreview({
  cardSlots,
  filled,
  milestoneCounts,
  progressLabel,
}: {
  cardSlots: number
  filled: number
  milestoneCounts: number[]
  progressLabel: string
}) {
  const slots = Math.max(1, Math.min(30, cardSlots))
  const shown = Math.max(0, Math.min(slots, filled))
  const milestoneSet = new Set(milestoneCounts.filter((n) => n > 0 && n <= slots))
  const progressPct = slots > 0 ? Math.round((shown / slots) * 100) : 0

  return (
    <div className="rounded-xl border bg-gradient-to-b from-amber-500/10 to-transparent p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/15 text-amber-700">
            <Stamp className="h-4 w-4" />
          </div>
          <p className="text-sm font-medium">{progressLabel}</p>
        </div>
        <span className="text-sm font-semibold text-amber-700">{progressPct}%</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className={`grid gap-2 ${slots <= 5 ? "grid-cols-5" : "grid-cols-5 sm:grid-cols-10"}`}>
        {Array.from({ length: slots }, (_, i) => {
          const slotNo = i + 1
          const active = i < shown
          const isMilestone = milestoneSet.has(slotNo)
          return (
            <div
              key={i}
              className={`relative flex aspect-square items-center justify-center rounded-full border text-xs font-semibold ${
                active
                  ? "border-amber-400/60 bg-gradient-to-br from-amber-200/50 to-amber-400/30 text-amber-900"
                  : isMilestone
                    ? "border-amber-400/40 bg-amber-50 text-amber-800/70"
                    : "border-border bg-muted/30 text-muted-foreground"
              }`}
            >
              {isMilestone ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] text-black">
                  <Gift className="h-2.5 w-2.5" />
                </span>
              ) : null}
              {active ? <Stamp className="h-3.5 w-3.5" /> : slotNo}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type Props = {
  canEdit: boolean
  onNotice: (msg: string) => void
  onError: (msg: string) => void
}

export function MemberStampCardAdminPanel({ canEdit, onNotice, onError }: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [validating, setValidating] = React.useState(false)
  const [statsLoading, setStatsLoading] = React.useState(false)
  const [adjusting, setAdjusting] = React.useState(false)
  const [needsSetup, setNeedsSetup] = React.useState(false)
  const [enabled, setEnabled] = React.useState(false)
  const [cardSlots, setCardSlots] = React.useState("10")
  const [earnMode, setEarnMode] = React.useState<MemberStampEarnMode>("day")
  const [resetAfterComplete, setResetAfterComplete] = React.useState(true)
  const [minOrderAmt, setMinOrderAmt] = React.useState("0")
  const [cardExpiryDays, setCardExpiryDays] = React.useState("0")
  const [lineNotifyEnabled, setLineNotifyEnabled] = React.useState(true)
  const [excludeZeroAmount, setExcludeZeroAmount] = React.useState(true)
  const [allowedChannels, setAllowedChannels] = React.useState<MemberStampChannel[]>([])
  const [completeBonusCouponCode, setCompleteBonusCouponCode] = React.useState("")
  const [completeBonusPoints, setCompleteBonusPoints] = React.useState("0")
  const [storeOverrideRows, setStoreOverrideRows] = React.useState<StoreOverrideRow[]>([])
  const [milestones, setMilestones] = React.useState<MilestoneFormRow[]>([emptyMilestone()])
  const [previewFilled, setPreviewFilled] = React.useState("3")
  const [validations, setValidations] = React.useState<StampCouponValidationRow[]>([])
  const [stats, setStats] = React.useState<MemberStampAdminStats | null>(null)
  const [failures, setFailures] = React.useState<StampFailureRow[]>([])
  const [adjustMemberId, setAdjustMemberId] = React.useState("")
  const [adjustDelta, setAdjustDelta] = React.useState("")
  const [adjustNote, setAdjustNote] = React.useState("")

  const buildMilestonePayload = React.useCallback(
    () =>
      milestones
        .map((row, idx) => ({
          stampCount: Number(row.stampCount || 0),
          rewardType: row.rewardType,
          rewardPoints: Number(row.rewardPoints || 0),
          couponCode: row.couponCode.trim().toUpperCase(),
          labelKo: row.labelKo.trim(),
          labelEn: row.labelEn.trim(),
          labelTh: row.labelTh.trim(),
          sortOrder: idx + 1,
          isActive: true,
        }))
        .filter((row) => {
          if (row.stampCount <= 0) return false
          if (row.rewardType === "points") return row.rewardPoints > 0
          return Boolean(row.couponCode)
        }),
    [milestones]
  )

  const buildPolicyPayload = React.useCallback(
    (): MemberStampPolicy => ({
      enabled,
      cardSlots: Number(cardSlots || 10),
      earnMode,
      resetAfterComplete,
      minOrderAmt: Number(minOrderAmt || 0),
      cardExpiryDays: Number(cardExpiryDays || 0),
      lineNotifyEnabled,
      excludeZeroAmount,
      allowedChannels,
      completeBonusCouponCode: completeBonusCouponCode.trim().toUpperCase(),
      completeBonusPoints: Number(completeBonusPoints || 0),
      storeOverrides: storeOverridesToPolicy(storeOverrideRows),
    }),
    [
      allowedChannels,
      cardExpiryDays,
      cardSlots,
      completeBonusCouponCode,
      completeBonusPoints,
      earnMode,
      enabled,
      excludeZeroAmount,
      lineNotifyEnabled,
      minOrderAmt,
      resetAfterComplete,
      storeOverrideRows,
    ]
  )

  const loadStats = React.useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/stamp-card/stats?days=30", {
        cache: "no-store",
      })
      const data = (await res.json()) as {
        success: boolean
        message?: string
        stats?: MemberStampAdminStats
        failures?: StampFailureRow[]
      }
      if (!res.ok || !data.success) {
        onError(data.message || t("mpAdmin_errStampStats"))
        return
      }
      setStats(data.stats || null)
      setFailures(data.failures || [])
    } catch {
      onError(t("mpAdmin_errStampStats"))
    } finally {
      setStatsLoading(false)
    }
  }, [onError, t])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/stamp-card", { cache: "no-store" })
      const data = (await res.json()) as {
        success: boolean
        needsSetup?: boolean
        message?: string
        policy?: MemberStampPolicy
        milestones?: Array<{
          stampCount?: number
          rewardType?: MemberStampRewardType
          rewardPoints?: number
          couponCode?: string
          labelKo?: string
          labelEn?: string
          labelTh?: string
        }>
      }
      if (!res.ok || !data.success) {
        setNeedsSetup(Boolean(data.needsSetup))
        if (data.needsSetup) onError(t("mpAdmin_stampNeedsSetup"))
        else onError(data.message || t("mpAdmin_errLoadContent"))
        return
      }
      setNeedsSetup(false)
      const policy = data.policy
      if (policy) {
        setEnabled(Boolean(policy.enabled))
        setCardSlots(String(policy.cardSlots || 10))
        setEarnMode(policy.earnMode === "order" ? "order" : "day")
        setResetAfterComplete(policy.resetAfterComplete !== false)
        setMinOrderAmt(String(policy.minOrderAmt || 0))
        setCardExpiryDays(String(policy.cardExpiryDays || 0))
        setLineNotifyEnabled(policy.lineNotifyEnabled !== false)
        setExcludeZeroAmount(policy.excludeZeroAmount !== false)
        setAllowedChannels(Array.isArray(policy.allowedChannels) ? policy.allowedChannels : [])
        setCompleteBonusCouponCode(String(policy.completeBonusCouponCode || ""))
        setCompleteBonusPoints(String(policy.completeBonusPoints || 0))
        const overrideRows = storeOverridesFromPolicy(policy.storeOverrides || {})
        setStoreOverrideRows(overrideRows.length ? overrideRows : [])
      }
      const rows: MilestoneFormRow[] = (data.milestones || []).map((m) => ({
        stampCount: String(m.stampCount || ""),
        rewardType: (m.rewardType === "points" ? "points" : "coupon") as MemberStampRewardType,
        rewardPoints: String(m.rewardPoints || ""),
        couponCode: String(m.couponCode || ""),
        labelKo: String(m.labelKo || ""),
        labelEn: String(m.labelEn || ""),
        labelTh: String(m.labelTh || ""),
      }))
      setMilestones(rows.length ? rows : [emptyMilestone()])
      setValidations([])
    } catch {
      onError(t("mpAdmin_errLoadContent"))
    } finally {
      setLoading(false)
    }
  }, [onError, t])

  React.useEffect(() => {
    void load()
    void loadStats()
  }, [load, loadStats])

  const save = async () => {
    setSaving(true)
    onError("")
    onNotice("")
    try {
      const payload = {
        policy: buildPolicyPayload(),
        milestones: buildMilestonePayload(),
      }
      const res = await apiFetch("/api/member-portal/admin/settings/stamp-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as {
        success: boolean
        message?: string
        validations?: StampCouponValidationRow[]
      }
      if (!res.ok || !data.success) {
        if (Array.isArray(data.validations) && data.validations.length > 0) {
          setValidations(data.validations)
        }
        onError(data.message || t("mpAdmin_errStampSave"))
        return
      }
      if (Array.isArray(data.validations)) setValidations(data.validations)
      onNotice(t("mpAdmin_stampSaved"))
      await load()
      await loadStats()
    } catch {
      onError(t("mpAdmin_errStampSave"))
    } finally {
      setSaving(false)
    }
  }

  const validateCoupons = async () => {
    setValidating(true)
    onError("")
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/stamp-card/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestones: buildMilestonePayload() }),
      })
      const data = (await res.json()) as {
        success: boolean
        message?: string
        validations?: StampCouponValidationRow[]
      }
      if (!res.ok || !data.success) {
        onError(data.message || t("mpAdmin_errStampValidate"))
        return
      }
      setValidations(data.validations || [])
      const allOk = (data.validations || []).every((v) => v.ok)
      onNotice(allOk ? t("mpAdmin_stampValidateAllOk") : t("mpAdmin_stampValidateHasErrors"))
    } catch {
      onError(t("mpAdmin_errStampValidate"))
    } finally {
      setValidating(false)
    }
  }

  const submitAdjust = async () => {
    setAdjusting(true)
    onError("")
    onNotice("")
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/stamp-card/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberRef: adjustMemberId.trim(),
          delta: Number(adjustDelta || 0),
          note: adjustNote.trim(),
        }),
      })
      const data = (await res.json()) as { success: boolean; message?: string }
      if (!res.ok || !data.success) {
        onError(data.message || t("mpAdmin_errStampAdjust"))
        return
      }
      onNotice(t("mpAdmin_stampAdjustSuccess"))
      setAdjustMemberId("")
      setAdjustDelta("")
      setAdjustNote("")
      await loadStats()
    } catch {
      onError(t("mpAdmin_errStampAdjust"))
    } finally {
      setAdjusting(false)
    }
  }

  const toggleChannel = (channel: MemberStampChannel) => {
    setAllowedChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    )
  }

  const slotsNum = Math.max(1, Math.min(30, Number(cardSlots || 10)))
  const previewFilledNum = Math.max(0, Math.min(slotsNum, Number(previewFilled || 0)))
  const milestoneCounts = milestones.map((m) => Number(m.stampCount || 0)).filter((n) => n > 0)
  const progressLabel = t("mpAdmin_stampPreviewProgress")
    .replace("{current}", String(previewFilledNum))
    .replace("{total}", String(slotsNum))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("mpAdmin_stampCardTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("mpAdmin_stampCardDesc")}</p>
          {needsSetup ? (
            <p className="text-sm text-amber-700">{t("mpAdmin_stampNeedsSetup")}</p>
          ) : null}
          <fieldset disabled={!canEdit || loading || needsSetup} className="space-y-4 disabled:opacity-60">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              {t("mpAdmin_stampEnabled")}
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("mpAdmin_stampCardSlots")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={cardSlots}
                  onChange={(e) => setCardSlots(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("mpAdmin_stampMinOrderAmt")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={minOrderAmt}
                  onChange={(e) => setMinOrderAmt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("mpAdmin_stampCardExpiryDays")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={3650}
                  value={cardExpiryDays}
                  onChange={(e) => setCardExpiryDays(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("mpAdmin_stampEarnMode")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={earnMode}
                  onChange={(e) => setEarnMode(e.target.value === "order" ? "order" : "day")}
                >
                  <option value="day">{t("mpAdmin_stampEarnModeDay")}</option>
                  <option value="order">{t("mpAdmin_stampEarnModeOrder")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("mpAdmin_stampResetMode")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={resetAfterComplete ? "reset" : "accumulate"}
                  onChange={(e) => setResetAfterComplete(e.target.value === "reset")}
                >
                  <option value="reset">{t("mpAdmin_stampResetYes")}</option>
                  <option value="accumulate">{t("mpAdmin_stampResetNo")}</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={lineNotifyEnabled}
                  onChange={(e) => setLineNotifyEnabled(e.target.checked)}
                />
                {t("mpAdmin_stampLineNotifyEnabled")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={excludeZeroAmount}
                  onChange={(e) => setExcludeZeroAmount(e.target.checked)}
                />
                {t("mpAdmin_stampExcludeZeroAmount")}
              </label>
            </div>

            <div className="space-y-2">
              <Label>{t("mpAdmin_stampAllowedChannels")}</Label>
              <p className="text-xs text-muted-foreground">{t("mpAdmin_stampAllowedChannelsHint")}</p>
              <div className="flex flex-wrap gap-3">
                {STAMP_CHANNEL_OPTIONS.map((channel) => (
                  <label key={channel} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allowedChannels.includes(channel)}
                      onChange={() => toggleChannel(channel)}
                    />
                    {t(channelLabelKey(channel))}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <Label>{t("mpAdmin_stampCompleteBonusTitle")}</Label>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("mpAdmin_stampCompleteBonusCouponCode")}</Label>
                  <Input
                    value={completeBonusCouponCode}
                    onChange={(e) => setCompleteBonusCouponCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("mpAdmin_stampCompleteBonusPoints")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={completeBonusPoints}
                    onChange={(e) => setCompleteBonusPoints(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>{t("mpAdmin_stampStoreOverridesTitle")}</Label>
                  <p className="text-xs text-muted-foreground">{t("mpAdmin_stampStoreOverridesDesc")}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setStoreOverrideRows((prev) => [...prev, emptyStoreOverride()])}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("mpAdmin_stampStoreOverrideAdd")}
                </Button>
              </div>
              {storeOverrideRows.map((row, idx) => (
                <div key={idx} className="grid gap-2 rounded-lg border p-3 md:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("mpAdmin_stampStoreOverrideCode")}</Label>
                    <Input
                      value={row.storeCode}
                      onChange={(e) =>
                        setStoreOverrideRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, storeCode: e.target.value } : r))
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("mpAdmin_stampStoreOverrideMinOrderAmt")}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.minOrderAmt}
                      onChange={(e) =>
                        setStoreOverrideRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, minOrderAmt: e.target.value } : r))
                        )
                      }
                    />
                  </div>
                  <label className="flex items-end gap-2 pb-2 text-sm md:col-span-1">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) =>
                        setStoreOverrideRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, enabled: e.target.checked } : r))
                        )
                      }
                    />
                    {t("mpAdmin_stampStoreOverrideEnabled")}
                  </label>
                  <div className="flex items-end md:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setStoreOverrideRows((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      {t("mpAdmin_stampMilestoneRemove")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>{t("mpAdmin_stampMilestonesTitle")}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void validateCoupons()}
                    disabled={validating}
                  >
                    {validating ? t("mpAdmin_saving") : t("mpAdmin_stampValidateCoupons")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setMilestones((prev) => [...prev, emptyMilestone()])}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {t("mpAdmin_stampMilestoneAdd")}
                  </Button>
                </div>
              </div>
              {validations.length > 0 ? (
                <AdminTableScroll className="rounded-lg border" hint={false}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="px-3 py-2">{t("mpAdmin_stampMilestoneCount")}</th>
                        <th className="px-3 py-2">{t("mpAdmin_stampMilestoneCoupon")}</th>
                        <th className="px-3 py-2">{t("mpAdmin_stampFailureMessage")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validations.map((v, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-2">{v.stampCount}</td>
                          <td className="px-3 py-2">{v.couponCode || v.rewardType}</td>
                          <td className={`px-3 py-2 ${v.ok ? "text-emerald-700" : "text-destructive"}`}>
                            {v.ok ? "OK" : v.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AdminTableScroll>
              ) : null}
              {milestones.map((row, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border p-3">
                  <div className="grid gap-2 md:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("mpAdmin_stampMilestoneCount")}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={row.stampCount}
                        onChange={(e) =>
                          setMilestones((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, stampCount: e.target.value } : r))
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("mpAdmin_stampMilestoneRewardType")}</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={row.rewardType}
                        onChange={(e) =>
                          setMilestones((prev) =>
                            prev.map((r, i) =>
                              i === idx
                                ? { ...r, rewardType: e.target.value === "points" ? "points" : "coupon" }
                                : r
                            )
                          )
                        }
                      >
                        <option value="coupon">{t("mpAdmin_stampMilestoneRewardTypeCoupon")}</option>
                        <option value="points">{t("mpAdmin_stampMilestoneRewardTypePoints")}</option>
                      </select>
                    </div>
                    {row.rewardType === "points" ? (
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs">{t("mpAdmin_stampMilestoneRewardPoints")}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={row.rewardPoints}
                          onChange={(e) =>
                            setMilestones((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, rewardPoints: e.target.value } : r))
                            )
                          }
                        />
                      </div>
                    ) : (
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs">{t("mpAdmin_stampMilestoneCoupon")}</Label>
                        <Input
                          value={row.couponCode}
                          onChange={(e) =>
                            setMilestones((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, couponCode: e.target.value.toUpperCase() } : r
                              )
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input
                      placeholder={t("mpAdmin_stampMilestoneLabelKo")}
                      value={row.labelKo}
                      onChange={(e) =>
                        setMilestones((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, labelKo: e.target.value } : r))
                        )
                      }
                    />
                    <Input
                      placeholder={t("mpAdmin_stampMilestoneLabelEn")}
                      value={row.labelEn}
                      onChange={(e) =>
                        setMilestones((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, labelEn: e.target.value } : r))
                        )
                      }
                    />
                    <Input
                      placeholder={t("mpAdmin_stampMilestoneLabelTh")}
                      value={row.labelTh}
                      onChange={(e) =>
                        setMilestones((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, labelTh: e.target.value } : r))
                        )
                      }
                    />
                  </div>
                  {milestones.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setMilestones((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      {t("mpAdmin_stampMilestoneRemove")}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <Label>{t("mpAdmin_stampPreviewTitle")}</Label>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">{t("mpAdmin_stampPreviewFilled")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={slotsNum}
                    className="h-8 w-20"
                    value={previewFilled}
                    onChange={(e) => setPreviewFilled(e.target.value)}
                  />
                </div>
              </div>
              <StampCardPreview
                cardSlots={slotsNum}
                filled={previewFilledNum}
                milestoneCounts={milestoneCounts}
                progressLabel={progressLabel}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? t("mpAdmin_saving") : t("mpAdmin_stampSave")}
              </Button>
              <Button type="button" variant="outline" onClick={() => void load()}>
                {t("mpAdmin_reload")}
              </Button>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("mpAdmin_stampStatsTitle")}</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadStats()} disabled={statsLoading}>
            {statsLoading ? t("loading") : t("mpAdmin_reload")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("mpAdmin_stampStatsDesc")}</p>
          {stats ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t("mpAdmin_stampStatsPeriod")
                  .replace("{start}", stats.startYmd)
                  .replace("{end}", stats.endYmd)}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { label: t("mpAdmin_stampStatsTotalEarns"), value: stats.totalEarns },
                  { label: t("mpAdmin_stampStatsUniqueMembers"), value: stats.uniqueMembers },
                  { label: t("mpAdmin_stampStatsMilestoneRewards"), value: stats.milestoneRewards },
                  { label: t("mpAdmin_stampStatsCouponFailures"), value: stats.couponFailures },
                  { label: t("mpAdmin_stampStatsCardCompletions"), value: stats.cardCompletions },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border px-4 py-3">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-xl font-semibold">{item.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
              {stats.storeRows.length > 0 ? (
                <AdminTableScroll className="rounded-lg border" hint={false}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="px-3 py-2">{t("mpAdmin_stampStatsStoreCode")}</th>
                        <th className="px-3 py-2 text-right">{t("mpAdmin_stampStatsEarnCount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.storeRows.map((row) => (
                        <tr key={row.storeCode} className="border-b last:border-0">
                          <td className="px-3 py-2">{row.storeCode || "—"}</td>
                          <td className="px-3 py-2 text-right">{row.earnCount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AdminTableScroll>
              ) : (
                <p className="text-sm text-muted-foreground">{t("mpAdmin_stampStatsEmpty")}</p>
              )}
            </>
          ) : statsLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : null}

          {failures.length > 0 ? (
            <div className="space-y-2">
              <Label>{t("mpAdmin_stampRecentFailuresTitle")}</Label>
              <AdminTableScroll className="rounded-lg border" hint={false}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="px-3 py-2">{t("mpAdmin_stampFailureAt")}</th>
                      <th className="px-3 py-2">{t("mpAdmin_stampFailureMemberId")}</th>
                      <th className="px-3 py-2">{t("mpAdmin_stampFailureCoupon")}</th>
                      <th className="px-3 py-2">{t("mpAdmin_stampFailureMessage")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failures.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">{row.createdAt}</td>
                        <td className="px-3 py-2">{row.memberId}</td>
                        <td className="px-3 py-2">{row.couponCode || "—"}</td>
                        <td className="px-3 py-2 text-destructive">{row.errorMessage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableScroll>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("mpAdmin_stampAdjustTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("mpAdmin_stampAdjustDesc")}</p>
          <fieldset disabled={!canEdit || adjusting} className="space-y-4 disabled:opacity-60">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{t("mpAdmin_stampAdjustMemberId")}</Label>
                <Input
                  value={adjustMemberId}
                  onChange={(e) => setAdjustMemberId(e.target.value)}
                  placeholder="ID / M… / 0xxxxxxxxx"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("mpAdmin_stampAdjustDelta")}</Label>
                <Input
                  type="number"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  placeholder="+1 / -1"
                />
              </div>
              <div className="space-y-1.5 md:col-span-1">
                <Label>{t("mpAdmin_stampAdjustNote")}</Label>
                <Textarea
                  rows={2}
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={() => void submitAdjust()} disabled={adjusting}>
              {adjusting ? t("mpAdmin_saving") : t("mpAdmin_stampAdjustSubmit")}
            </Button>
          </fieldset>
        </CardContent>
      </Card>
    </div>
  )
}

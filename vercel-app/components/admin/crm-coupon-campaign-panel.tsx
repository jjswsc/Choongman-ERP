"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { PlayCircle, Sparkles, Target } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiFetch } from "@/lib/api/fetch"
import { getPosCoupons } from "@/lib/api-client"
import { appAlert } from "@/lib/app-message"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"

type CampaignRow = {
  id: number
  name: string
  status: string
  triggerType: string
  audienceType: string
  audiencePayload: Record<string, unknown>
  couponCode: string
  issueLimit: number
  updatedAt: string
}

type CampaignRunRow = {
  id: number
  runMode: string
  targetCount: number
  issuedCount: number
  skippedCount: number
  failedCount: number
  executedBy: string
  executedAt: string
}

const AUDIENCE_SEGMENT_MAP: Record<string, { audienceType: string; recentDays?: string; dormantDays?: string }> = {
  recent30: { audienceType: "recent", recentDays: "30" },
  dormant90: { audienceType: "dormant", dormantDays: "90" },
  new30: { audienceType: "new_joined", recentDays: "30" },
  vip: { audienceType: "tier" },
  atRisk: { audienceType: "dormant", dormantDays: "60" },
}

function toText(v: unknown): string {
  return String(v ?? "").trim()
}

export function CrmCouponCampaignPanel() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [previewing, setPreviewing] = React.useState(false)
  const [previewCount, setPreviewCount] = React.useState<number | null>(null)
  const [runningId, setRunningId] = React.useState<number | null>(null)
  const [rows, setRows] = React.useState<CampaignRow[]>([])
  const [couponCodes, setCouponCodes] = React.useState<string[]>([])
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [runs, setRuns] = React.useState<CampaignRunRow[]>([])
  const [form, setForm] = React.useState({
    name: "",
    status: "draft",
    triggerType: "manual",
    audienceType: "all",
    couponCode: "",
    issueLimit: "200",
    description: "",
    tierCode: "",
    recentDays: "30",
    dormantDays: "90",
    birthMonth: "",
  })

  React.useEffect(() => {
    const aud = searchParams.get("audience")
    if (!aud || !AUDIENCE_SEGMENT_MAP[aud]) return
    const mapped = AUDIENCE_SEGMENT_MAP[aud]
    setForm((p) => ({
      ...p,
      audienceType: mapped.audienceType,
      tierCode: aud === "vip" ? "VIP" : p.tierCode,
      recentDays: mapped.recentDays || p.recentDays,
      dormantDays: mapped.dormantDays || p.dormantDays,
    }))
  }, [searchParams])

  const loadCampaigns = React.useCallback(async () => {
    const res = await apiFetch("/api/crm/campaigns", { cache: "no-store" })
    const data = (await res.json()) as { success?: boolean; rows?: CampaignRow[] }
    setRows(Array.isArray(data.rows) ? data.rows : [])
  }, [])

  const loadCoupons = React.useCallback(async () => {
    const rows = await getPosCoupons()
    setCouponCodes(
      (rows || [])
        .map((row) => toText(row.code).toUpperCase())
        .filter(Boolean)
        .sort()
    )
  }, [])

  const loadRuns = React.useCallback(async (campaignId: number) => {
    const res = await apiFetch(`/api/crm/campaigns/${campaignId}/results`, { cache: "no-store" })
    const data = (await res.json()) as { success?: boolean; runs?: CampaignRunRow[] }
    setRuns(Array.isArray(data.runs) ? data.runs : [])
  }, [])

  React.useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        await Promise.all([loadCampaigns(), loadCoupons()])
      } finally {
        setLoading(false)
      }
    })()
  }, [loadCampaigns, loadCoupons])

  const buildAudiencePayload = () => {
    const audiencePayload: Record<string, unknown> = {}
    if (form.audienceType === "tier") audiencePayload.tierCode = form.tierCode.trim().toUpperCase()
    if (form.audienceType === "recent") audiencePayload.days = Math.max(1, Number(form.recentDays || 30))
    if (form.audienceType === "dormant") audiencePayload.days = Math.max(1, Number(form.dormantDays || 90))
    if (form.audienceType === "birthday_month") audiencePayload.month = Math.max(1, Number(form.birthMonth || 1))
    if (form.audienceType === "new_joined") audiencePayload.days = Math.max(1, Number(form.recentDays || 30))
    return audiencePayload
  }

  const previewAudience = async () => {
    setPreviewing(true)
    try {
      const res = await apiFetch("/api/crm/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audienceType: form.audienceType,
          audiencePayload: buildAudiencePayload(),
          issueLimit: Math.max(1, Number(form.issueLimit || 200)),
        }),
      })
      const json = (await res.json()) as { success?: boolean; count?: number; capped?: number }
      setPreviewCount(Number(json.count || 0))
    } finally {
      setPreviewing(false)
    }
  }

  const saveCampaign = async () => {
    if (!form.name.trim()) {
      await appAlert(t("crmCampaignNamePh"))
      return
    }
    if (!form.couponCode.trim()) {
      await appAlert(t("crmCouponTabIssue"))
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch("/api/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId || undefined,
          name: form.name.trim(),
          description: form.description.trim(),
          status: form.status,
          triggerType: form.triggerType,
          audienceType: form.audienceType,
          audiencePayload: buildAudiencePayload(),
          couponCode: form.couponCode.trim().toUpperCase(),
          issueLimit: Math.max(1, Number(form.issueLimit || 200)),
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!json.success) {
        await appAlert(json.message || t("crmCampaignSave"))
        return
      }
      await loadCampaigns()
      await appAlert(t("crmCampaignSaved"))
    } finally {
      setSaving(false)
    }
  }

  const runCampaign = async (campaignId: number) => {
    setRunningId(campaignId)
    try {
      const res = await apiFetch(`/api/crm/campaigns/${campaignId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runMode: "manual", reason: "crm_dashboard_manual_run" }),
      })
      const json = (await res.json()) as {
        success?: boolean
        message?: string
        targetCount?: number
        issuedCount?: number
        skippedCount?: number
        failedCount?: number
      }
      if (!json.success) {
        await appAlert(json.message || t("crmCampaignRun"))
        return
      }
      await loadRuns(campaignId)
      await appAlert(
        tr(t, "crmCampaignRunResult", {
          target: String(json.targetCount ?? 0),
          issued: String(json.issuedCount ?? 0),
          skipped: String(json.skippedCount ?? 0),
          failed: String(json.failedCount ?? 0),
        })
      )
    } finally {
      setRunningId(null)
    }
  }

  const pickCampaign = (row: CampaignRow) => {
    setSelectedId(row.id)
    setPreviewCount(null)
    setForm((prev) => ({
      ...prev,
      name: row.name,
      status: row.status || "draft",
      triggerType: row.triggerType || "manual",
      audienceType: row.audienceType || "all",
      couponCode: row.couponCode,
      issueLimit: String(row.issueLimit || 200),
      description: "",
      tierCode: toText(row.audiencePayload?.tierCode),
      recentDays: String(Number(row.audiencePayload?.days || 30)),
      dormantDays: String(Number(row.audiencePayload?.days || 90)),
      birthMonth: toText(row.audiencePayload?.month),
    }))
    void loadRuns(row.id)
  }

  const statusLabel = (v: string) => {
    const map: Record<string, string> = {
      draft: t("crmCampaignStatusDraft"),
      active: t("crmCampaignStatusActive"),
      paused: t("crmCampaignStatusPaused"),
      archived: t("crmCampaignStatusArchived"),
    }
    return map[v] || v
  }

  const audienceLabel = (v: string) => {
    const map: Record<string, string> = {
      all: t("crmCampaignAudienceAll"),
      tier: t("crmCampaignAudienceTier"),
      recent: t("crmCampaignAudienceRecent"),
      dormant: t("crmCampaignAudienceDormant"),
      birthday_month: t("crmCampaignAudienceBirthday"),
      new_joined: t("crmCampaignAudienceNew"),
    }
    return map[v] || v
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("crmCampaignSub")}</p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-rose-500" />
            {t("crmCampaignFormTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Input placeholder={t("crmCampaignNamePh")} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Select value={form.couponCode || "_"} onValueChange={(v) => setForm((p) => ({ ...p, couponCode: v === "_" ? "" : v }))}>
            <SelectTrigger>
              <SelectValue placeholder={t("crmCouponTabDefinitions")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">{t("btnSelect")}</SelectItem>
              {couponCodes.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("crmCampaignStatusDraft")}</SelectItem>
              <SelectItem value="active">{t("crmCampaignStatusActive")}</SelectItem>
              <SelectItem value="paused">{t("crmCampaignStatusPaused")}</SelectItem>
              <SelectItem value="archived">{t("crmCampaignStatusArchived")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={form.triggerType} onValueChange={(v) => setForm((p) => ({ ...p, triggerType: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">{t("crmCampaignTriggerManual")}</SelectItem>
              <SelectItem value="auto">{t("crmCampaignTriggerAuto")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={form.audienceType} onValueChange={(v) => setForm((p) => ({ ...p, audienceType: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("crmCampaignAudienceAll")}</SelectItem>
              <SelectItem value="tier">{t("crmCampaignAudienceTier")}</SelectItem>
              <SelectItem value="recent">{t("crmCampaignAudienceRecent")}</SelectItem>
              <SelectItem value="dormant">{t("crmCampaignAudienceDormant")}</SelectItem>
              <SelectItem value="birthday_month">{t("crmCampaignAudienceBirthday")}</SelectItem>
              <SelectItem value="new_joined">{t("crmCampaignAudienceNew")}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            max={2000}
            placeholder={t("crmCampaignIssueLimitPh")}
            value={form.issueLimit}
            onChange={(e) => setForm((p) => ({ ...p, issueLimit: e.target.value }))}
          />
          {form.audienceType === "tier" ? (
            <Input placeholder={t("crmCampaignTierPh")} value={form.tierCode} onChange={(e) => setForm((p) => ({ ...p, tierCode: e.target.value }))} />
          ) : null}
          {form.audienceType === "recent" || form.audienceType === "new_joined" ? (
            <Input
              type="number"
              min={1}
              placeholder={t("crmCampaignRecentDaysPh")}
              value={form.recentDays}
              onChange={(e) => setForm((p) => ({ ...p, recentDays: e.target.value }))}
            />
          ) : null}
          {form.audienceType === "dormant" ? (
            <Input
              type="number"
              min={1}
              placeholder={t("crmCampaignDormantDaysPh")}
              value={form.dormantDays}
              onChange={(e) => setForm((p) => ({ ...p, dormantDays: e.target.value }))}
            />
          ) : null}
          {form.audienceType === "birthday_month" ? (
            <Input
              type="number"
              min={1}
              max={12}
              placeholder={t("crmCampaignBirthMonthPh")}
              value={form.birthMonth}
              onChange={(e) => setForm((p) => ({ ...p, birthMonth: e.target.value }))}
            />
          ) : null}
          <Input
            className="sm:col-span-2"
            placeholder={t("crmCampaignDescPh")}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button onClick={saveCampaign} disabled={saving}>
              {saving ? t("loading") : t("crmCampaignSave")}
            </Button>
            <Button type="button" variant="outline" onClick={() => void previewAudience()} disabled={previewing}>
              {previewing ? t("loading") : t("crmCampaignPreview")}
            </Button>
            {previewCount != null ? (
              <span className="text-sm text-muted-foreground">
                {tr(t, "crmCampaignPreviewCount", {
                  count: previewCount.toLocaleString(),
                  limit: form.issueLimit,
                })}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedId(null)
                setRuns([])
                setPreviewCount(null)
                setForm({
                  name: "",
                  status: "draft",
                  triggerType: "manual",
                  audienceType: "all",
                  couponCode: "",
                  issueLimit: "200",
                  description: "",
                  tierCode: "",
                  recentDays: "30",
                  dormantDays: "90",
                  birthMonth: "",
                })
              }}
            >
              {t("crmCampaignNew")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-indigo-500" />
            {t("crmCampaignListTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">ID</th>
                    <th className="p-2 text-left">{t("name")}</th>
                    <th className="p-2 text-left">{t("memberCoupons")}</th>
                    <th className="p-2 text-left">{t("type")}</th>
                    <th className="p-2 text-left">{t("status")}</th>
                    <th className="p-2 text-left">{t("date")}</th>
                    <th className="p-2 text-left">{t("apply")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-muted/20">
                      <td className="p-2">{row.id}</td>
                      <td className="p-2 font-medium">{row.name}</td>
                      <td className="p-2 font-mono">{row.couponCode}</td>
                      <td className="p-2">{audienceLabel(row.audienceType)}</td>
                      <td className="p-2">
                        <span className="rounded-full border bg-background px-2 py-0.5 text-xs font-medium">
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="p-2">{row.updatedAt || "—"}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" onClick={() => pickCampaign(row)}>
                            {t("crmCampaignEdit")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => runCampaign(row.id)}
                            disabled={runningId === row.id || row.status === "archived"}
                          >
                            <PlayCircle className="mr-1 h-3.5 w-3.5" />
                            {runningId === row.id ? t("crmCampaignRunning") : t("crmCampaignRun")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-emerald-500" />
            {t("crmCampaignRunsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedId == null ? (
            <p className="text-sm text-muted-foreground">{t("crmCampaignSelectHint")}</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("crmCampaignNoRuns")}</p>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">ID</th>
                    <th className="p-2 text-left">{t("type")}</th>
                    <th className="p-2 text-left">{t("crmCampaignPreview")}</th>
                    <th className="p-2 text-left">{t("crmCouponKpiUsed")}</th>
                    <th className="p-2 text-left">{t("memberFail")}</th>
                    <th className="p-2 text-left">{t("manager")}</th>
                    <th className="p-2 text-left">{t("dateTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-t">
                      <td className="p-2">{run.id}</td>
                      <td className="p-2">{run.runMode}</td>
                      <td className="p-2">{run.targetCount}</td>
                      <td className="p-2">{run.issuedCount}</td>
                      <td className="p-2">{run.failedCount}</td>
                      <td className="p-2">{run.executedBy || "—"}</td>
                      <td className="p-2">{run.executedAt || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

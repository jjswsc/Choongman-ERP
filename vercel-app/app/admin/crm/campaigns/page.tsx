"use client"

import * as React from "react"
import { Megaphone, PlayCircle, Sparkles, Target } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiFetch } from "@/lib/api/fetch"
import { getPosCoupons } from "@/lib/api-client"
import { appAlert } from "@/lib/app-message"
import { CrmSubnav } from "@/components/erp/crm-subnav"

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

function toText(v: unknown): string {
  return String(v ?? "").trim()
}

export default function CrmCampaignsPage() {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
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

  const saveCampaign = async () => {
    if (!form.name.trim()) {
      await appAlert("캠페인 이름을 입력해 주세요.")
      return
    }
    if (!form.couponCode.trim()) {
      await appAlert("쿠폰 코드를 선택해 주세요.")
      return
    }
    const audiencePayload: Record<string, unknown> = {}
    if (form.audienceType === "tier") audiencePayload.tierCode = form.tierCode.trim().toUpperCase()
    if (form.audienceType === "recent") audiencePayload.days = Math.max(1, Number(form.recentDays || 30))
    if (form.audienceType === "dormant") audiencePayload.days = Math.max(1, Number(form.dormantDays || 90))
    if (form.audienceType === "birthday_month") audiencePayload.month = Math.max(1, Number(form.birthMonth || 1))

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
          audiencePayload,
          couponCode: form.couponCode.trim().toUpperCase(),
          issueLimit: Math.max(1, Number(form.issueLimit || 200)),
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!json.success) {
        await appAlert(json.message || "캠페인 저장에 실패했습니다.")
        return
      }
      await loadCampaigns()
      await appAlert("캠페인을 저장했습니다.")
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
        await appAlert(json.message || "캠페인 실행에 실패했습니다.")
        return
      }
      await loadRuns(campaignId)
      await appAlert(
        `실행 완료\n대상 ${json.targetCount ?? 0}명 / 발급 ${json.issuedCount ?? 0} / 중복 ${json.skippedCount ?? 0} / 실패 ${json.failedCount ?? 0}`
      )
    } finally {
      setRunningId(null)
    }
  }

  const pickCampaign = (row: CampaignRow) => {
    setSelectedId(row.id)
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

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <CrmSubnav />
        <div className="rounded-2xl border border-rose-200/60 bg-gradient-to-r from-rose-50 to-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-rose-500/10 p-2 text-rose-600">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">CRM 쿠폰 캠페인 허브</p>
              <p className="text-xs text-muted-foreground">
                타겟 조건으로 쿠폰을 자동 발급하고, 실행 결과를 즉시 확인합니다.
              </p>
            </div>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-rose-500" />
              CRM 쿠폰 캠페인 설정
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Input
              placeholder="캠페인 이름"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            <Select value={form.couponCode || "_"} onValueChange={(v) => setForm((p) => ({ ...p, couponCode: v === "_" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="쿠폰 코드 선택" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">선택</SelectItem>
                {couponCodes.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">draft</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="paused">paused</SelectItem>
                <SelectItem value="archived">archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={form.triggerType} onValueChange={(v) => setForm((p) => ({ ...p, triggerType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">manual</SelectItem>
                <SelectItem value="auto">auto</SelectItem>
              </SelectContent>
            </Select>
            <Select value={form.audienceType} onValueChange={(v) => setForm((p) => ({ ...p, audienceType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 회원</SelectItem>
                <SelectItem value="tier">등급 기반</SelectItem>
                <SelectItem value="recent">최근 방문</SelectItem>
                <SelectItem value="dormant">휴면 고객</SelectItem>
                <SelectItem value="birthday_month">생일 월</SelectItem>
                <SelectItem value="new_joined">신규 가입</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              max={2000}
              placeholder="발급 상한"
              value={form.issueLimit}
              onChange={(e) => setForm((p) => ({ ...p, issueLimit: e.target.value }))}
            />
            {form.audienceType === "tier" ? (
              <Input
                placeholder="등급 코드 (예: GOLD)"
                value={form.tierCode}
                onChange={(e) => setForm((p) => ({ ...p, tierCode: e.target.value }))}
              />
            ) : null}
            {form.audienceType === "recent" ? (
              <Input
                type="number"
                min={1}
                placeholder="최근 N일"
                value={form.recentDays}
                onChange={(e) => setForm((p) => ({ ...p, recentDays: e.target.value }))}
              />
            ) : null}
            {form.audienceType === "dormant" ? (
              <Input
                type="number"
                min={1}
                placeholder="휴면 기준 N일"
                value={form.dormantDays}
                onChange={(e) => setForm((p) => ({ ...p, dormantDays: e.target.value }))}
              />
            ) : null}
            {form.audienceType === "birthday_month" ? (
              <Input
                type="number"
                min={1}
                max={12}
                placeholder="생일 월 (1~12)"
                value={form.birthMonth}
                onChange={(e) => setForm((p) => ({ ...p, birthMonth: e.target.value }))}
              />
            ) : null}
            <Input
              className="sm:col-span-2"
              placeholder="설명"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <Button onClick={saveCampaign} disabled={saving}>{saving ? "저장 중..." : "캠페인 저장"}</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedId(null)
                  setRuns([])
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
                신규 입력
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-500" />
              캠페인 목록
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">로딩 중...</p>
            ) : (
              <div className="overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-left">ID</th>
                      <th className="p-2 text-left">이름</th>
                      <th className="p-2 text-left">쿠폰</th>
                      <th className="p-2 text-left">대상</th>
                      <th className="p-2 text-left">상태</th>
                      <th className="p-2 text-left">수정일</th>
                      <th className="p-2 text-left">동작</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t hover:bg-muted/20">
                        <td className="p-2">{row.id}</td>
                        <td className="p-2 font-medium">{row.name}</td>
                        <td className="p-2 font-mono">{row.couponCode}</td>
                        <td className="p-2">{row.audienceType}</td>
                        <td className="p-2">
                          <span className="rounded-full border bg-background px-2 py-0.5 text-xs font-medium">
                            {row.status}
                          </span>
                        </td>
                        <td className="p-2">{row.updatedAt || "-"}</td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="outline" onClick={() => pickCampaign(row)}>편집</Button>
                            <Button
                              size="sm"
                              onClick={() => runCampaign(row.id)}
                              disabled={runningId === row.id || row.status === "archived"}
                            >
                              <PlayCircle className="mr-1 h-3.5 w-3.5" />
                              {runningId === row.id ? "실행 중..." : "즉시 실행"}
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
              최근 실행 이력
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedId == null ? (
              <p className="text-sm text-muted-foreground">캠페인을 선택하면 실행 이력이 표시됩니다.</p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">실행 이력이 없습니다.</p>
            ) : (
              <div className="overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-left">실행ID</th>
                      <th className="p-2 text-left">모드</th>
                      <th className="p-2 text-left">대상</th>
                      <th className="p-2 text-left">발급</th>
                      <th className="p-2 text-left">중복</th>
                      <th className="p-2 text-left">실패</th>
                      <th className="p-2 text-left">실행자</th>
                      <th className="p-2 text-left">시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id} className="border-t hover:bg-muted/20">
                        <td className="p-2">{run.id}</td>
                        <td className="p-2">{run.runMode}</td>
                        <td className="p-2">{run.targetCount}</td>
                        <td className="p-2">{run.issuedCount}</td>
                        <td className="p-2">{run.skippedCount}</td>
                        <td className="p-2">{run.failedCount}</td>
                        <td className="p-2">{run.executedBy || "-"}</td>
                        <td className="p-2">{run.executedAt || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


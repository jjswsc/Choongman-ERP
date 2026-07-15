"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Filter, Gift, Search, UserRound, Users } from "lucide-react"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import {
  getMembers,
  getPosCoupons,
  issueMemberCoupon,
  type PosCoupon,
} from "@/lib/api-client"
import { apiFetch } from "@/lib/api/fetch"
import { getBangkokDateTimeString } from "@/lib/bangkok-time"
import { couponsForMemberIssue, formatCouponBenefit, redemptionModeLabel } from "@/lib/crm-coupon-admin"

type IssueMode = "single" | "bulk"

export function CrmCouponIssuePanel() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const [mode, setMode] = React.useState<IssueMode>("single")
  const [memberQuery, setMemberQuery] = React.useState("")
  const [memberResults, setMemberResults] = React.useState<
    Array<{ id: number; memberNo: string; name: string; phone: string }>
  >([])
  const [selectedMemberId, setSelectedMemberId] = React.useState<number | null>(null)
  const [coupons, setCoupons] = React.useState<PosCoupon[]>([])
  const [couponCode, setCouponCode] = React.useState("")
  const [searching, setSearching] = React.useState(false)
  const [issuing, setIssuing] = React.useState(false)
  const [previewing, setPreviewing] = React.useState(false)
  const [previewCount, setPreviewCount] = React.useState<number | null>(null)
  const [issueLimit, setIssueLimit] = React.useState("200")
  const [bulkFilter, setBulkFilter] = React.useState({
    gender: "",
    ageMin: "",
    ageMax: "",
    joinFrom: "",
    joinTo: "",
    joinStoreCode: "",
    tierCode: "",
  })

  React.useEffect(() => {
    getPosCoupons()
      .then((rows) => setCoupons(couponsForMemberIssue(rows || [])))
      .catch(() => setCoupons([]))
  }, [])

  React.useEffect(() => {
    const memberId = Number(searchParams.get("memberId") || 0)
    if (!memberId) return
    setMode("single")
    // id 검색이 빠져 있으면 이름·전화 ilike로 엉뚱한 회원이 잡힐 수 있음 → 단건 API 우선
    void (async () => {
      try {
        const res = await apiFetch(`/api/members/${memberId}`, { cache: "no-store" })
        const data = (await res.json()) as {
          success?: boolean
          member?: { id: number; memberNo?: string; name?: string; fullName?: string; phone?: string }
        }
        const m = data.success ? data.member : null
        if (m?.id) {
          setSelectedMemberId(m.id)
          setMemberQuery(m.memberNo || m.phone || m.name || String(m.id))
          setMemberResults([
            {
              id: m.id,
              memberNo: m.memberNo || "",
              name: m.name || m.fullName || "",
              phone: m.phone || "",
            },
          ])
          return
        }
      } catch {
        /* fallback below */
      }
      try {
        const rows = await getMembers({ q: String(memberId), limit: 5 })
        const m = rows.find((x) => x.id === memberId) || rows[0]
        if (!m) return
        setSelectedMemberId(m.id)
        setMemberQuery(m.memberNo || m.phone || m.name || String(m.id))
        setMemberResults([
          { id: m.id, memberNo: m.memberNo, name: m.name || m.fullName || "", phone: m.phone || "" },
        ])
      } catch {
        /* ignore */
      }
    })()
  }, [searchParams])

  const searchMembers = React.useCallback(async () => {
    const q = memberQuery.trim()
    if (!q) {
      setMemberResults([])
      return
    }
    setSearching(true)
    try {
      const rows = await getMembers({ q, limit: 20 })
      setMemberResults(
        (rows || []).map((m) => ({
          id: m.id,
          memberNo: m.memberNo,
          name: m.name || m.fullName || "",
          phone: m.phone || "",
        }))
      )
    } catch {
      setMemberResults([])
    } finally {
      setSearching(false)
    }
  }, [memberQuery])

  const selectedMember = memberResults.find((m) => m.id === selectedMemberId) ?? null
  const selectedCoupon = coupons.find((c) => c.code === couponCode) ?? null

  const buildBulkPayload = () => {
    const audiencePayload: Record<string, unknown> = {}
    if (bulkFilter.gender === "M" || bulkFilter.gender === "F") audiencePayload.gender = bulkFilter.gender
    if (bulkFilter.ageMin.trim()) audiencePayload.ageMin = Math.max(0, Number(bulkFilter.ageMin))
    if (bulkFilter.ageMax.trim()) audiencePayload.ageMax = Math.max(0, Number(bulkFilter.ageMax))
    if (bulkFilter.joinFrom.trim()) audiencePayload.joinFrom = bulkFilter.joinFrom.trim()
    if (bulkFilter.joinTo.trim()) audiencePayload.joinTo = bulkFilter.joinTo.trim()
    if (bulkFilter.joinStoreCode.trim()) audiencePayload.joinStoreCode = bulkFilter.joinStoreCode.trim()
    if (bulkFilter.tierCode.trim()) audiencePayload.tierCode = bulkFilter.tierCode.trim().toUpperCase()
    return audiencePayload
  }

  const previewBulk = async () => {
    setPreviewing(true)
    try {
      const res = await apiFetch("/api/crm/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audienceType: "filter",
          audiencePayload: buildBulkPayload(),
          issueLimit: Math.max(1, Number(issueLimit || 200)),
        }),
      })
      const json = (await res.json()) as { success?: boolean; count?: number; message?: string }
      if (!json.success && json.message) {
        await appAlert(json.message)
        setPreviewCount(null)
        return
      }
      setPreviewCount(Number(json.count || 0))
    } finally {
      setPreviewing(false)
    }
  }

  const issueBulk = async () => {
    const code = couponCode.trim().toUpperCase()
    if (!code) {
      await appAlert(t("crmCouponIssueBulkNeedCoupon"))
      return
    }
    if (previewCount == null) {
      await appAlert(t("crmCouponIssueBulkNeedPreview"))
      return
    }
    if (previewCount <= 0) {
      await appAlert(t("crmCampaignPreviewCount").replace("{count}", "0").replace("{limit}", issueLimit))
      return
    }
    const limit = Math.max(1, Number(issueLimit || 200))
    const ok = await appConfirm(
      tr(t, "crmCouponIssueBulkConfirm", {
        count: String(previewCount),
        limit: String(limit),
      })
    )
    if (!ok) return

    setIssuing(true)
    try {
      const stamp = getBangkokDateTimeString().slice(0, 16)
      const saveRes = await apiFetch("/api/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${t("crmCouponIssueBulkName")} ${stamp}`,
          description: t("crmCouponIssueBulkHint"),
          status: "draft",
          triggerType: "manual",
          audienceType: "filter",
          audiencePayload: buildBulkPayload(),
          couponCode: code,
          issueLimit: limit,
        }),
      })
      const saveJson = (await saveRes.json()) as { success?: boolean; id?: number; message?: string }
      if (!saveJson.success || !saveJson.id) {
        await appAlert(saveJson.message || t("crmCampaignSave"))
        return
      }
      const runRes = await apiFetch(`/api/crm/campaigns/${saveJson.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runMode: "manual", reason: "issue_panel_bulk_filter" }),
      })
      const runJson = (await runRes.json()) as {
        success?: boolean
        message?: string
        targetCount?: number
        issuedCount?: number
        skippedCount?: number
        failedCount?: number
      }
      if (!runJson.success) {
        await appAlert(runJson.message || t("crmCampaignRun"))
        return
      }
      await appAlert(
        tr(t, "crmCampaignRunResult", {
          target: String(runJson.targetCount ?? 0),
          issued: String(runJson.issuedCount ?? 0),
          skipped: String(runJson.skippedCount ?? 0),
          failed: String(runJson.failedCount ?? 0),
        })
      )
      setCouponCode("")
      setPreviewCount(null)
    } finally {
      setIssuing(false)
    }
  }

  const issue = async () => {
    const memberId = selectedMemberId ?? 0
    const code = couponCode.trim().toUpperCase()
    if (!memberId || !code) {
      await appAlert(t("crmCouponIssueNeedMember") || "회원과 쿠폰을 선택해 주세요.")
      return
    }
    setIssuing(true)
    try {
      const res = await issueMemberCoupon({ memberId, couponCode: code })
      if (!res.success) {
        await appAlert(res.message || t("memberCouponsIssueFail"))
        return
      }
      const memberLabel = selectedMember
        ? `${selectedMember.name} · ${selectedMember.memberNo}`
        : ""
      await appAlert(
        `${t("crmCouponIssueDone") || "쿠폰을 발급했습니다. 회원앱 「내 혜택」과 POS에서 사용할 수 있습니다."}${
          memberLabel ? `\n\n회원: ${memberLabel}\n회원앱 「내 정보」의 회원번호와 일치하는지 확인해 주세요.` : ""
        }`
      )
      setCouponCode("")
    } finally {
      setIssuing(false)
    }
  }

  const couponPicker = (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Gift className="h-4 w-4 text-emerald-500" />
        {t("crmCouponIssueSelect") || "발급할 쿠폰"}
      </h3>
      <Select value={couponCode || "_"} onValueChange={(v) => setCouponCode(v === "_" ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder={t("crmCouponIssueSelectPh") || "쿠폰 선택"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_">{t("crmCouponIssueSelectPh") || "쿠폰 선택"}</SelectItem>
          {coupons.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.code} · {c.name || c.code} · {formatCouponBenefit(c, t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {coupons.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("crmCouponIssueMemberIssueOnly") ||
            "「회원 발급」 유형의 활성 쿠폰만 지급할 수 있습니다. 쿠폰 정의 탭에서 사용 방식을 확인해 주세요."}
        </p>
      ) : null}
      {selectedCoupon ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{redemptionModeLabel(selectedCoupon.redemptionMode, t)}</Badge>
          {(selectedCoupon.validFrom || selectedCoupon.validTo) && (
            <Badge variant="secondary">
              {selectedCoupon.validFrom || "—"} ~ {selectedCoupon.validTo || "—"}
            </Badge>
          )}
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "single" ? "default" : "outline"}
          onClick={() => setMode("single")}
        >
          <UserRound className="mr-1.5 h-3.5 w-3.5" />
          {t("crmCouponIssueModeSingle")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "bulk" ? "default" : "outline"}
          onClick={() => {
            setMode("bulk")
            setPreviewCount(null)
          }}
        >
          <Users className="mr-1.5 h-3.5 w-3.5" />
          {t("crmCouponIssueModeBulk")}
        </Button>
      </div>

      {mode === "single" ? (
        <>
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <UserRound className="h-4 w-4 text-indigo-500" />
              {t("crmCouponIssueMemberSearch") || "회원 검색"}
            </h3>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void searchMembers()
              }}
            >
              <Input
                placeholder={t("memberCouponsSearchPh") || "회원번호 · 이름 · 전화"}
                value={memberQuery}
                onChange={(e) => {
                  setMemberQuery(e.target.value)
                  setSelectedMemberId(null)
                }}
              />
              <Button type="submit" variant="outline" disabled={searching}>
                <Search className="h-4 w-4" />
                <span className="sr-only">{t("btn_query") || "검색"}</span>
              </Button>
            </form>
            <div className="mt-3 space-y-1">
              {memberResults.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMemberId(m.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selectedMemberId === m.id ? "border-indigo-400 bg-indigo-50" : "hover:bg-muted/40"
                  }`}
                >
                  <span className="font-medium">{m.name || t("memberNoName") || "(이름 없음)"}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.memberNo} · {m.phone || `ID ${m.id}`}
                  </span>
                </button>
              ))}
              {memberQuery.trim() && !searching && memberResults.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("memberCouponsSearchEmpty") || "검색 결과가 없습니다."}</p>
              ) : null}
            </div>
          </div>

          {couponPicker}

          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4">
            <p className="text-sm font-medium text-emerald-950">
              {selectedMember
                ? `${selectedMember.name} (${selectedMember.memberNo})`
                : t("crmCouponIssueNoMember") || "회원을 선택하세요"}
            </p>
            <p className="mt-1 text-xs text-emerald-900/80">
              {selectedCoupon
                ? `${selectedCoupon.code} · ${formatCouponBenefit(selectedCoupon, t)}`
                : t("crmCouponIssueNoCoupon") || "쿠폰을 선택하세요"}
            </p>
            <Button className="mt-3" onClick={issue} disabled={issuing || !selectedMemberId || !couponCode}>
              {issuing ? t("crmCouponIssuing") || "발급 중..." : t("memberCouponsIssue") || "즉시 발급"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Filter className="h-4 w-4 text-indigo-500" />
              {t("crmCampaignAudienceFilter")}
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">{t("crmCouponIssueBulkHint")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={bulkFilter.gender || "_"}
                onValueChange={(v) => {
                  setBulkFilter((p) => ({ ...p, gender: v === "_" ? "" : v }))
                  setPreviewCount(null)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("crmCampaignFilterGender")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">{t("crmCampaignFilterGenderAll")}</SelectItem>
                  <SelectItem value="M">{t("crmCampaignFilterGenderM")}</SelectItem>
                  <SelectItem value="F">{t("crmCampaignFilterGenderF")}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                max={120}
                placeholder={t("crmCampaignFilterAgeMin")}
                value={bulkFilter.ageMin}
                onChange={(e) => {
                  setBulkFilter((p) => ({ ...p, ageMin: e.target.value }))
                  setPreviewCount(null)
                }}
              />
              <Input
                type="number"
                min={0}
                max={120}
                placeholder={t("crmCampaignFilterAgeMax")}
                value={bulkFilter.ageMax}
                onChange={(e) => {
                  setBulkFilter((p) => ({ ...p, ageMax: e.target.value }))
                  setPreviewCount(null)
                }}
              />
              <Input
                type="date"
                value={bulkFilter.joinFrom}
                onChange={(e) => {
                  setBulkFilter((p) => ({ ...p, joinFrom: e.target.value }))
                  setPreviewCount(null)
                }}
                aria-label={t("crmCampaignFilterJoinFrom")}
              />
              <Input
                type="date"
                value={bulkFilter.joinTo}
                onChange={(e) => {
                  setBulkFilter((p) => ({ ...p, joinTo: e.target.value }))
                  setPreviewCount(null)
                }}
                aria-label={t("crmCampaignFilterJoinTo")}
              />
              <Input
                placeholder={t("crmCampaignFilterJoinStore")}
                value={bulkFilter.joinStoreCode}
                onChange={(e) => {
                  setBulkFilter((p) => ({ ...p, joinStoreCode: e.target.value }))
                  setPreviewCount(null)
                }}
              />
              <Input
                placeholder={t("crmCampaignTierPh")}
                value={bulkFilter.tierCode}
                onChange={(e) => {
                  setBulkFilter((p) => ({ ...p, tierCode: e.target.value }))
                  setPreviewCount(null)
                }}
              />
              <Input
                type="number"
                min={1}
                max={2000}
                placeholder={t("crmCampaignIssueLimitPh")}
                value={issueLimit}
                onChange={(e) => {
                  setIssueLimit(e.target.value)
                  setPreviewCount(null)
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("crmCampaignFilterHint")}</p>
          </div>

          {couponPicker}

          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4">
            <p className="text-sm font-medium text-emerald-950">
              {selectedCoupon
                ? `${selectedCoupon.code} · ${formatCouponBenefit(selectedCoupon, t)}`
                : t("crmCouponIssueNoCoupon") || "쿠폰을 선택하세요"}
            </p>
            {previewCount != null ? (
              <p className="mt-1 text-xs text-emerald-900/80">
                {tr(t, "crmCampaignPreviewCount", {
                  count: previewCount.toLocaleString(),
                  limit: issueLimit,
                })}
              </p>
            ) : (
              <p className="mt-1 text-xs text-emerald-900/80">{t("crmCouponIssueBulkNeedPreview")}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void previewBulk()} disabled={previewing}>
                {previewing ? t("loading") : t("crmCampaignPreview")}
              </Button>
              <Button onClick={() => void issueBulk()} disabled={issuing || !couponCode || previewCount == null}>
                {issuing ? t("crmCouponIssuing") || "발급 중..." : t("crmCouponIssueModeBulk")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

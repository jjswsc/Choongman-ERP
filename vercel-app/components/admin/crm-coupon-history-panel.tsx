"use client"

import * as React from "react"
import Link from "next/link"
import { History, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  cancelMemberCouponIssue,
  cancelMemberCouponIssueDuplicates,
  getMemberCoupons,
  getPosCoupons,
} from "@/lib/api-client"
import { appAlert, appConfirm } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  couponIssueStatusLabel,
  filterMemberCouponIssues,
  formatCouponBenefit,
  type MemberCouponIssueRow,
} from "@/lib/crm-coupon-admin"
import { cn } from "@/lib/utils"

function toRow(raw: Awaited<ReturnType<typeof getMemberCoupons>>[number]): MemberCouponIssueRow {
  return {
    id: raw.id,
    memberId: raw.memberId,
    memberNo: raw.memberNo,
    memberName: raw.memberName,
    couponCode: raw.couponCode,
    couponName: raw.couponName || raw.couponCode,
    discountType: raw.discountType || "fixed",
    discountValue: Number(raw.discountValue || 0),
    minOrderAmt: Number(raw.minOrderAmt || 0),
    validTo: raw.validTo || "",
    issuedAt: raw.issuedAt,
    expiresAt: raw.expiresAt || "",
    usedAt: raw.usedAt,
    orderId: raw.orderId,
    status: raw.status,
    campaignId: raw.campaignId ?? null,
    campaignName: raw.campaignName || "",
  }
}

type DuplicateGroup = {
  memberId: number
  memberNo?: string
  couponCode: string
  rows: MemberCouponIssueRow[]
}

export function CrmCouponHistoryPanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const [rows, setRows] = React.useState<MemberCouponIssueRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [cancellingId, setCancellingId] = React.useState<number | null>(null)
  const [cancellingDupKey, setCancellingDupKey] = React.useState<string | null>(null)
  const [q, setQ] = React.useState("")
  const [status, setStatus] = React.useState("all")
  const [couponCode, setCouponCode] = React.useState("all")
  const [couponCodes, setCouponCodes] = React.useState<string[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [issues, masters] = await Promise.all([
        getMemberCoupons({
          limit: 500,
          status: status !== "all" ? status : undefined,
          couponCode: couponCode !== "all" ? couponCode : undefined,
          q: q.trim() || undefined,
        }),
        getPosCoupons(),
      ])
      setRows((issues || []).map(toRow))
      setCouponCodes(
        Array.from(new Set((masters || []).map((c) => String(c.code || "").trim().toUpperCase()).filter(Boolean))).sort()
      )
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [status, couponCode, q])

  React.useEffect(() => {
    const timer = setTimeout(() => {
      load().catch(() => {})
    }, 250)
    return () => clearTimeout(timer)
  }, [load])

  const displayRows = React.useMemo(
    () => filterMemberCouponIssues(rows, { q, status, couponCode: couponCode === "all" ? "" : couponCode }),
    [rows, q, status, couponCode]
  )

  const duplicateGroups = React.useMemo(() => {
    const map = new Map<string, DuplicateGroup>()
    for (const row of displayRows) {
      if (String(row.status || "").toLowerCase() !== "issued") continue
      const key = `${row.memberId}:${row.couponCode}`
      const existing = map.get(key)
      if (existing) {
        existing.rows.push(row)
      } else {
        map.set(key, {
          memberId: row.memberId,
          memberNo: row.memberNo,
          couponCode: row.couponCode,
          rows: [row],
        })
      }
    }
    return Array.from(map.values()).filter((group) => group.rows.length > 1)
  }, [displayRows])

  const handleCancelDuplicates = async (group: DuplicateGroup) => {
    const count = group.rows.length
    const ok = await appConfirm(t("crmCouponCancelDuplicatesConfirm").replace("{count}", String(count)))
    if (!ok) return
    const dupKey = `${group.memberId}:${group.couponCode}`
    setCancellingDupKey(dupKey)
    try {
      const res = await cancelMemberCouponIssueDuplicates({
        memberId: group.memberId,
        couponCode: group.couponCode,
        keepNewest: true,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("processFail"))
        return
      }
      await appAlert(t("crmCouponCancelDuplicatesDone").replace("{count}", String(res.cancelledCount || 0)))
      await load()
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCancellingDupKey(null)
    }
  }

  const statusBadgeClass = (st: string) => {
    const s = String(st || "").toLowerCase()
    if (s === "issued") return "bg-emerald-100 text-emerald-800"
    if (s === "used") return "bg-slate-200 text-slate-800"
    if (s === "expired") return "bg-amber-100 text-amber-900"
    if (s === "cancelled") return "bg-rose-100 text-rose-800"
    return "bg-muted text-muted-foreground"
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <label className="text-xs text-muted-foreground">{t("crmCouponHistorySearch") || "검색"}</label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("crmCouponHistorySearchPh") || "회원 · 쿠폰 · 캠페인"}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("crmCouponHistoryStatus") || "상태"}</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="mt-1 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("crmCouponFilterAll") || "전체"}</SelectItem>
              <SelectItem value="issued">{couponIssueStatusLabel("issued", t)}</SelectItem>
              <SelectItem value="used">{couponIssueStatusLabel("used", t)}</SelectItem>
              <SelectItem value="expired">{couponIssueStatusLabel("expired", t)}</SelectItem>
              <SelectItem value="cancelled">{couponIssueStatusLabel("cancelled", t)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("posCouponCode") || "쿠폰"}</label>
          <Select value={couponCode} onValueChange={setCouponCode}>
            <SelectTrigger className="mt-1 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("crmCouponFilterAll") || "전체"}</SelectItem>
              {couponCodes.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RotateCw className={cn("mr-1 h-4 w-4", loading && "animate-spin")} />
          {t("posRefresh") || "새로고침"}
        </Button>
      </div>

      {duplicateGroups.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
          <p className="text-xs font-medium text-amber-900">
            {t("crmCouponCancelDuplicates")} — {duplicateGroups.length}
          </p>
          <div className="flex flex-wrap gap-2">
            {duplicateGroups.map((group) => {
              const dupKey = `${group.memberId}:${group.couponCode}`
              const busy = cancellingDupKey === dupKey
              return (
                <Button
                  key={dupKey}
                  variant="outline"
                  size="sm"
                  className="h-8 border-amber-300 bg-white text-xs"
                  disabled={busy || loading}
                  onClick={() => handleCancelDuplicates(group)}
                >
                  {group.memberNo || group.memberId} · {group.couponCode} ({group.rows.length})
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <History className="h-4 w-4 text-sky-500" />
          <h3 className="text-sm font-semibold">{t("crmCouponHistoryTitle") || "발급 · 사용 이력"}</h3>
          <Badge variant="secondary" className="ml-auto">
            {displayRows.length}
          </Badge>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">{t("memberNo") || "회원번호"}</th>
                <th className="p-3 font-medium">{t("crmCouponColName") || "이름"}</th>
                <th className="p-3 font-medium">{t("posCouponCode") || "쿠폰"}</th>
                <th className="p-3 font-medium">{t("crmCouponBenefit") || "혜택"}</th>
                <th className="p-3 font-medium">{t("crmCouponIssuedAt") || "발급"}</th>
                <th className="p-3 font-medium">{t("crmCouponExpiresAt") || "만료"}</th>
                <th className="p-3 font-medium">{t("crmCouponUsedAt") || "사용"}</th>
                <th className="p-3 font-medium">{t("crmCouponOrderId") || "주문"}</th>
                <th className="p-3 font-medium">{t("crmCouponColStatus") || "상태"}</th>
                <th className="p-3 font-medium">{t("crmCouponColActions") || "관리"}</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    {loading ? t("loading") : t("crmCouponHistoryEmpty") || "이력이 없습니다."}
                  </td>
                </tr>
              ) : (
                displayRows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs">
                      <Link href={`/admin/members?memberId=${r.memberId}`} className="text-primary hover:underline">
                        {r.memberNo || r.memberId}
                      </Link>
                    </td>
                    <td className="p-3">{r.memberName || "—"}</td>
                    <td className="p-3">
                      <div className="font-mono font-semibold">{r.couponCode}</div>
                      {r.couponName !== r.couponCode ? (
                        <div className="text-xs text-muted-foreground">{r.couponName}</div>
                      ) : null}
                      {r.campaignName ? (
                        <div className="text-[11px] text-indigo-600">{r.campaignName}</div>
                      ) : null}
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatCouponBenefit({ discountType: r.discountType, discountValue: r.discountValue }, t)}
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">{r.issuedAt || "—"}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{r.expiresAt || r.validTo || "—"}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{r.usedAt || "—"}</td>
                    <td className="p-3 text-xs">
                      {r.orderId ? (
                        <Link href={`/admin/pos-orders?orderId=${r.orderId}`} className="text-primary hover:underline">
                          #{r.orderId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(r.status)}`}>
                        {couponIssueStatusLabel(r.status, t)}
                      </span>
                    </td>
                    <td className="p-3">
                      {(() => {
                        const st = String(r.status || "").toLowerCase()
                        if (st !== "issued" && st !== "used") return "—"
                        const confirmKey =
                          st === "used" ? "crmCouponCancelUsedConfirm" : "crmCouponCancelIssueConfirm"
                        return (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={cancellingId === r.id || loading}
                            onClick={async () => {
                              const ok = await appConfirm(t(confirmKey))
                              if (!ok) return
                              setCancellingId(r.id)
                              try {
                                const res = await cancelMemberCouponIssue({ issueId: r.id })
                                if (!res.success) {
                                  await appAlert(translateApiMessage(res.message, t) || t("processFail"))
                                  return
                                }
                                await appAlert(
                                  st === "used" ? t("crmCouponCancelUsedDone") : t("crmCouponCancelIssueDone")
                                )
                                await load()
                              } catch (e) {
                                await appAlert(
                                  t("processFail") + ": " + (e instanceof Error ? e.message : String(e))
                                )
                              } finally {
                                setCancellingId(null)
                              }
                            }}
                          >
                            {t("crmCouponCancelIssue")}
                          </Button>
                        )
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

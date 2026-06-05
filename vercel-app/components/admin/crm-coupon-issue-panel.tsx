"use client"

import * as React from "react"
import { Gift, Search, UserRound } from "lucide-react"
import { appAlert } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMembers,
  getPosCoupons,
  issueMemberCoupon,
  type PosCoupon,
} from "@/lib/api-client"
import { couponsForMemberIssue, formatCouponBenefit, redemptionModeLabel } from "@/lib/crm-coupon-admin"

export function CrmCouponIssuePanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const [memberQuery, setMemberQuery] = React.useState("")
  const [memberResults, setMemberResults] = React.useState<
    Array<{ id: number; memberNo: string; name: string; phone: string }>
  >([])
  const [selectedMemberId, setSelectedMemberId] = React.useState<number | null>(null)
  const [coupons, setCoupons] = React.useState<PosCoupon[]>([])
  const [couponCode, setCouponCode] = React.useState("")
  const [searching, setSearching] = React.useState(false)
  const [issuing, setIssuing] = React.useState(false)

  React.useEffect(() => {
    getPosCoupons()
      .then((rows) => setCoupons(couponsForMemberIssue(rows || [])))
      .catch(() => setCoupons([]))
  }, [])

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

  React.useEffect(() => {
    const timer = setTimeout(() => {
      searchMembers().catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [searchMembers])

  const selectedMember = memberResults.find((m) => m.id === selectedMemberId) ?? null
  const selectedCoupon = coupons.find((c) => c.code === couponCode) ?? null

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
      await appAlert(t("crmCouponIssueDone") || "쿠폰을 발급했습니다. 회원앱 「내 혜택」과 POS에서 사용할 수 있습니다.")
      setCouponCode("")
    } finally {
      setIssuing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <UserRound className="h-4 w-4 text-indigo-500" />
          {t("crmCouponIssueMemberSearch") || "회원 검색"}
        </h3>
        <div className="flex gap-2">
          <Input
            placeholder={t("memberCouponsSearchPh") || "회원번호 · 이름 · 전화"}
            value={memberQuery}
            onChange={(e) => {
              setMemberQuery(e.target.value)
              setSelectedMemberId(null)
            }}
          />
          <Button variant="outline" onClick={() => searchMembers()} disabled={searching}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
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
    </div>
  )
}

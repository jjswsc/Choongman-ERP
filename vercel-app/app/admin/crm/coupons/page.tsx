"use client"

import * as React from "react"
import Link from "next/link"
import { Gift, Search, Ticket } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { appAlert } from "@/lib/app-message"
import { apiFetch } from "@/lib/api/fetch"
import { getMembers, getPosCoupons } from "@/lib/api-client"
import { CrmSubnav } from "@/components/erp/crm-subnav"

type MemberCouponIssueRow = {
  id: number
  memberId: number
  couponCode: string
  issuedAt: string
  usedAt: string
  status: string
}

export default function CrmCouponsPage() {
  const [memberId, setMemberId] = React.useState("")
  const [couponCode, setCouponCode] = React.useState("")
  const [members, setMembers] = React.useState<Array<{ id: number; memberNo: string; name: string }>>([])
  const [couponCodes, setCouponCodes] = React.useState<string[]>([])
  const [rows, setRows] = React.useState<MemberCouponIssueRow[]>([])
  const [issuing, setIssuing] = React.useState(false)

  const loadData = React.useCallback(async () => {
    const [membersRes, couponMasterRes, issueRes] = await Promise.all([
      getMembers({ limit: 200 }),
      getPosCoupons(),
      apiFetch(`/api/member-coupons?limit=300&memberId=${encodeURIComponent(memberId || "0")}`, { cache: "no-store" }),
    ])
    const issueRows = (await issueRes.json()) as MemberCouponIssueRow[]
    setMembers((membersRes || []).map((m) => ({ id: m.id, memberNo: m.memberNo, name: m.name })))
    setCouponCodes(
      (couponMasterRes || [])
        .map((c) => String(c.code || "").trim().toUpperCase())
        .filter(Boolean)
        .sort()
    )
    setRows(Array.isArray(issueRows) ? issueRows : [])
  }, [memberId])

  React.useEffect(() => {
    loadData().catch(() => {})
  }, [loadData])

  const issueCoupon = async () => {
    const id = Number(memberId || 0)
    const code = couponCode.trim().toUpperCase()
    if (!id || !code) {
      await appAlert("회원 ID와 쿠폰 코드를 입력해 주세요.")
      return
    }
    setIssuing(true)
    try {
      const res = await apiFetch("/api/member-coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: id, couponCode: code }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!json.success) {
        await appAlert(json.message || "쿠폰 발급에 실패했습니다.")
        return
      }
      setCouponCode("")
      await loadData()
      await appAlert("쿠폰을 발급했습니다.")
    } finally {
      setIssuing(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <CrmSubnav />
        <div className="rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50 to-cyan-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-500/10 p-2 text-indigo-600">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">수동 쿠폰 발급 센터</p>
              <p className="text-xs text-muted-foreground">
                VIP 케어/CS 보상 등 즉시 발급이 필요한 케이스를 빠르게 처리합니다.
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-indigo-500" />
              CRM 쿠폰 수동 발급
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                placeholder="memberId"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              />
              <Input
                placeholder="쿠폰 코드"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              />
              <Button onClick={issueCoupon} disabled={issuing}>
                {issuing ? "발급 중..." : "즉시 발급"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              쿠폰 코드는 POS 쿠폰 마스터의 코드와 일치해야 합니다. 자동 타겟 발급은
              <Link href="/admin/crm/campaigns" className="ml-1 underline underline-offset-2">
                CRM 캠페인
              </Link>
              에서 실행하세요.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-4 w-4 text-sky-500" />
              POS 쿠폰 코드 목록
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {couponCodes.map((code) => (
                <div key={code} className="rounded-lg border bg-background px-2 py-1 font-mono text-sm shadow-sm">
                  {code}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>회원 리스트 (요약)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">ID</th>
                    <th className="p-2 text-left">Member No</th>
                    <th className="p-2 text-left">이름</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-t hover:bg-muted/20">
                      <td className="p-2">{m.id}</td>
                      <td className="p-2">{m.memberNo}</td>
                      <td className="p-2 font-medium">{m.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>회원 쿠폰 발급/사용 이력</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">memberId</th>
                    <th className="p-2 text-left">coupon</th>
                    <th className="p-2 text-left">issuedAt</th>
                    <th className="p-2 text-left">usedAt</th>
                    <th className="p-2 text-left">status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="p-2">{r.memberId}</td>
                      <td className="p-2 font-mono">{r.couponCode}</td>
                      <td className="p-2">{r.issuedAt || "-"}</td>
                      <td className="p-2">{r.usedAt || "-"}</td>
                      <td className="p-2">
                        <span className="rounded-full border bg-background px-2 py-0.5 text-xs font-medium">
                          {r.status || "-"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


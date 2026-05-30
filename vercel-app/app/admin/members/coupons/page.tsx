"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MemberSubnav } from "@/components/erp/member-subnav"
import { getMemberCoupons, getMembers, getPosCoupons, issueMemberCoupon } from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function MemberCouponsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [memberId, setMemberId] = React.useState("")
  const [couponCode, setCouponCode] = React.useState("")
  const [masterCoupons, setMasterCoupons] = React.useState<Array<{ code: string; name: string }>>([])
  const [members, setMembers] = React.useState<Array<{ id: number; memberNo: string; name: string }>>([])
  const [rows, setRows] = React.useState<Array<{ id: number; memberId: number; couponCode: string; issuedAt: string; usedAt: string; status: string }>>([])

  const load = React.useCallback(async () => {
    const [issues, memberList, coupons] = await Promise.all([
      getMemberCoupons({ memberId: Number(memberId || 0) || undefined, limit: 300 }),
      getMembers({ limit: 300 }),
      getPosCoupons(),
    ])
    setRows(issues as typeof rows)
    setMembers(memberList.map((m) => ({ id: m.id, memberNo: m.memberNo, name: m.name })))
    setMasterCoupons((coupons || []).map((c: { code?: string; name?: string }) => ({ code: String(c.code || ''), name: String(c.name || '') })))
  }, [memberId])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <MemberSubnav />
        <Card className="mb-4">
          <CardHeader><CardTitle>{t("memberCouponsIssueTitle")}</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder={t("memberId")} value={memberId} onChange={(e) => setMemberId(e.target.value)} />
            <Input placeholder={t("memberCouponsCodePh")} value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} />
            <Button
              onClick={async () => {
                const id = Number(memberId || 0)
                if (!id || !couponCode.trim()) return
                const res = await issueMemberCoupon({ memberId: id, couponCode: couponCode.trim().toUpperCase() })
                if (!res.success) await appAlert(res.message || t("memberCouponsIssueFail"))
                setCouponCode("")
                await load()
              }}
            >
              {t("memberCouponsIssue")}
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader><CardTitle>{t("memberCouponsMasterTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-1 text-sm">
              {masterCoupons.map((c) => (
                <div key={c.code} className="rounded border px-2 py-1">{c.code} - {c.name}</div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader><CardTitle>{t("memberList")}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40"><tr><th className="p-2 text-left">ID</th><th className="p-2 text-left">{t("memberNo")}</th><th className="p-2 text-left">{t("name")}</th></tr></thead>
                <tbody>
                  {members.map((m) => <tr className="border-t" key={m.id}><td className="p-2">{m.id}</td><td className="p-2">{m.memberNo}</td><td className="p-2">{m.name}</td></tr>)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("memberCouponsHistoryTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40"><tr><th className="p-2 text-left">memberId</th><th className="p-2 text-left">coupon</th><th className="p-2 text-left">issuedAt</th><th className="p-2 text-left">usedAt</th><th className="p-2 text-left">status</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.memberId}</td>
                      <td className="p-2">{r.couponCode}</td>
                      <td className="p-2">{r.issuedAt}</td>
                      <td className="p-2">{r.usedAt || "-"}</td>
                      <td className="p-2">{r.status}</td>
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

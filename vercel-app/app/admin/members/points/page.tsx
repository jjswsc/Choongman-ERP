"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { adjustMemberPoints, getMemberPoints, getMembers } from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function MemberPointsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [memberId, setMemberId] = React.useState("")
  const [deltaPoints, setDeltaPoints] = React.useState("0")
  const [note, setNote] = React.useState("")
  const [members, setMembers] = React.useState<Array<{ id: number; name: string; memberNo: string; pointBalance?: number }>>([])
  const [rows, setRows] = React.useState<Array<{ id: number; memberId: number; kind: string; points: number; amount: number; note: string; createdAt: string }>>([])

  const load = React.useCallback(async () => {
    const id = Number(memberId || 0)
    const [list, points] = await Promise.all([
      getMembers({ limit: 300 }),
      getMemberPoints({ memberId: id || undefined, limit: 300 }),
    ])
    setMembers(list.map((m) => ({ id: m.id, name: m.name, memberNo: m.memberNo, pointBalance: m.pointBalance })))
    setRows(points as typeof rows)
  }, [memberId])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t("memberPointsAdjustTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-4">
            <Input placeholder={t("memberId")} value={memberId} onChange={(e) => setMemberId(e.target.value)} />
            <Input placeholder={t("memberPointsDeltaPh")} value={deltaPoints} onChange={(e) => setDeltaPoints(e.target.value)} />
            <Input placeholder={t("reason")} value={note} onChange={(e) => setNote(e.target.value)} />
            <Button
              onClick={async () => {
                const id = Number(memberId || 0)
                const p = Number(deltaPoints || 0)
                if (!id || !p) return
                const res = await adjustMemberPoints({ memberId: id, points: p, note })
                if (!res.success) await appAlert(res.message || t("memberPointsAdjustFail"))
                setDeltaPoints("0")
                setNote("")
                await load()
              }}
            >
              {t("apply")}
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader><CardTitle>{t("memberPointsBalanceTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr><th className="p-2 text-left">ID</th><th className="p-2 text-left">{t("memberNo")}</th><th className="p-2 text-left">{t("name")}</th><th className="p-2 text-left">{t("memberPointsBalance")}</th></tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="p-2">{m.id}</td>
                      <td className="p-2">{m.memberNo}</td>
                      <td className="p-2">{m.name}</td>
                      <td className="p-2">{Number(m.pointBalance || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("memberPointsLedgerTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr><th className="p-2 text-left">{t("date")}</th><th className="p-2 text-left">{t("memberId")}</th><th className="p-2 text-left">{t("type")}</th><th className="p-2 text-left">{t("points")}</th><th className="p-2 text-left">{t("amount")}</th><th className="p-2 text-left">{t("memo")}</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.createdAt}</td>
                      <td className="p-2">{r.memberId}</td>
                      <td className="p-2">{r.kind}</td>
                      <td className="p-2">{r.points}</td>
                      <td className="p-2">{Number(r.amount || 0).toLocaleString()}</td>
                      <td className="p-2">{r.note}</td>
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

"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MemberSubnav } from "@/components/erp/member-subnav"
import { adjustMemberPoints, getMemberPoints, getMembers } from "@/lib/api-client"

export default function MemberPointsPage() {
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
        <MemberSubnav />
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>포인트 수기 조정</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-4">
            <Input placeholder="memberId" value={memberId} onChange={(e) => setMemberId(e.target.value)} />
            <Input placeholder="+/- 포인트" value={deltaPoints} onChange={(e) => setDeltaPoints(e.target.value)} />
            <Input placeholder="사유" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button
              onClick={async () => {
                const id = Number(memberId || 0)
                const p = Number(deltaPoints || 0)
                if (!id || !p) return
                const res = await adjustMemberPoints({ memberId: id, points: p, note })
                if (!res.success) alert(res.message || "조정 실패")
                setDeltaPoints("0")
                setNote("")
                await load()
              }}
            >
              적용
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader><CardTitle>회원 포인트 잔액</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr><th className="p-2 text-left">ID</th><th className="p-2 text-left">회원번호</th><th className="p-2 text-left">이름</th><th className="p-2 text-left">잔액</th></tr>
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
          <CardHeader><CardTitle>포인트 원장</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr><th className="p-2 text-left">일시</th><th className="p-2 text-left">memberId</th><th className="p-2 text-left">유형</th><th className="p-2 text-left">포인트</th><th className="p-2 text-left">금액</th><th className="p-2 text-left">비고</th></tr>
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

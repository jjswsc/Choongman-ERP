"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getLineMembers, getMembers, linkMemberLine, unlinkMemberLine } from "@/lib/api-client"

export default function MemberLinePage() {
  const [rows, setRows] = React.useState<Array<{
    member: { id: number; name: string; memberNo: string; lineLinked: boolean }
    identity: { providerUserId: string; displayName: string; status: string }
  }>>([])
  const [members, setMembers] = React.useState<Array<{ id: number; name: string; memberNo: string }>>([])
  const [query, setQuery] = React.useState("")
  const [memberId, setMemberId] = React.useState("")
  const [lineUserId, setLineUserId] = React.useState("")

  const load = React.useCallback(async () => {
    const [lineList, memberList] = await Promise.all([getLineMembers({ q: query, limit: 200 }), getMembers({ limit: 300 })])
    setRows(lineList as typeof rows)
    setMembers(memberList.map((m) => ({ id: m.id, name: m.name, memberNo: m.memberNo })))
  }, [query])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>LINE 회원 연결</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="memberId (숫자)" value={memberId} onChange={(e) => setMemberId(e.target.value)} />
            <Input placeholder="lineUserId" value={lineUserId} onChange={(e) => setLineUserId(e.target.value)} />
            <Button
              onClick={async () => {
                const id = Number(memberId || 0)
                if (!id || !lineUserId.trim()) return
                const res = await linkMemberLine({ memberId: id, lineUserId: lineUserId.trim() })
                if (!res.success) alert(res.message || "연결 실패")
                setLineUserId("")
                await load()
              }}
            >
              연결
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>LINE 회원 목록</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="LINE ID/이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
              <Button variant="outline" onClick={() => load()}>검색</Button>
            </div>
            <p className="text-xs text-muted-foreground">등록 회원: {members.length.toLocaleString()}명</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-left">회원번호</th>
                    <th className="p-2 text-left">회원명</th>
                    <th className="p-2 text-left">LINE User ID</th>
                    <th className="p-2 text-left">LINE 표시명</th>
                    <th className="p-2 text-left">상태</th>
                    <th className="p-2 text-left">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.member.id}-${row.identity.providerUserId}`} className="border-t">
                      <td className="p-2">{row.member.memberNo}</td>
                      <td className="p-2">{row.member.name}</td>
                      <td className="p-2">{row.identity.providerUserId}</td>
                      <td className="p-2">{row.identity.displayName || "-"}</td>
                      <td className="p-2">{row.identity.status}</td>
                      <td className="p-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const res = await unlinkMemberLine({ memberId: row.member.id, lineUserId: row.identity.providerUserId })
                            if (!res.success) alert(res.message || "해제 실패")
                            await load()
                          }}
                        >
                          연결 해제
                        </Button>
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

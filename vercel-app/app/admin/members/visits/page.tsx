"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getMemberVisits } from "@/lib/api-client"

export default function MemberVisitsPage() {
  const [memberId, setMemberId] = React.useState("")
  const [rows, setRows] = React.useState<Array<{
    orderId: number
    memberId: number
    memberNo: string
    storeCode: string
    orderNo: string
    total: number
    visitedAt: string
  }>>([])

  const load = React.useCallback(async () => {
    const id = Number(memberId || 0)
    const list = await getMemberVisits({ memberId: id || undefined, limit: 500 })
    setRows(list)
  }, [memberId])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Card className="mb-4">
          <CardHeader><CardTitle>회원 방문 기록 조회</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder="memberId (비우면 전체)" value={memberId} onChange={(e) => setMemberId(e.target.value)} />
            <Button variant="outline" onClick={() => load()}>조회</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>방문/주문 이력</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-left">주문일시</th>
                    <th className="p-2 text-left">memberId</th>
                    <th className="p-2 text-left">회원번호</th>
                    <th className="p-2 text-left">매장</th>
                    <th className="p-2 text-left">주문번호</th>
                    <th className="p-2 text-left">결제금액</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.orderId} className="border-t">
                      <td className="p-2">{r.visitedAt}</td>
                      <td className="p-2">{r.memberId}</td>
                      <td className="p-2">{r.memberNo}</td>
                      <td className="p-2">{r.storeCode}</td>
                      <td className="p-2">{r.orderNo}</td>
                      <td className="p-2">{Number(r.total || 0).toLocaleString()}</td>
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

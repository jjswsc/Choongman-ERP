"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getMemberTiers, recalculateMemberTier, saveMemberTier } from "@/lib/api-client"

type TierRow = { code: string; name: string; min_amount: number; point_rate: number }

export default function MemberTiersPage() {
  const [rows, setRows] = React.useState<TierRow[]>([])
  const [code, setCode] = React.useState("BRONZE")
  const [name, setName] = React.useState("Bronze")
  const [minAmount, setMinAmount] = React.useState("0")
  const [pointRate, setPointRate] = React.useState("0.01")

  const load = React.useCallback(async () => {
    const tiers = await getMemberTiers()
    setRows(tiers as TierRow[])
  }, [])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Card className="mb-4">
          <CardHeader><CardTitle>등급 규칙 관리</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-5">
            <Input placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <Input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="최소 누적금액" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
            <Input placeholder="적립율(0.01=1%)" value={pointRate} onChange={(e) => setPointRate(e.target.value)} />
            <Button
              onClick={async () => {
                const res = await saveMemberTier({
                  code: code.trim(),
                  name: name.trim(),
                  minAmount: Number(minAmount || 0),
                  pointRate: Number(pointRate || 0),
                })
                if (!res.success) await appAlert(res.message || "저장 실패")
                await load()
              }}
            >
              저장
            </Button>
          </CardContent>
        </Card>
        <Card className="mb-4">
          <CardHeader><CardTitle>등급 재계산</CardTitle></CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={async () => {
                const res = await recalculateMemberTier()
                if (!res.success) await appAlert(res.message || "재계산 실패")
                else await appAlert(`재계산 완료: ${res.updated ?? 0}명`)
              }}
            >
              전체 회원 등급 재계산
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>등급 목록</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40"><tr><th className="p-2 text-left">코드</th><th className="p-2 text-left">이름</th><th className="p-2 text-left">최소 누적금액</th><th className="p-2 text-left">적립율</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code} className="border-t cursor-pointer hover:bg-muted/20" onClick={() => {
                      setCode(r.code)
                      setName(r.name)
                      setMinAmount(String(r.min_amount))
                      setPointRate(String(r.point_rate))
                    }}>
                      <td className="p-2">{r.code}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{Number(r.min_amount || 0).toLocaleString()}</td>
                      <td className="p-2">{Number(r.point_rate || 0)}</td>
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

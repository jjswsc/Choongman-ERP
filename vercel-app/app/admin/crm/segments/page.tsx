"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { apiFetch } from "@/lib/api/fetch"

type SegmentKey = "recent30" | "dormant90" | "new30" | "vip" | "atRisk"

type SegmentRow = {
  id: number
  name: string
  phone: string
  tierCode: string
  pointBalance: number
  lifetimeAmount: number
}

const SEGMENTS: Array<{ key: SegmentKey; label: string }> = [
  { key: "recent30", label: "최근 30일 방문 고객" },
  { key: "dormant90", label: "휴면 고객(90일)" },
  { key: "new30", label: "신규 고객(30일)" },
  { key: "vip", label: "VIP 고객" },
  { key: "atRisk", label: "이탈 위험 고객" },
]

export default function CrmSegmentsPage() {
  const [segment, setSegment] = React.useState<SegmentKey>("recent30")
  const [rows, setRows] = React.useState<SegmentRow[]>([])
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/crm/segments?segment=${segment}&limit=1000`, { cache: "no-store" })
      if (!res.ok) {
        setRows([])
        return
      }
      const data = (await res.json()) as { success: boolean; rows?: SegmentRow[] }
      setRows(data.rows || [])
    } finally {
      setLoading(false)
    }
  }, [segment])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <CrmSubnav />
        <Card>
          <CardHeader><CardTitle>고객 세그먼트</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {SEGMENTS.map((s) => (
                <Button
                  key={s.key}
                  variant={segment === s.key ? "default" : "outline"}
                  onClick={() => setSegment(s.key)}
                >
                  {s.label}
                </Button>
              ))}
              <Button variant="outline" onClick={() => load()} disabled={loading}>
                {loading ? "조회 중..." : "새로고침"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">대상 {rows.length.toLocaleString()}명</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">세그먼트 결과</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-left">이름</th>
                    <th className="p-2 text-left">전화번호</th>
                    <th className="p-2 text-left">등급</th>
                    <th className="p-2 text-left">포인트</th>
                    <th className="p-2 text-left">누적매출</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.phone}</td>
                      <td className="p-2">{r.tierCode}</td>
                      <td className="p-2">{Number(r.pointBalance || 0).toLocaleString()}</td>
                      <td className="p-2">{Number(r.lifetimeAmount || 0).toLocaleString()}</td>
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


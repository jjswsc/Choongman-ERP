"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api/fetch"

type RfmRow = {
  memberId: number
  recencyDays: number
  frequencyCount: number
  monetaryAmount: number
  rScore: number
  fScore: number
  mScore: number
  rfmScore: string
}

export default function CrmRfmPage() {
  const [rows, setRows] = React.useState<RfmRow[]>([])
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/crm/rfm?limit=500", { cache: "no-store" })
      if (!res.ok) {
        setRows([])
        return
      }
      const data = (await res.json()) as { success: boolean; rows?: RfmRow[] }
      setRows(data.rows || [])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>RFM 점수</CardTitle>
            <Button variant="outline" onClick={() => load()} disabled={loading}>
              {loading ? "계산 중..." : "새로고침"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-left">memberId</th>
                    <th className="p-2 text-left">Recency(day)</th>
                    <th className="p-2 text-left">Frequency</th>
                    <th className="p-2 text-left">Monetary</th>
                    <th className="p-2 text-left">R</th>
                    <th className="p-2 text-left">F</th>
                    <th className="p-2 text-left">M</th>
                    <th className="p-2 text-left">RFM</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.memberId} className="border-t">
                      <td className="p-2">{r.memberId}</td>
                      <td className="p-2">{r.recencyDays}</td>
                      <td className="p-2">{r.frequencyCount}</td>
                      <td className="p-2">{Number(r.monetaryAmount || 0).toLocaleString()}</td>
                      <td className="p-2">{r.rScore}</td>
                      <td className="p-2">{r.fScore}</td>
                      <td className="p-2">{r.mScore}</td>
                      <td className="p-2 font-semibold">{r.rfmScore}</td>
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


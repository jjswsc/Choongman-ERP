'use client'

import * as React from 'react'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type OpsKpi = {
  orderSuccess: number
  orderFailed: number
  paymentFailed: number
  printFailed: number
  printQueued: number
  closePending: number
}

type OpsAlert = {
  code: string
  severity: 'warning' | 'critical'
  message: string
}

export default function AdminOpsCenterPage() {
  const [loading, setLoading] = React.useState(false)
  const [date] = React.useState(() =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  )
  const [kpi, setKpi] = React.useState<OpsKpi | null>(null)
  const [alerts, setAlerts] = React.useState<OpsAlert[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [kpiRes, alertRes] = await Promise.all([
        fetch(`/api/ops/kpi?date=${encodeURIComponent(date)}`, { cache: 'no-store', credentials: 'same-origin' }),
        fetch(`/api/ops/alerts?date=${encodeURIComponent(date)}`, { cache: 'no-store', credentials: 'same-origin' }),
      ])
      const kpiJson = (await kpiRes.json().catch(() => ({}))) as { kpi?: OpsKpi }
      const alertJson = (await alertRes.json().catch(() => ({}))) as { alerts?: OpsAlert[] }
      setKpi(kpiJson?.kpi || null)
      setAlerts(Array.isArray(alertJson?.alerts) ? alertJson.alerts : [])
    } finally {
      setLoading(false)
    }
  }, [date])

  React.useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Ops Center</h1>
          <p className="text-sm text-muted-foreground">주문/결제/인쇄/일마감 운영 지표</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={load} disabled={loading}>
          <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[
          ['주문 성공', kpi?.orderSuccess ?? 0],
          ['주문 실패', kpi?.orderFailed ?? 0],
          ['결제 실패', kpi?.paymentFailed ?? 0],
          ['인쇄 실패', kpi?.printFailed ?? 0],
          ['인쇄 대기', kpi?.printQueued ?? 0],
          ['마감 대기', kpi?.closePending ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{Number(value).toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="rounded-md border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Alerts</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">현재 경보 없음</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li
                key={`${a.code}-${a.message}`}
                className={`rounded px-3 py-2 text-sm ${
                  a.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                [{a.code}] {a.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

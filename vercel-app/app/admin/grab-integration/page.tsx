"use client"

import * as React from "react"
import { RefreshCw, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getGrabStoreIntegrations, type GrabStoreIntegrationSnapshot } from "@/lib/api-client"
import { cn } from "@/lib/utils"

function formatBangkokDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return "-"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(dt)
}

export default function GrabIntegrationPage() {
  const [loading, setLoading] = React.useState(false)
  const [rows, setRows] = React.useState<GrabStoreIntegrationSnapshot[]>([])
  const [status, setStatus] = React.useState("all")
  const [partnerMerchantID, setPartnerMerchantID] = React.useState("")
  const [autoRefresh, setAutoRefresh] = React.useState(true)
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    getGrabStoreIntegrations({
      status: status !== "all" ? status : undefined,
      partnerMerchantID: partnerMerchantID.trim() || undefined,
      limit: 500,
    })
      .then((list) => {
        setRows(Array.isArray(list) ? list : [])
        setLastRefreshedAt(new Date().toISOString())
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [status, partnerMerchantID])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return
      load()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, load])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Link2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Grab 연동 상태</h1>
            <p className="text-xs text-muted-foreground">
              Grab 매장 연동 상태(Active/Syncing/Failed)를 조회합니다.
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="ACTIVE">ACTIVE</SelectItem>
              <SelectItem value="INACTIVE">INACTIVE</SelectItem>
              <SelectItem value="SYNCING">SYNCING</SelectItem>
              <SelectItem value="FAILED">FAILED</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="partnerMerchantID 검색"
            value={partnerMerchantID}
            onChange={(e) => setPartnerMerchantID(e.target.value)}
            className="h-9 w-[300px] max-w-full text-sm"
          />
          <Button size="sm" className="h-9 gap-1.5 px-4" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            조회
          </Button>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            15초 자동 새로고침
          </label>
          <span className="text-xs text-muted-foreground">
            마지막 갱신: {formatBangkokDateTime(lastRefreshedAt)}
          </span>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-[11px] font-bold text-center w-24">상태</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">grabMerchantID</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">partnerMerchantID</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">lastRequestID</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[240px]">lastMessage</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-center w-44">updatedAt (BKK)</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                      조회된 Grab 연동 상태가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-xs",
                            row.integrationStatus === "ACTIVE" && "bg-emerald-50 text-emerald-700",
                            row.integrationStatus === "SYNCING" && "bg-amber-50 text-amber-700",
                            row.integrationStatus === "FAILED" && "bg-rose-50 text-rose-700",
                            row.integrationStatus === "INACTIVE" && "bg-muted text-muted-foreground"
                          )}
                        >
                          {row.integrationStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px]">{row.grabMerchantID || "-"}</td>
                      <td className="px-4 py-3 font-mono text-[11px]">{row.partnerMerchantID || "-"}</td>
                      <td className="px-4 py-3 font-mono text-[11px]">{row.lastRequestID || "-"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{row.lastMessage || "-"}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {formatBangkokDateTime(row.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarIcon, Search, Megaphone, FileText, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { getMyNotices, type NoticeItem } from "@/lib/api-client"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function isRead(status: string) {
  return /^(확인|Read|확인함)$/.test(String(status || "").trim())
}

export function NoticesPanel() {
  const { auth } = useAuth()
  const [startDate, setStartDate] = React.useState(() => daysAgoStr(30))
  const [endDate, setEndDate] = React.useState(todayStr)
  const [notices, setNotices] = React.useState<NoticeItem[]>([])
  const [loading, setLoading] = React.useState(false)

  const fetchNotices = React.useCallback(() => {
    if (!auth?.store || !auth?.user) return
    setLoading(true)
    getMyNotices({ store: auth.store, name: auth.user })
      .then(setNotices)
      .catch(() => setNotices([]))
      .finally(() => setLoading(false))
  }, [auth?.store, auth?.user])

  React.useEffect(() => {
    fetchNotices()
  }, [fetchNotices])

  const filtered = React.useMemo(() => {
    return notices.filter((n) => {
      const d = (n.date || "").slice(0, 10)
      return d >= startDate && d <= endDate
    })
  }, [notices, startDate, endDate])

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">받은 공지</h3>
            <p className="text-[11px] text-muted-foreground">
              날짜 범위를 선택하면 지나간 공지도 조회할 수 있습니다.
            </p>
          </div>
        </div>
        <Link
          href="/admin/notices"
          className="text-xs font-medium text-primary hover:underline shrink-0"
        >
          전체 보기
        </Link>
      </div>

      <div className="px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              시작일
            </label>
            <div className="relative">
              <CalendarIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 w-40 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              종료일
            </label>
            <div className="relative">
              <CalendarIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 w-40 pl-8 text-xs"
              />
            </div>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs" onClick={fetchNotices}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            조회
          </Button>
        </div>
      </div>

      <div className="border-t">
        {loading ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              조회된 공지가 없습니다.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              날짜 범위를 변경하여 다시 조회해 보세요.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y">
            {filtered.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
              >
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    !isRead(n.status) ? "bg-destructive/10" : "bg-muted"
                  }`}
                >
                  <Bell
                    className={`h-3 w-3 ${
                      !isRead(n.status) ? "text-destructive" : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {n.date} · {n.sender}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

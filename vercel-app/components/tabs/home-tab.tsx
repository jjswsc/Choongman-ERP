"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getMyNotices, type NoticeItem } from "@/lib/api-client"
import { Megaphone, Bell, Search } from "lucide-react"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function isRead(status: string) {
  return /^(확인|Read|확인함)$/.test(String(status || '').trim())
}

export function HomeTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [notices, setNotices] = useState<NoticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'All' | 'Unread' | 'Read'>('Unread') // 첫화면: 미확인 기본
  const [dateFrom, setDateFrom] = useState(() => daysAgoStr(30)) // 기본: 최근 30일
  const [dateTo, setDateTo] = useState(todayStr)

  const fetchNotices = useCallback(() => {
    if (!auth?.store || !auth?.user) return
    setLoading(true)
    getMyNotices({ store: auth.store, name: auth.user })
      .then(setNotices)
      .catch(() => setNotices([]))
      .finally(() => setLoading(false))
  }, [auth?.store, auth?.user])

  useEffect(() => {
    fetchNotices()
  }, [fetchNotices])

  const filteredNotices = useMemo(() => {
    let list = notices
    if (statusFilter === 'Unread') {
      list = list.filter((n) => !isRead(n.status))
    } else if (statusFilter === 'Read') {
      list = list.filter((n) => isRead(n.status))
    }
    if (dateFrom) list = list.filter((n) => (n.date || '').slice(0, 10) >= dateFrom)
    if (dateTo) list = list.filter((n) => (n.date || '').slice(0, 10) <= dateTo)
    return [...list].sort((a, b) => {
      const aUnread = !isRead(a.status)
      const bUnread = !isRead(b.status)
      if (aUnread && !bUnread) return -1
      if (!aUnread && bUnread) return 1
      return (b.date || '').localeCompare(a.date || '')
    })
  }, [notices, statusFilter, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Welcome Banner */}
      <div className="overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
        <h2 className="text-xl font-bold text-foreground">{t('welcome')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('welcomeSub')}</p>
      </div>

      {/* Notices Section */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Megaphone className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t('noticeBoard')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'All' | 'Unread' | 'Read')}>
              <SelectTrigger className="h-9 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t('noticeFilterAll')}</SelectItem>
                <SelectItem value="Unread">{t('noticeFilterUnread')}</SelectItem>
                <SelectItem value="Read">{t('noticeFilterRead')}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="date-input-compact h-9 flex-1 min-w-0 text-xs"
              aria-label={t('dateFrom')}
            />
            <span className="text-xs text-muted-foreground shrink-0">~</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="date-input-compact h-9 flex-1 min-w-0 text-xs"
              aria-label={t('dateTo')}
            />
            <Button size="icon" className="h-9 w-9 shrink-0" type="button" onClick={() => fetchNotices()} title={t('search')}>
              <Search className="h-3.5 w-3.5" />
            </Button>
          </div>

          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t('loadingNotices')}</div>
          ) : filteredNotices.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t('noNotices')}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredNotices.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-muted/50"
                >
                  <div
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      n.status === "New" || !isRead(n.status) ? "bg-destructive/10" : "bg-primary/10"
                    }`}
                  >
                    <Bell className={`h-3 w-3 ${n.status === "New" || !isRead(n.status) ? "text-destructive" : "text-primary"}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

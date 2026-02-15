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
import { getMyNotices, translateTexts, type NoticeItem } from "@/lib/api-client"
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
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<'All' | 'Unread' | 'Read'>('Unread') // 첫화면: 미확인 기본
  const [dateFrom, setDateFrom] = useState(() => daysAgoStr(30)) // 기본: 최근 30일
  const [dateTo, setDateTo] = useState(todayStr)
  const [transMap, setTransMap] = useState<Record<string, string>>({})

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

  useEffect(() => {
    const texts = [...new Set(filteredNotices.flatMap((n) => [n.title, n.content].filter(Boolean)))]
    if (texts.length === 0) {
      setTransMap({})
      return
    }
    let cancelled = false
    translateTexts(texts, lang).then((translated) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      texts.forEach((txt, i) => { map[txt] = translated[i] ?? txt })
      setTransMap(map)
    }).catch(() => setTransMap({}))
    return () => { cancelled = true }
  }, [filteredNotices, lang])

  const getTrans = (text: string) => (text && transMap[text]) || text || ""

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Welcome Banner */}
      <div className="overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
        <h2 className="text-xl font-bold text-foreground">{t('welcome')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('welcomeSub')}</p>
      </div>

      {/* 공지사항 */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Megaphone className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t('noticeBoard')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {/* 1행: 미확인 필터 + 검색 버튼 */}
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'All' | 'Unread' | 'Read')}>
                <SelectTrigger className="h-9 min-w-[100px] flex-1 text-xs sm:flex-initial sm:w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{t('noticeFilterAll')}</SelectItem>
                  <SelectItem value="Unread">{t('noticeFilterUnread')}</SelectItem>
                  <SelectItem value="Read">{t('noticeFilterRead')}</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" className="h-9 w-9 shrink-0" type="button" onClick={() => fetchNotices()} title={t('search')}>
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
            {/* 2행: 날짜 검색창 */}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 flex-1 min-w-0 text-xs"
                aria-label={t('dateFrom')}
              />
              <span className="text-xs text-muted-foreground shrink-0">~</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 flex-1 min-w-0 text-xs"
                aria-label={t('dateTo')}
              />
            </div>
          </div>

          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t('loadingNotices')}</div>
          ) : filteredNotices.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t('noNotices')}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredNotices.map((n) => {
                const isExpanded = expandedId === n.id
                return (
                  <div
                    key={n.id}
                    className="rounded-lg border border-border/60 overflow-hidden transition-colors hover:bg-muted/50"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : n.id)}
                      className="flex w-full items-start gap-3 p-3 text-left active:bg-muted/30"
                    >
                      <div
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          n.status === "New" || !isRead(n.status) ? "bg-destructive/10" : "bg-primary/10"
                        }`}
                      >
                        <Bell className={`h-3 w-3 ${n.status === "New" || !isRead(n.status) ? "text-destructive" : "text-primary"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{getTrans(n.title)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.date}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{isExpanded ? "▲" : "▼"}</span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border/60 bg-muted/20 px-3 py-3">
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                          {n.content ? getTrans(n.content) : "(내용 없음)"}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import * as React from "react"
import Link from "next/link"
import { Search, Megaphone, FileText, Bell, ChevronDown, ChevronUp } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { getMyNotices, confirmNoticeRead, translateTexts, type NoticeItem } from "@/lib/api-client"

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
  const { lang } = useLang()
  const t = useT(lang)
  const [startDate, setStartDate] = React.useState(() => daysAgoStr(30))
  const [endDate, setEndDate] = React.useState(todayStr)
  const [notices, setNotices] = React.useState<NoticeItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [expandedId, setExpandedId] = React.useState<number | null>(null)
  const [transMap, setTransMap] = React.useState<Record<string, string>>({})
  const [confirmingId, setConfirmingId] = React.useState<number | null>(null)

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

  React.useEffect(() => {
    const texts = [...new Set(filtered.flatMap((n) => [n.title, n.content].filter(Boolean)))]
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
  }, [filtered, lang])

  const getTrans = (text: string) => (text && transMap[text]) || text || ""

  const handleNoticeAction = React.useCallback(
    async (noticeId: number, action: '확인' | '다음에') => {
      if (!auth?.store || !auth?.user) return
      if (action === '다음에') {
        setExpandedId(null)
        return
      }
      setConfirmingId(noticeId)
      try {
        const res = await confirmNoticeRead({ noticeId, store: auth.store, name: auth.user, action })
        if (res.success) {
          setNotices((prev) =>
            prev.map((n) => (n.id === noticeId ? { ...n, status: '확인' } : n))
          )
          setExpandedId(null)
        }
      } catch {
        // ignore
      } finally {
        setConfirmingId(null)
      }
    },
    [auth?.store, auth?.user]
  )

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">{t("adminReceivedNotices")}</h3>
            <p className="text-[11px] text-muted-foreground">
              {t("adminNoticeDateHint")}
            </p>
          </div>
        </div>
        <Link
          href="/admin/notices"
          className="text-xs font-medium text-primary hover:underline shrink-0"
        >
          {t("adminViewAll")}
        </Link>
      </div>

      <div className="px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              {t("adminStartDate")}
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="date-input-compact h-9 w-40 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              {t("adminEndDate")}
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="date-input-compact h-9 w-40 text-xs"
            />
          </div>
          <Button size="sm" className="h-9 px-4 text-xs" onClick={fetchNotices}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("search")}
          </Button>
        </div>
      </div>

      <div className="border-t">
        {loading ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              {t("adminNoNoticesFound")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              {t("adminNoticeDateHint2")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y">
            {filtered.map((n) => {
              const isExpanded = expandedId === n.id
              return (
                <div
                  key={n.id}
                  className="overflow-hidden transition-colors hover:bg-muted/30"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : n.id)}
                    className="flex w-full items-start gap-3 px-5 py-3 text-left active:bg-muted/20"
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
                      <p className="text-sm font-medium text-foreground truncate">{getTrans(n.title)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {n.date} · {n.sender}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border/60 bg-muted/20 px-5 py-3 pl-14">
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                        {n.content ? getTrans(n.content) : "(내용 없음)"}
                      </p>
                      {!isRead(n.status) && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="h-9 px-4 text-xs font-medium"
                            onClick={() => handleNoticeAction(n.id, '확인')}
                            disabled={confirmingId === n.id}
                          >
                            {confirmingId === n.id ? t('loading') : t('noticeConfirmBtn')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 px-4 text-xs font-medium"
                            onClick={() => handleNoticeAction(n.id, '다음에')}
                            disabled={confirmingId !== null}
                          >
                            {t('noticeLaterBtn')}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

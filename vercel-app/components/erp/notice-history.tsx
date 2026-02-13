"use client"

import * as React from "react"
import {
  Search,
  Clock,
  Trash2,
  CheckCircle2,
  Eye,
  ChevronDown,
  ChevronUp,
  CalendarIcon,
  Users,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getSentNotices,
  deleteNoticeAdmin,
  type SentNoticeItem,
} from "@/lib/api-client"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function defaultStartStr() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

export function NoticeHistory() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [startDate, setStartDate] = React.useState(defaultStartStr)
  const [endDate, setEndDate] = React.useState(todayStr)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [notices, setNotices] = React.useState<SentNoticeItem[]>([])
  const [loading, setLoading] = React.useState(false)

  const loadNotices = React.useCallback(() => {
    if (!auth?.store || !auth?.user) return
    setLoading(true)
    getSentNotices({
      sender: auth.user,
      startDate,
      endDate,
      userStore: auth.store,
      userRole: auth.role,
    })
      .then(setNotices)
      .catch(() => setNotices([]))
      .finally(() => setLoading(false))
  }, [auth?.store, auth?.user, auth?.role, startDate, endDate])

  React.useEffect(() => {
    if (auth?.store && auth?.user) loadNotices()
  }, [auth?.store, auth?.user, loadNotices])

  React.useEffect(() => {
    const onSent = () => loadNotices()
    window.addEventListener("notice-sent", onSent)
    return () => window.removeEventListener("notice-sent", onSent)
  }, [loadNotices])

  const handleDelete = async (id: string) => {
    if (!confirm(t("noticeDeleteConfirm"))) return
    const res = await deleteNoticeAdmin({ id: Number(id) })
    if (res.success) {
      setNotices((prev) => prev.filter((n) => n.id !== id))
      setExpandedId(null)
    } else {
      alert(res.message || t("noticeDeleteFail"))
    }
  }

  if (!auth?.store || !auth?.user) return null

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(38,92%,50%)]/10">
          <Clock className="h-[18px] w-[18px] text-[hsl(38,92%,50%)]" />
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-card-foreground">
            {t("noticeHistoryTitle")}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {t("noticeHistorySub")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="relative flex-1">
          <CalendarIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 pl-8 text-xs rounded-lg"
          />
        </div>
        <span className="text-xs text-muted-foreground font-medium">~</span>
        <div className="relative flex-1">
          <CalendarIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 pl-8 text-xs rounded-lg"
          />
        </div>
        <Button
          size="sm"
          className="h-9 shrink-0 rounded-lg px-3 text-xs font-semibold"
          onClick={loadNotices}
          disabled={loading}
        >
          <Search className="mr-1 h-3.5 w-3.5" />
          {loading ? t("loading") : t("search")}
        </Button>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-2.5 bg-muted/20">
        <span className="text-[11px] font-semibold text-muted-foreground">
          {t("noticeCountPrefix")}{" "}
          <span className="text-card-foreground">{notices.length}</span>
          {t("noticeCountSuffix")}
        </span>
      </div>

      <div className="flex flex-col">
        {notices.length === 0 ? (
          <div className="py-8 px-4 text-center text-sm text-muted-foreground">
            {t("adminNoNoticesFound")}
          </div>
        ) : (
          notices.map((notice, idx) => {
            const isExpanded = expandedId === notice.id
            const readPercent =
              notice.totalCount > 0
                ? Math.round((notice.readCount / notice.totalCount) * 100)
                : 0
            const allRead = notice.readCount === notice.totalCount
            return (
              <div
                key={notice.id}
                className={cn(
                  "border-b last:border-b-0",
                  isExpanded && "bg-muted/10"
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : notice.id)
                  }
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left active:bg-muted/20 transition-colors"
                >
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-[13px] font-bold text-card-foreground leading-tight">
                        {notice.title}
                      </h4>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {notice.date}
                      </span>
                      {notice.recipients.map((r) => (
                        <span
                          key={r}
                          className="inline-flex items-center rounded-md bg-[hsl(215,80%,50%)]/10 px-1.5 py-0.5 text-[9px] font-bold text-[hsl(215,80%,50%)]"
                        >
                          {r === "전체" ? t("noticeFilterAll") : r}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            allRead ? "bg-[hsl(152,60%,42%)]" : "bg-[hsl(215,80%,50%)]"
                          )}
                          style={{ width: `${readPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3 text-muted-foreground" />
                        <span
                          className={cn(
                            "text-[10px] font-bold tabular-nums",
                            allRead ? "text-[hsl(152,60%,42%)]" : "text-muted-foreground"
                          )}
                        >
                          {notice.readCount}/{notice.totalCount}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t bg-muted/10 px-4 py-3">
                    <div className="mb-3 rounded-lg bg-card border px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {t("noticePreview")}
                        </span>
                      </div>
                      <p className="text-xs text-card-foreground leading-relaxed">
                        {notice.preview}
                      </p>
                    </div>
                    <div className="mb-3 rounded-lg bg-card border px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {t("noticeReadStats")}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/50 py-2">
                          <span className="text-[15px] font-extrabold tabular-nums text-card-foreground">
                            {notice.totalCount}
                          </span>
                          <span className="text-[9px] font-semibold text-muted-foreground">
                            {t("noticeTotal")}
                          </span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5 rounded-lg bg-[hsl(152,60%,42%)]/10 py-2">
                          <span className="text-[15px] font-extrabold tabular-nums text-[hsl(152,60%,42%)]">
                            {notice.readCount}
                          </span>
                          <span className="text-[9px] font-semibold text-[hsl(152,60%,42%)]">
                            {t("noticeRead")}
                          </span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5 rounded-lg bg-[hsl(38,92%,50%)]/10 py-2">
                          <span className="text-[15px] font-extrabold tabular-nums text-[hsl(38,92%,50%)]">
                            {notice.totalCount - notice.readCount}
                          </span>
                          <span className="text-[9px] font-semibold text-[hsl(38,92%,50%)]">
                            {t("noticeUnread")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9 rounded-lg text-xs font-semibold"
                        onClick={() => {
                          /* TODO: 수신확인 상세 모달/페이지 */
                        }}
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        {t("noticeReadConfirm")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-lg text-xs font-semibold text-[hsl(0,72%,51%)] border-[hsl(0,72%,51%)]/20 hover:bg-[hsl(0,72%,51%)]/10 hover:text-[hsl(0,72%,51%)]"
                        onClick={() => handleDelete(notice.id)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        {t("delete")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

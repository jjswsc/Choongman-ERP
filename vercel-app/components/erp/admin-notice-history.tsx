"use client"

import * as React from "react"
import {
  Search,
  Clock,
  Eye,
  CalendarIcon,
  Users,
  FileText,
  ChevronDown,
  ChevronUp,
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

export function AdminNoticeHistory() {
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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
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
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
          <Clock className="h-[18px] w-[18px] text-warning" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-card-foreground">
            {t("noticeHistoryTitle")}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {t("noticeHistorySub")}
          </p>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-3 border-b px-6 py-4 bg-muted/20">
        <div className="relative">
          <CalendarIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 w-40 pl-9 text-xs"
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground">~</span>
        <div className="relative">
          <CalendarIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 w-40 pl-9 text-xs"
          />
        </div>
        <Button
          size="sm"
          className="h-9 px-4 text-xs font-semibold"
          onClick={loadNotices}
          disabled={loading}
        >
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {loading ? t("loading") : t("search")}
        </Button>
        <div className="ml-auto">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {t("noticeCountPrefix")}{" "}
            <span className="text-foreground">{notices.length}</span>
            {t("noticeCountSuffix")}
          </span>
        </div>
      </div>

      {/* Notice list */}
      <div className="flex flex-col">
        {notices.length === 0 ? (
          <div className="py-12 px-6 text-center text-sm text-muted-foreground">
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
                  "border-b last:border-b-0 transition-colors",
                  isExpanded && "bg-muted/10"
                )}
              >
                {/* Row */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : notice.id)
                  }
                  className="flex w-full items-center gap-4 px-6 py-4 text-left hover:bg-muted/30 transition-colors"
                >
                  {/* Index */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold tabular-nums text-muted-foreground">
                    {idx + 1}
                  </div>

                  {/* Title + meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-card-foreground truncate">
                        {notice.title}
                      </h4>
                      {notice.recipients.map((r) => (
                        <span
                          key={r}
                          className="inline-flex shrink-0 items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary"
                        >
                          To: {r}
                        </span>
                      ))}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {notice.preview}
                    </p>
                  </div>

                  {/* Date */}
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {notice.date}
                  </span>

                  {/* Read status */}
                  <div className="flex shrink-0 items-center gap-2 w-32">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          allRead ? "bg-success" : "bg-primary"
                        )}
                        style={{ width: `${readPercent}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-bold tabular-nums",
                        allRead ? "text-success" : "text-muted-foreground"
                      )}
                    >
                      {notice.readCount}/{notice.totalCount}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-[11px] font-semibold"
                      onClick={(e) => handleDelete(e, notice.id)}
                    >
                      {t("delete")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-[11px] font-semibold"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      {t("noticeReadConfirm")}
                    </Button>
                  </div>

                  {/* Chevron */}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t bg-muted/10 px-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Preview */}
                      <div className="rounded-lg border bg-card px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[11px] font-bold text-muted-foreground">
                            {t("noticePreview")}
                          </span>
                        </div>
                        <p className="text-sm text-card-foreground leading-relaxed">
                          {notice.preview}
                        </p>
                      </div>

                      {/* Read status */}
                      <div className="rounded-lg border bg-card px-4 py-3">
                        <div className="flex items-center gap-2 mb-3">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[11px] font-bold text-muted-foreground">
                            {t("noticeReadStats")}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/50 py-3">
                            <span className="text-lg font-extrabold tabular-nums text-card-foreground">
                              {notice.totalCount}
                            </span>
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {t("noticeTotal")}
                            </span>
                          </div>
                          <div className="flex flex-col items-center gap-1 rounded-lg bg-success/10 py-3">
                            <span className="text-lg font-extrabold tabular-nums text-success">
                              {notice.readCount}
                            </span>
                            <span className="text-[10px] font-semibold text-success">
                              {t("noticeRead")}
                            </span>
                          </div>
                          <div className="flex flex-col items-center gap-1 rounded-lg bg-warning/10 py-3">
                            <span className="text-lg font-extrabold tabular-nums text-warning">
                              {notice.totalCount - notice.readCount}
                            </span>
                            <span className="text-[10px] font-semibold text-warning">
                              {t("noticeUnread")}
                            </span>
                          </div>
                        </div>
                      </div>
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

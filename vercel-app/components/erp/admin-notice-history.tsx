"use client"

import * as React from "react"
import {
  Search,
  Clock,
  Eye,
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
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getSentNotices,
  deleteNoticeAdmin,
  getNoticeReadDetail,
  getNoticeSenders,
  translateTexts,
  type SentNoticeItem,
  type NoticeReadDetailItem,
} from "@/lib/api-client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
  const [senderFilter, setSenderFilter] = React.useState<string>("mine")
  const [senders, setSenders] = React.useState<string[]>([])
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [notices, setNotices] = React.useState<SentNoticeItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [transMap, setTransMap] = React.useState<Record<string, string>>({})
  const [readDetailOpen, setReadDetailOpen] = React.useState(false)
  const [readDetailTitle, setReadDetailTitle] = React.useState("")
  const [readDetailItems, setReadDetailItems] = React.useState<NoticeReadDetailItem[]>([])
  const [readDetailLoading, setReadDetailLoading] = React.useState(false)

  const loadNotices = React.useCallback(() => {
    if (!auth?.store || !auth?.user) return
    setLoading(true)
    const sender = senderFilter === "all" ? "all" : senderFilter === "mine" ? auth.user : senderFilter
    getSentNotices({
      sender: sender || auth.user,
      startDate,
      endDate,
      userStore: auth.store,
      userRole: auth.role,
    })
      .then(setNotices)
      .catch(() => setNotices([]))
      .finally(() => setLoading(false))
  }, [auth?.store, auth?.user, auth?.role, startDate, endDate, senderFilter])

  const loadSenders = React.useCallback(() => {
    getNoticeSenders({ startDate, endDate })
      .then(({ senders: s }) => setSenders(s))
      .catch(() => setSenders([]))
  }, [startDate, endDate])

  React.useEffect(() => {
    loadSenders()
  }, [loadSenders])

  React.useEffect(() => {
    const onSent = () => loadNotices()
    window.addEventListener("notice-sent", onSent)
    return () => window.removeEventListener("notice-sent", onSent)
  }, [loadNotices])

  React.useEffect(() => {
    const texts = [...new Set(notices.flatMap((n) => [n.title, n.content || n.preview].filter(Boolean)))]
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
  }, [notices, lang])

  const getTrans = (text: string) => (text && transMap[text]) || text || ""

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm(t("noticeDeleteConfirm"))) return
    const res = await deleteNoticeAdmin({ id: Number(id) })
    if (res.success) {
      setNotices((prev) => prev.filter((n) => n.id !== id))
      setExpandedId(null)
    } else {
      alert(translateApiMessage(res.message, t) || t("noticeDeleteFail"))
    }
  }

  const handleOpenReadDetail = React.useCallback(
    async (e: React.MouseEvent, notice: SentNoticeItem) => {
      e.stopPropagation()
      setReadDetailTitle(transMap[notice.title] || notice.title)
      setReadDetailOpen(true)
      setReadDetailItems([])
      setReadDetailLoading(true)
      try {
        const { items } = await getNoticeReadDetail({ noticeId: Number(notice.id) })
        setReadDetailItems(items)
      } catch {
        setReadDetailItems([])
      } finally {
        setReadDetailLoading(false)
      }
    },
    [transMap]
  )

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

      {/* Date filter + Sender filter */}
      <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4 bg-muted/20">
        <div className="min-w-[140px]">
          <Select value={senderFilter} onValueChange={setSenderFilter}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={t("noticeSenderAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("noticeSenderAll")}</SelectItem>
              <SelectItem value="mine">{t("noticeSenderMine")}</SelectItem>
              {senders
                .filter((s) => s !== (auth?.user || ''))
                .map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="date-input-compact h-9 w-40 text-xs"
        />
        <span className="text-xs font-medium text-muted-foreground">~</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="date-input-compact h-9 w-40 text-xs"
        />
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
                  className="flex w-full flex-col gap-2 px-6 py-3 text-left hover:bg-muted/30 transition-colors"
                >
                  {/* Line 1: Index + 제목 | 대상 | 내용 */}
                  <div className="flex w-full items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold tabular-nums text-muted-foreground">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1 flex items-center gap-2 text-xs overflow-hidden">
                      <span className="font-bold text-card-foreground shrink-0 max-w-[140px] truncate" title={getTrans(notice.title)}>
                        {getTrans(notice.title)}
                      </span>
                      <span className="text-muted-foreground shrink-0">·</span>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        {senderFilter === "all" && notice.sender && (
                          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {notice.sender}
                          </span>
                        )}
                        {notice.recipients.map((r) => (
                          <span
                            key={r}
                            className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary"
                          >
                            {r === "전체" ? t("noticeFilterAll") : r}
                          </span>
                        ))}
                      </div>
                      <span className="text-muted-foreground shrink-0">·</span>
                      <span className="text-muted-foreground truncate min-w-0 flex-1" title={getTrans(notice.preview)}>
                        {getTrans(notice.preview)}
                      </span>
                    </div>
                  </div>
                  {/* Line 2: 날짜 | 읽음 상태 | 액션 */}
                  <div className="flex w-full items-center gap-4 pl-10">
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                      {notice.date}
                    </span>
                    <div className="flex shrink-0 items-center gap-2 w-28">
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
                          "text-[11px] font-bold tabular-nums shrink-0",
                          allRead ? "text-success" : "text-muted-foreground"
                        )}
                      >
                        {notice.readCount}/{notice.totalCount}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[10px] font-semibold"
                        onClick={(e) => handleDelete(e, notice.id)}
                      >
                        {t("delete")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[10px] font-semibold"
                        onClick={(e) => handleOpenReadDetail(e, notice)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        {t("noticeReadConfirm")}
                      </Button>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground ml-auto" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground ml-auto" />
                    )}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t bg-muted/10 px-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      {/* 전체 내용 */}
                      <div className="rounded-lg border bg-card px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[11px] font-bold text-muted-foreground">
                            {t("noticePreview")}
                          </span>
                        </div>
                        <p className="text-sm text-card-foreground leading-relaxed whitespace-pre-wrap">
                          {getTrans(notice.content || notice.preview || "") || "(내용 없음)"}
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

      <Dialog open={readDetailOpen} onOpenChange={setReadDetailOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              {t("noticeReadDetailTitle")}
              {readDetailTitle && (
                <span className="block text-xs font-normal text-muted-foreground mt-1 truncate">
                  {readDetailTitle}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto min-h-0 flex-1 -mx-1">
            {readDetailLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("loading")}
              </div>
            ) : readDetailItems.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">-</div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="border-b">
                    <th className="p-2 text-left font-medium">{t("noticeReadDetailStore")}</th>
                    <th className="p-2 text-left font-medium">{t("noticeReadDetailName")}</th>
                    <th className="p-2 text-left font-medium">{t("noticeReadDetailReadAt")}</th>
                    <th className="p-2 text-center font-medium w-20">{t("noticeReadStats")}</th>
                  </tr>
                </thead>
                <tbody>
                  {readDetailItems.map((item, i) => (
                    <tr key={`${item.store}-${item.name}-${i}`} className="border-b border-border/60">
                      <td className="p-2">{item.store}</td>
                      <td className="p-2">{item.name}</td>
                      <td className="p-2 text-muted-foreground">{item.read_at || "-"}</td>
                      <td className="p-2 text-center">
                        <span
                          className={cn(
                            "inline-flex rounded px-2 py-0.5 text-[10px] font-semibold",
                            item.status === "확인"
                              ? "bg-success/20 text-success"
                              : "bg-warning/20 text-warning"
                          )}
                        >
                          {item.status === "확인" ? t("noticeRead") : t("noticeUnread")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

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
  Users,
  FileText,
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

export function NoticeHistory() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [startDate, setStartDate] = React.useState(todayStr)
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
    if (auth?.store && auth?.user) loadNotices()
  }, [auth?.store, auth?.user, loadNotices])

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

  const handleDelete = async (id: string) => {
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

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <div className="min-w-[120px]">
          <Select value={senderFilter} onValueChange={setSenderFilter}>
            <SelectTrigger className="h-9 text-xs rounded-lg">
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
          className="date-input-compact flex-1 min-w-0 h-9 text-xs rounded-lg"
        />
        <span className="text-xs text-muted-foreground font-medium">~</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="date-input-compact flex-1 min-w-0 h-9 text-xs rounded-lg"
        />
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
                      <h4 className="text-[13px] font-bold text-card-foreground leading-tight truncate flex-1 min-w-0">
                        {getTrans(notice.title)}
                      </h4>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                      {getTrans(notice.preview)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                        {notice.date}
                      </span>
                      {senderFilter === "all" && notice.sender && (
                        <span className="inline-flex items-center rounded-md bg-muted/80 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                          {notice.sender}
                        </span>
                      )}
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
                      <p className="text-xs text-card-foreground leading-relaxed whitespace-pre-wrap">
                        {getTrans(notice.content || notice.preview || "") || "(내용 없음)"}
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
                        onClick={(e) => handleOpenReadDetail(e, notice)}
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
              <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
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
                              ? "bg-[hsl(152,60%,42%)]/20 text-[hsl(152,60%,42%)]"
                              : "bg-[hsl(38,92%,50%)]/20 text-[hsl(38,92%,50%)]"
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

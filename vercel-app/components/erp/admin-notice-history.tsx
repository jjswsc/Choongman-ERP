"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import {
  Search,
  Clock,
  Eye,
  Users,
  FileText,
  ChevronDown,
  ChevronUp,
  BarChart2,
  BellRing,
  Pencil,
  Languages,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
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
  updateNoticeAdmin,
  remindNoticeUnread,
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
  DialogFooter,
} from "@/components/ui/dialog"
import { ListPaginationBar } from "@/components/list-pagination-bar"
import { NoticeReaderStatsDialog } from "@/components/erp/notice-reader-stats-dialog"
import { bangkokInclusivePeriod, bangkokTodayYmd } from "@/lib/bangkok-date"

type Props = {
  compact?: boolean
}

export function AdminNoticeHistory({ compact = false }: Props) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const today = bangkokTodayYmd()
  const defaultRange = bangkokInclusivePeriod(today, 7)
  const [startDate, setStartDate] = React.useState(defaultRange.startYmd)
  const [endDate, setEndDate] = React.useState(defaultRange.endYmd)
  const [senderFilter, setSenderFilter] = React.useState<string>("mine")
  const [senders, setSenders] = React.useState<string[]>([])
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [notices, setNotices] = React.useState<SentNoticeItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [transMap, setTransMap] = React.useState<Record<string, string>>({})
  const [translateEnabled, setTranslateEnabled] = React.useState(false)
  const [readDetailOpen, setReadDetailOpen] = React.useState(false)
  const [readDetailTitle, setReadDetailTitle] = React.useState("")
  const [readDetailItems, setReadDetailItems] = React.useState<NoticeReadDetailItem[]>([])
  const [readDetailStoreFilter, setReadDetailStoreFilter] = React.useState("")
  const [readDetailLoading, setReadDetailLoading] = React.useState(false)
  const [statsOpen, setStatsOpen] = React.useState(false)
  const [searchType, setSearchType] = React.useState<"all" | "notice" | "order">("all")
  const [searchKeyword, setSearchKeyword] = React.useState("")
  const [listPage, setListPage] = React.useState(1)
  const listPageSize = compact ? 10 : 15
  const [listTotal, setListTotal] = React.useState(0)
  const [listTruncated, setListTruncated] = React.useState(false)
  type SentListQuery = {
    startDate: string
    endDate: string
    senderFilter: string
    searchType: "all" | "notice" | "order"
    keyword: string
  }
  const [listQuery, setListQuery] = React.useState<SentListQuery>(() => ({
    startDate: defaultRange.startYmd,
    endDate: defaultRange.endYmd,
    senderFilter: "mine",
    searchType: "all",
    keyword: "",
  }))
  const [editOpen, setEditOpen] = React.useState(false)
  const [editNotice, setEditNotice] = React.useState<SentNoticeItem | null>(null)
  const [editTitle, setEditTitle] = React.useState("")
  const [editContent, setEditContent] = React.useState("")
  const [editUrgent, setEditUrgent] = React.useState(false)
  const [editSaving, setEditSaving] = React.useState(false)
  const [remindingId, setRemindingId] = React.useState<string | null>(null)

  const runSentListFetch = React.useCallback(
    (page: number, query: SentListQuery) => {
      if (!auth?.store || !auth?.user) return
      setLoading(true)
      const sender =
        query.senderFilter === "all"
          ? "all"
          : query.senderFilter === "mine"
            ? auth.user
            : query.senderFilter
      getSentNotices({
        sender: sender || auth.user,
        startDate: query.startDate,
        endDate: query.endDate,
        userStore: auth.store,
        userRole: auth.role,
        searchType: query.searchType,
        keyword: query.keyword.trim() || undefined,
        page,
        pageSize: listPageSize,
      })
        .then((res) => {
          setNotices(res.items)
          setListTotal(res.total)
          setListTruncated(Boolean(res.truncated))
          setListPage(res.page)
        })
        .catch(() => {
          setNotices([])
          setListTotal(0)
          setListTruncated(false)
        })
        .finally(() => setLoading(false))
    },
    [auth?.store, auth?.user, auth?.role, listPageSize]
  )

  React.useEffect(() => {
    if (!listQuery) return
    runSentListFetch(listPage, listQuery)
  }, [listQuery, listPage, runSentListFetch])

  const handleSearchNotices = React.useCallback(() => {
    setListQuery({
      startDate,
      endDate,
      senderFilter,
      searchType,
      keyword: searchKeyword,
    })
    setListPage(1)
  }, [startDate, endDate, senderFilter, searchType, searchKeyword])

  const loadSenders = React.useCallback(() => {
    getNoticeSenders({ startDate, endDate })
      .then(({ senders: s }) => setSenders(s))
      .catch(() => setSenders([]))
  }, [startDate, endDate])

  React.useEffect(() => {
    loadSenders()
  }, [loadSenders])

  React.useEffect(() => {
    const onSent = () => {
      if (listQuery) runSentListFetch(listPage, listQuery)
    }
    window.addEventListener("notice-sent", onSent)
    return () => window.removeEventListener("notice-sent", onSent)
  }, [listQuery, listPage, runSentListFetch])

  React.useEffect(() => {
    if (!translateEnabled) {
      setTransMap({})
      return
    }
    const texts = [...new Set(notices.flatMap((n) => [n.title, n.content || n.preview].filter(Boolean)))]
    if (texts.length === 0) return
    let cancelled = false
    translateTexts(texts, lang).then((translated) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      texts.forEach((txt, i) => {
        map[txt] = translated[i] ?? txt
      })
      setTransMap(map)
    }).catch(() => setTransMap({}))
    return () => {
      cancelled = true
    }
  }, [notices, lang, translateEnabled])

  const getTrans = (text: string) => (translateEnabled && text && transMap[text]) || text || ""

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!(await appConfirm(t("noticeDeleteConfirm")))) return
    const res = await deleteNoticeAdmin({ id: Number(id) })
    if (res.success) {
      setNotices((prev) => prev.filter((n) => n.id !== id))
      setExpandedId(null)
    } else {
      await appAlert(translateApiMessage(res.message, t) || t("noticeDeleteFail"))
    }
  }

  const handleRemind = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setRemindingId(id)
    try {
      const res = await remindNoticeUnread({ id: Number(id) })
      await appAlert(translateApiMessage(res.message, t) || t("noticeRemindDone"))
    } catch {
      await appAlert(t("noticeRemindFail"))
    } finally {
      setRemindingId(null)
    }
  }

  const openEdit = (e: React.MouseEvent, notice: SentNoticeItem) => {
    e.stopPropagation()
    setEditNotice(notice)
    setEditTitle(notice.title)
    setEditContent(notice.content || notice.preview || "")
    setEditUrgent(Boolean(notice.isUrgent))
    setEditOpen(true)
  }

  const handleEditSave = async () => {
    if (!editNotice) return
    if (!editTitle.trim()) {
      await appAlert(t("adminNoticeSubjectRequired"))
      return
    }
    setEditSaving(true)
    try {
      const res = await updateNoticeAdmin({
        id: Number(editNotice.id),
        title: editTitle.trim(),
        content: editContent.trim(),
        isUrgent: editUrgent,
      })
      if (res.success) {
        setNotices((prev) =>
          prev.map((n) =>
            n.id === editNotice.id
              ? {
                  ...n,
                  title: editTitle.trim(),
                  content: editContent.trim(),
                  preview: editContent.trim().slice(0, 100),
                  isUrgent: editUrgent,
                }
              : n
          )
        )
        setEditOpen(false)
        await appAlert(t("noticeEditSaved"))
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("noticeSendFail"))
      }
    } finally {
      setEditSaving(false)
    }
  }

  const readDetailStoreOptions = React.useMemo(() => {
    const s = new Set<string>()
    for (const it of readDetailItems) {
      const st = String(it.store || "").trim()
      if (st) s.add(st)
    }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [readDetailItems])

  const readDetailFilteredItems = React.useMemo(() => {
    if (!readDetailStoreFilter) return readDetailItems
    return readDetailItems.filter((x) => String(x.store || "").trim() === readDetailStoreFilter)
  }, [readDetailItems, readDetailStoreFilter])

  const handleOpenReadDetail = React.useCallback(
    async (e: React.MouseEvent, notice: SentNoticeItem) => {
      e.stopPropagation()
      setReadDetailTitle(getTrans(notice.title) || notice.title)
      setReadDetailStoreFilter("")
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
    [getTrans]
  )

  const kpiUnread = React.useMemo(() => {
    let sum = 0
    for (const n of notices) {
      sum += Math.max(0, n.totalCount - n.readCount)
    }
    return sum
  }, [notices])

  if (!auth?.store || !auth?.user) return null

  return (
    <div className={cn("rounded-xl border bg-card shadow-sm", compact && "rounded-2xl")}>
      <div className="flex items-center gap-3 border-b px-4 sm:px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
          <Clock className="h-[18px] w-[18px] text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold">{t("noticeHistoryTitle")}</h3>
          <p className="text-[11px] text-muted-foreground">{t("noticeHistorySub")}</p>
        </div>
        <div className="flex gap-2 text-center shrink-0">
          <div className="rounded-lg bg-muted/50 px-3 py-1.5">
            <p className="text-[10px] text-muted-foreground">{t("noticeKpiTotal")}</p>
            <p className="text-sm font-bold tabular-nums">{listTotal}</p>
          </div>
          <div className="rounded-lg bg-warning/10 px-3 py-1.5">
            <p className="text-[10px] text-warning">{t("noticeKpiUnread")}</p>
            <p className="text-sm font-bold tabular-nums text-warning">{kpiUnread}</p>
          </div>
        </div>
      </div>

      <div className="border-b px-4 sm:px-6 py-4 space-y-3 bg-muted/20">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={searchType} onValueChange={(v) => setSearchType(v as "all" | "notice" | "order")}>
            <SelectTrigger className="h-9 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("noticeSearchTypeAll")}</SelectItem>
              <SelectItem value="notice">{t("noticeSearchTypeNotice")}</SelectItem>
              <SelectItem value="order">{t("noticeSearchTypeOrder")}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder={t("noticeSearchNoticePh")}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="h-9 flex-1 min-w-[120px] max-w-[240px] text-xs"
          />
          <Button size="sm" className="h-9 px-4 text-xs" onClick={handleSearchNotices} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {loading ? t("loading") : t("search")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={() => setTranslateEnabled((v) => !v)}
          >
            <Languages className="mr-1.5 h-3.5 w-3.5" />
            {translateEnabled ? t("noticeTranslateOff") : t("noticeTranslateOn")}
          </Button>
          <span className="text-[11px] font-semibold text-muted-foreground ml-auto">
            {t("noticeCountPrefix")}{" "}
            <span className="text-foreground">{listTotal}</span>
            {t("noticeCountSuffix")}
          </span>
        </div>
        {listTruncated && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500">{t("noticeSentListTruncatedHint")}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={senderFilter} onValueChange={setSenderFilter}>
            <SelectTrigger className="h-9 text-xs min-w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("noticeSenderAll")}</SelectItem>
              <SelectItem value="mine">{t("noticeSenderMine")}</SelectItem>
              {senders
                .filter((s) => s !== (auth?.user || ""))
                .map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="date-input-compact h-9 w-[130px] text-xs"
          />
          <span className="text-xs text-muted-foreground">~</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="date-input-compact h-9 w-[130px] text-xs"
          />
          <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={() => setStatsOpen(true)}>
            <BarChart2 className="mr-1.5 h-3.5 w-3.5" />
            {t("noticeReaderStatsBtn")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col">
        {loading && notices.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t("loading")}</div>
        ) : notices.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm text-muted-foreground">{t("adminNoNoticesFound")}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t("noticeHistoryEmptyHint")}</p>
          </div>
        ) : (
          notices.map((notice, idx) => {
            const isExpanded = expandedId === notice.id
            const readPercent =
              notice.totalCount > 0 ? Math.round((notice.readCount / notice.totalCount) * 100) : 0
            const allRead = notice.readCount === notice.totalCount && notice.totalCount > 0
            const unreadCount = Math.max(0, notice.totalCount - notice.readCount)

            return (
              <div
                key={notice.id}
                className={cn("border-b last:border-b-0", isExpanded && "bg-muted/10")}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : notice.id)}
                  className="flex w-full flex-col gap-2 px-4 sm:px-6 py-3 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex w-full items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold tabular-nums">
                      {(listPage - 1) * listPageSize + idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        {notice.isUrgent && (
                          <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                            {t("noticeUrgentBadge")}
                          </span>
                        )}
                        {notice.isOrderRelated && (
                          <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                            {t("noticeTypeSystem")}
                          </span>
                        )}
                        {!notice.isOrderRelated && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            {t("noticeTypeManual")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold truncate">{getTrans(notice.title)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {notice.date}
                        {notice.sender && senderFilter === "all" ? ` · ${notice.sender}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 w-24 sm:w-32">
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            allRead ? "bg-success" : readPercent < 50 ? "bg-warning" : "bg-primary"
                          )}
                          style={{ width: `${readPercent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] font-bold tabular-nums text-right text-muted-foreground">
                        {notice.readCount}/{notice.totalCount} ({readPercent}%)
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t bg-muted/10 px-4 sm:px-6 py-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={(e) => openEdit(e, notice)}>
                        <Pencil className="mr-1 h-3 w-3" />
                        {t("edit")}
                      </Button>
                      {unreadCount > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={(e) => handleRemind(e, notice.id)}
                          disabled={remindingId === notice.id}
                        >
                          <BellRing className="mr-1 h-3 w-3" />
                          {remindingId === notice.id ? t("loading") : t("noticeRemindUnread")}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={(e) => handleOpenReadDetail(e, notice)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        {t("noticeReadConfirm")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={(e) => handleDelete(e, notice.id)}
                      >
                        {t("delete")}
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-lg border bg-card px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[11px] font-bold text-muted-foreground">
                            {t("noticePreview")}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                          {getTrans(notice.content || notice.preview || "") || t("noticeEmptyContent")}
                        </p>
                        {notice.attachments && notice.attachments.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {notice.attachments.map((att, i) => {
                              const isImg = att.mime?.startsWith("image/") || att.url?.startsWith("data:image/")
                              if (isImg) {
                                return (
                                  <a
                                    key={i}
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block max-w-[160px] rounded border overflow-hidden"
                                  >
                                    <img src={att.url} alt={att.name} className="max-h-24 object-contain" />
                                  </a>
                                )
                              }
                              return (
                                <a
                                  key={i}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px]"
                                >
                                  <FileText className="h-3 w-3" />
                                  {att.name}
                                </a>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <div className="rounded-lg border bg-card px-4 py-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[11px] font-bold text-muted-foreground">
                            {t("noticeTargetDetail")}
                          </span>
                        </div>
                        <dl className="grid gap-1 text-xs">
                          <div className="flex gap-2">
                            <dt className="text-muted-foreground shrink-0">{t("store")}:</dt>
                            <dd>{notice.targetStore || t("noticeFilterAll")}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="text-muted-foreground shrink-0">{t("noticeTargetDept")}:</dt>
                            <dd>{notice.targetRole || t("noticeFilterAll")}</dd>
                          </div>
                          {notice.targetPermissionGroup && (
                            <div className="flex gap-2">
                              <dt className="text-muted-foreground shrink-0">
                                {t("adminTargetPermissionGroups")}:
                              </dt>
                              <dd>{notice.targetPermissionGroup}</dd>
                            </div>
                          )}
                          {notice.scheduledAt && (
                            <div className="flex gap-2">
                              <dt className="text-muted-foreground shrink-0">{t("noticeScheduledAtLabel")}:</dt>
                              <dd>{notice.scheduledAt}</dd>
                            </div>
                          )}
                          {notice.expiresAt && (
                            <div className="flex gap-2">
                              <dt className="text-muted-foreground shrink-0">{t("noticeExpiresAtLabel")}:</dt>
                              <dd>{notice.expiresAt}</dd>
                            </div>
                          )}
                        </dl>
                        <div className="grid grid-cols-3 gap-2 pt-2">
                          <div className="rounded-lg bg-muted/50 py-2 text-center">
                            <p className="text-lg font-extrabold tabular-nums">{notice.totalCount}</p>
                            <p className="text-[10px] text-muted-foreground">{t("noticeTotal")}</p>
                          </div>
                          <div className="rounded-lg bg-success/10 py-2 text-center">
                            <p className="text-lg font-extrabold tabular-nums text-success">{notice.readCount}</p>
                            <p className="text-[10px] text-success">{t("noticeRead")}</p>
                          </div>
                          <div className="rounded-lg bg-warning/10 py-2 text-center">
                            <p className="text-lg font-extrabold tabular-nums text-warning">{unreadCount}</p>
                            <p className="text-[10px] text-warning">{t("noticeUnread")}</p>
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
        {listQuery && notices.length > 0 && (
          <div className="border-t px-4 sm:px-6 py-3">
            <ListPaginationBar
              page={listPage}
              pageSize={listPageSize}
              total={listTotal}
              onPageChange={setListPage}
              disabled={loading}
            />
          </div>
        )}
      </div>

      <NoticeReaderStatsDialog open={statsOpen} onOpenChange={setStatsOpen} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("noticeEditTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-9 text-sm" />
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[120px] text-sm"
            />
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={editUrgent} onCheckedChange={(v) => setEditUrgent(Boolean(v))} />
              {t("noticeUrgentLabel")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              {t("cancel")}
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? t("loading") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={readDetailOpen}
        onOpenChange={(open) => {
          setReadDetailOpen(open)
          if (!open) setReadDetailStoreFilter("")
        }}
      >
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
          {!readDetailLoading && readDetailItems.length > 0 && readDetailStoreOptions.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2 shrink-0 pb-1">
              <Select
                value={readDetailStoreFilter || "__all__"}
                onValueChange={(v) => setReadDetailStoreFilter(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="h-8 min-w-[160px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("noticeFilterAll")}</SelectItem>
                  {readDetailStoreOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="overflow-auto min-h-0 flex-1 -mx-1">
            {readDetailLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
            ) : readDetailItems.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">-</div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="border-b">
                    <th className="p-2 text-left">{t("noticeReadDetailStore")}</th>
                    <th className="p-2 text-left">{t("noticeReadDetailName")}</th>
                    <th className="p-2 text-left">{t("noticeReadDetailReadAt")}</th>
                    <th className="p-2 text-center w-20">{t("noticeReadStats")}</th>
                  </tr>
                </thead>
                <tbody>
                  {readDetailFilteredItems.map((item, i) => (
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

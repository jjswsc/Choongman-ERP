"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
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
import dynamic from "next/dynamic"
import {
  getMyNotices,
  getMyHrPolicies,
  confirmNoticeRead,
  confirmHrPolicyRead,
  type NoticeItem,
  type HrPolicyListItem,
} from "@/lib/api-client"
import { useTranslatedTextMap } from "@/lib/use-ui-translate"
import { bangkokTodayYmd } from "@/lib/bangkok-date"
import { isNoticeReadStatus } from "@/lib/notice-read-status"
import { ListPaginationBar } from "@/components/list-pagination-bar"
import { Megaphone, Bell, Search, FileText, RefreshCw, BookOpen } from "lucide-react"
import { PwaInstallBanner } from "@/components/pwa-install-banner"

/** app/api/getMyNotices/route.ts 의 DB_FETCH_LIMIT 과 맞출 것 */
const NOTICE_SERVER_FETCH_CAP = 100

const PushNotificationSetup = dynamic(
  () => import("@/components/push-notification-setup").then((m) => ({ default: m.PushNotificationSetup })),
  { ssr: false }
)

export function HomeTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [notices, setNotices] = useState<NoticeItem[]>([])
  const [noticePage, setNoticePage] = useState(1)
  const [noticeTotal, setNoticeTotal] = useState(0)
  const [noticePageSize] = useState(15)
  const [noticeTruncated, setNoticeTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<'All' | 'Unread' | 'Read'>('Unread') // 첫화면: 미확인 기본
  const [dateFrom, setDateFrom] = useState(() => bangkokTodayYmd())
  const [dateTo, setDateTo] = useState(() => bangkokTodayYmd())
  const [unreadTotal, setUnreadTotal] = useState<number | null>(null)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)

  const [hrPolicies, setHrPolicies] = useState<HrPolicyListItem[]>([])
  const [hrPage, setHrPage] = useState(1)
  const [hrTotal, setHrTotal] = useState(0)
  const [hrPageSize] = useState(10)
  const [hrTruncated, setHrTruncated] = useState(false)
  const [hrLoading, setHrLoading] = useState(false)
  const [hrExpandedId, setHrExpandedId] = useState<number | null>(null)
  const [hrStatusFilter, setHrStatusFilter] = useState<'All' | 'Unread' | 'Read'>('Unread')
  const [hrConfirmingId, setHrConfirmingId] = useState<number | null>(null)

  const noticeTexts = useMemo(
    () => notices.flatMap((n) => [n.title, n.content]),
    [notices]
  )
  const hrTexts = useMemo(
    () => hrPolicies.flatMap((h) => [h.title, h.content]),
    [hrPolicies]
  )
  /** 공지·규정은 선택 언어로 항상 번역 (모바일엔 자동번역 토글이 없음) */
  const getTrans = useTranslatedTextMap(noticeTexts, lang, { force: true })
  const getHrTrans = useTranslatedTextMap(hrTexts, lang, { force: true })

  const statusParam = statusFilter === 'Unread' ? 'unread' : statusFilter === 'Read' ? 'read' : 'all'
  const hrStatusParam = hrStatusFilter === 'Unread' ? 'unread' : hrStatusFilter === 'Read' ? 'read' : 'all'

  const refreshUnreadCount = useCallback(() => {
    if (!auth?.store || !auth?.user) return
    void getMyNotices({
      store: auth.store,
      name: auth.user,
      page: 1,
      pageSize: 1,
      status: "unread",
    })
      .then((res) => setUnreadTotal(res.total))
      .catch(() => setUnreadTotal(null))
  }, [auth?.store, auth?.user])

  const fetchNotices = useCallback(
    (page: number) => {
      if (!auth?.store || !auth?.user) return
      setLoading(true)
      getMyNotices({
        store: auth.store,
        name: auth.user,
        page,
        pageSize: noticePageSize,
        status: statusParam,
        dateFrom,
        dateTo,
        lang,
      })
        .then((res) => {
          setNotices(res.items)
          setNoticeTotal(res.total)
          setNoticeTruncated(Boolean(res.truncated))
          setNoticePage(res.page)
        })
        .catch(() => {
          setNotices([])
          setNoticeTotal(0)
          setNoticeTruncated(false)
        })
        .finally(() => setLoading(false))
    },
    [auth?.store, auth?.user, noticePageSize, statusParam, dateFrom, dateTo, lang]
  )

  const fetchHrPolicies = useCallback(
    (page: number) => {
      if (!auth?.store || !auth?.user) return
      setHrLoading(true)
      getMyHrPolicies({
        store: auth.store,
        name: auth.user,
        page,
        pageSize: hrPageSize,
        status: hrStatusParam,
      })
        .then((res) => {
          setHrPolicies(res.items)
          setHrTotal(res.total)
          setHrTruncated(Boolean(res.truncated))
          setHrPage(res.page)
        })
        .catch(() => {
          setHrPolicies([])
          setHrTotal(0)
          setHrTruncated(false)
        })
        .finally(() => setHrLoading(false))
    },
    [auth?.store, auth?.user, hrPageSize, hrStatusParam]
  )

  useEffect(() => {
    if (!auth?.store || !auth?.user) return
    fetchNotices(noticePage)
  }, [auth?.store, auth?.user, noticePage, fetchNotices])

  useEffect(() => {
    if (!auth?.store || !auth?.user) return
    fetchHrPolicies(hrPage)
  }, [auth?.store, auth?.user, hrPage, fetchHrPolicies])

  useEffect(() => {
    refreshUnreadCount()
  }, [refreshUnreadCount])

  const handleHrPolicyAction = useCallback(
    async (policyId: number, action: '확인' | '다음에') => {
      if (!auth?.store || !auth?.user) return
      if (action === '다음에') {
        setHrExpandedId(null)
        return
      }
      setHrConfirmingId(policyId)
      try {
        const res = await confirmHrPolicyRead({ policyId, store: auth.store, name: auth.user, action })
        if (res.success) {
          setHrPolicies((prev) =>
            prev.map((h) => (h.id === policyId ? { ...h, status: '확인' } : h))
          )
          setHrExpandedId(null)
        }
      } catch {
        /* */
      } finally {
        setHrConfirmingId(null)
      }
    },
    [auth?.store, auth?.user]
  )

  const handleNoticeAction = useCallback(
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
          refreshUnreadCount()
        }
      } catch {
        // ignore
      } finally {
        setConfirmingId(null)
      }
    },
    [auth?.store, auth?.user, refreshUnreadCount]
  )

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 앱 설치 안내 - 휴대폰 알림 설정에 CM ERP 별도 표시됨 */}
      <PwaInstallBanner />

      {/* 푸시 알림 설정 */}
      {auth?.store && auth?.user && (
        <PushNotificationSetup store={auth.store} name={auth.user} />
      )}

      {/* 공지사항 */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Megaphone className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">
            {t("noticeBoard")}
            {unreadTotal != null && unreadTotal > 0 ? (
              <span className="ml-1.5 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                {unreadTotal}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {/* 1행: 미확인 필터 + 검색 버튼 */}
            <div className="flex items-center gap-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setNoticePage(1)
                  setStatusFilter(v as 'All' | 'Unread' | 'Read')
                }}
              >
                <SelectTrigger className="h-9 min-w-[100px] flex-1 text-xs sm:flex-initial sm:w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{t('noticeFilterAll')}</SelectItem>
                  <SelectItem value="Unread">{t('noticeFilterUnread')}</SelectItem>
                  <SelectItem value="Read">{t('noticeFilterRead')}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                type="button"
                onClick={() => {
                  setNoticePage(1)
                  fetchNotices(1)
                  refreshUnreadCount()
                }}
                title={t('search')}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                type="button"
                onClick={() => {
                  setNoticePage(1)
                  fetchNotices(1)
                  refreshUnreadCount()
                }}
                title={t("homeNoticesRefresh")}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            {/* 2행: 날짜 검색창 */}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setNoticePage(1)
                  setDateFrom(e.target.value)
                }}
                className="h-9 flex-1 min-w-0 text-xs"
                aria-label={t('dateFrom')}
              />
              <span className="text-xs text-muted-foreground shrink-0">~</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setNoticePage(1)
                  setDateTo(e.target.value)
                }}
                className="h-9 flex-1 min-w-0 text-xs"
                aria-label={t('dateTo')}
              />
            </div>
          </div>

          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t('loadingNotices')}</div>
          ) : notices.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t('noNotices')}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {noticeTruncated && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("adminNoticeTruncatedLimitHint").replace("{max}", String(NOTICE_SERVER_FETCH_CAP))}
                </p>
              )}
              {notices.map((n) => {
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
                          n.status === "New" || !isNoticeReadStatus(n.status) ? "bg-destructive/10" : "bg-primary/10"
                        }`}
                      >
                        <Bell className={`h-3 w-3 ${n.status === "New" || !isNoticeReadStatus(n.status) ? "text-destructive" : "text-primary"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {n.isUrgent && (
                            <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                              {t("noticeUrgentBadge")}
                            </span>
                          )}
                          <p className="text-sm font-medium text-foreground">{getTrans(n.title)}</p>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.date}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{isExpanded ? "▲" : "▼"}</span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border/60 bg-muted/20 px-3 py-3">
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                          {n.content ? getTrans(n.content) : t("noticeEmptyContent")}
                        </p>
                        {Array.isArray(n.attachments) && n.attachments.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {n.attachments.map((att: { name?: string; mime?: string; url?: string }, idx: number) => {
                              const url = att?.url || ""
                              const mime = String(att?.mime || "").toLowerCase()
                              const isImg = mime.startsWith("image/") || (url.startsWith("data:image/"))
                              if (!url) return null
                              return isImg ? (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block rounded-md overflow-hidden border border-border bg-background max-w-[200px]"
                                >
                                  <img
                                    src={url}
                                    alt={att?.name || t("noticeAttachment")}
                                    className="max-h-40 w-auto object-contain"
                                    onError={(e) => { e.currentTarget.style.display = "none" }}
                                  />
                                </a>
                              ) : (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  {att?.name || t("noticeAttachmentFile")}
                                </a>
                              )
                            })}
                          </div>
                        )}
                        {!isNoticeReadStatus(n.status) && (
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
              <ListPaginationBar
                page={noticePage}
                pageSize={noticePageSize}
                total={noticeTotal}
                onPageChange={setNoticePage}
                disabled={loading}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">
            {t("homeSectionHrPolicies")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Select
              value={hrStatusFilter}
              onValueChange={(v) => {
                setHrPage(1)
                setHrStatusFilter(v as 'All' | 'Unread' | 'Read')
              }}
            >
              <SelectTrigger className="h-9 min-w-[100px] flex-1 text-xs sm:flex-initial sm:w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("noticeFilterAll")}</SelectItem>
                <SelectItem value="Unread">{t("noticeFilterUnread")}</SelectItem>
                <SelectItem value="Read">{t("noticeFilterRead")}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              type="button"
              onClick={() => {
                setHrPage(1)
                fetchHrPolicies(1)
              }}
              title={t("search")}
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          </div>

          {hrLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : hrPolicies.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t("noNotices")}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {hrTruncated && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("adminNoticeTruncatedLimitHint").replace("{max}", "200")}
                </p>
              )}
              {hrPolicies.map((h) => {
                const isExpanded = hrExpandedId === h.id
                const isUnread = !isNoticeReadStatus(h.status) || h.needsReconfirm
                return (
                  <div
                    key={h.id}
                    className="rounded-lg border border-border/60 overflow-hidden transition-colors hover:bg-muted/50"
                  >
                    <button
                      type="button"
                      onClick={() => setHrExpandedId(isExpanded ? null : h.id)}
                      className="flex w-full items-start gap-3 p-3 text-left active:bg-muted/30"
                    >
                      <div
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          isUnread ? "bg-destructive/10" : "bg-primary/10"
                        }`}
                      >
                        <BookOpen className={`h-3 w-3 ${isUnread ? "text-destructive" : "text-primary"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {getHrTrans(h.title)}
                          {h.effectiveAt ? (
                            <span className="ml-1 text-xs text-muted-foreground">· {h.effectiveAt}</span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {h.date}
                          {h.needsReconfirm ? ` · ${t("hrPolicyNeedsReconfirm")}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border/60 bg-muted/20 px-3 py-3">
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                          {h.content ? getHrTrans(h.content) : "—"}
                        </p>
                        {Array.isArray(h.attachments) && h.attachments.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(h.attachments as { name?: string; mime?: string; url?: string }[]).map(
                              (att, idx) => {
                                const url = att?.url || ""
                                if (!url) return null
                                return (
                                  <a
                                    key={idx}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    {att?.name || t("noticeAttachmentFile")}
                                  </a>
                                )
                              }
                            )}
                          </div>
                        )}
                        {isUnread && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              className="h-9 px-4 text-xs font-medium"
                              type="button"
                              onClick={() => void handleHrPolicyAction(h.id, "확인")}
                              disabled={hrConfirmingId === h.id}
                            >
                              {hrConfirmingId === h.id ? t("loading") : t("noticeConfirmBtn")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 px-4 text-xs font-medium"
                              type="button"
                              onClick={() => void handleHrPolicyAction(h.id, "다음에")}
                              disabled={hrConfirmingId !== null}
                            >
                              {t("noticeLaterBtn")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              <ListPaginationBar
                page={hrPage}
                pageSize={hrPageSize}
                total={hrTotal}
                onPageChange={setHrPage}
                disabled={hrLoading}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

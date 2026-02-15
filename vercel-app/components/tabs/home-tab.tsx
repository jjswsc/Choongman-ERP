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
import { getMyNotices, getMyPayroll, getHeadOfficeInfo, translateTexts, type NoticeItem } from "@/lib/api-client"
import { Megaphone, Bell, Search, Wallet, Download } from "lucide-react"

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

  // 내 급여 명세서
  const [payrollMonth, setPayrollMonth] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1) // 기본: 전월
    return d.toISOString().slice(0, 7)
  })
  const [payrollData, setPayrollData] = useState<{
    month: string
    store: string
    name: string
    dept: string
    role: string
    salary: number
    pos_allow: number
    haz_allow: number
    birth_bonus: number
    holiday_pay: number
    spl_bonus: number
    ot_amt: number
    late_ded: number
    sso: number
    tax: number
    other_ded: number
    net_pay: number
  } | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [payrollLoading, setPayrollLoading] = useState(false)

  const fetchNotices = useCallback(() => {
    if (!auth?.store || !auth?.user) return
    setLoading(true)
    getMyNotices({ store: auth.store, name: auth.user })
      .then(setNotices)
      .catch(() => setNotices([]))
      .finally(() => setLoading(false))
  }, [auth?.store, auth?.user])

  const fetchPayroll = useCallback(() => {
    if (!auth?.store || !auth?.user) return
    setPayrollLoading(true)
    Promise.all([
      getMyPayroll({ store: auth.store, name: auth.user, month: payrollMonth }),
      getHeadOfficeInfo(),
    ])
      .then(([payRes, companyRes]) => {
        setPayrollData(payRes.success && payRes.data ? payRes.data : null)
        setCompanyName(companyRes?.companyName || "CHOONGMAN")
      })
      .catch(() => {
        setPayrollData(null)
        setCompanyName("")
      })
      .finally(() => setPayrollLoading(false))
  }, [auth?.store, auth?.user, payrollMonth])

  useEffect(() => {
    fetchNotices()
  }, [fetchNotices])

  useEffect(() => {
    fetchPayroll()
  }, [fetchPayroll])

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
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  const formatMonthLabel = (m: string) => {
    if (!m || m.length < 7) return m
    const [, mm] = m.split("-")
    const months = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
    return `${m.slice(0, 4)}년 ${months[parseInt(mm, 10) || 0] || mm}월`
  }

  const handlePrintPayroll = () => {
    if (!payrollData) return
    const totalAllow = (payrollData.pos_allow || 0) + (payrollData.haz_allow || 0) + (payrollData.birth_bonus || 0) + (payrollData.holiday_pay || 0) + (payrollData.spl_bonus || 0)
    const totalDed = (payrollData.late_ded || 0) + (payrollData.sso || 0) + (payrollData.tax || 0) + (payrollData.other_ded || 0)
    const issueDate = new Date().toISOString().slice(0, 10)
    const printWin = window.open("", "_blank")
    if (!printWin) return
    printWin.document.write(`
<!DOCTYPE html><html><head><meta charset="utf-8"><title>급여 명세서 - ${payrollData.name}</title>
<style>
body{font-family:'Malgun Gothic',Arial,sans-serif;font-size:11pt;color:#1e293b;padding:24px;max-width:480px;margin:0 auto;}
h1{font-size:16pt;text-align:center;margin-bottom:4px;color:#0f172a;}
.company{text-align:center;font-size:12pt;font-weight:600;margin-bottom:20px;color:#374151;}
.meta{display:grid;grid-template-columns:80px 1fr;gap:4px 12px;margin-bottom:16px;font-size:10pt;}
.meta dt{color:#64748b;} .meta dd{margin:0;}
table{width:100%;border-collapse:collapse;font-size:10pt;}
th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;}
th{background:#f8fafc;font-weight:600;} td.num{text-align:right;}
.section{background:#f1f5f9;} .deduct{color:#dc2626;}
.net{font-weight:700;font-size:12pt;background:#e0f2fe;color:#0c4a6e;}
.footer{margin-top:24px;font-size:9pt;color:#94a3b8;text-align:right;}
</style></head><body>
<h1>급 여 명 세 서</h1>
<div class="company">${companyName || "CHOONGMAN"}</div>
<dl class="meta">
<dt>귀 속 월</dt><dd>${formatMonthLabel(payrollData.month)}</dd>
<dt>소 속</dt><dd>${payrollData.store}</dd>
<dt>직 책</dt><dd>${payrollData.role || "-"}</dd>
<dt>부 서</dt><dd>${payrollData.dept || "-"}</dd>
<dt>성 명</dt><dd>${payrollData.name}</dd>
</dl>
<table>
<tr class="section"><th colspan="2">지급 내역</th></tr>
<tr><td>${t("pay_salary")}</td><td class="num">${fmt(payrollData.salary)} THB</td></tr>
<tr><td>${t("pay_pos_allow")}</td><td class="num">+${fmt(payrollData.pos_allow)}</td></tr>
<tr><td>${t("pay_haz_allow")}</td><td class="num">+${fmt(payrollData.haz_allow)}</td></tr>
<tr><td>${t("pay_birth")}</td><td class="num">+${fmt(payrollData.birth_bonus)}</td></tr>
<tr><td>${t("pay_holiday")}</td><td class="num">+${fmt(payrollData.holiday_pay)}</td></tr>
<tr><td>${t("pay_spl_bonus")}</td><td class="num">+${fmt(payrollData.spl_bonus)}</td></tr>
<tr><td>${t("pay_ot_hours")}</td><td class="num">+${fmt(payrollData.ot_amt)}</td></tr>
<tr class="section"><th colspan="2">공제 내역</th></tr>
<tr><td>${t("pay_late_ded")}</td><td class="num deduct">-${fmt(payrollData.late_ded)}</td></tr>
<tr><td>${t("pay_sso")}</td><td class="num deduct">-${fmt(payrollData.sso)}</td></tr>
<tr><td>${t("pay_tax")}</td><td class="num deduct">-${fmt(payrollData.tax)}</td></tr>
<tr><td>${t("pay_other_ded")}</td><td class="num deduct">-${fmt(payrollData.other_ded)}</td></tr>
<tr class="net"><td><strong>${t("pay_net")}</strong></td><td class="num"><strong>${fmt(payrollData.net_pay)} THB</strong></td></tr>
</table>
<div class="footer">발급일: ${issueDate}</div>
</body></html>`)
    printWin.document.close()
    printWin.focus()
    setTimeout(() => { printWin.print(); printWin.close() }, 250)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Welcome Banner */}
      <div className="overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
        <h2 className="text-xl font-bold text-foreground">{t('welcome')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('welcomeSub')}</p>
      </div>

      {/* 모바일: 공지사항 먼저(order-1), 데스크톱: 급여 먼저(md:order-1) */}
      {/* 내 급여 명세서 - order-2 on mobile (below notices), order-1 on desktop */}
      <Card className="shadow-sm order-2 md:order-1">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Wallet className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t('payMyTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{t('payMySub')}</p>
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={payrollMonth}
              onChange={(e) => setPayrollMonth(e.target.value.slice(0, 7))}
              className="h-9 flex-1 min-w-0 text-xs"
            />
            <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={() => fetchPayroll()} disabled={payrollLoading}>
              <Search className="h-3.5 w-3.5 mr-1" />
              {t('search')}
            </Button>
          </div>
          {payrollLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t('payMyLoading')}</div>
          ) : !payrollData ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t('payMyNoData')}</div>
          ) : (
            <>
              <div className="rounded-lg border border-border/60 overflow-hidden text-xs">
                <div className="bg-muted/30 px-3 py-2 font-medium">{formatMonthLabel(payrollData.month)} · {payrollData.store} · {payrollData.role || "-"}</div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t('pay_salary')}</span>
                  <span className="font-medium">{fmt(payrollData.salary)} THB</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t('pay_pos_allow')}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.pos_allow)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t('pay_haz_allow')}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.haz_allow)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t('pay_birth')}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.birth_bonus)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t('pay_holiday')}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.holiday_pay)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t('pay_spl_bonus')}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.spl_bonus)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t('pay_ot_hours')}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.ot_amt)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40 bg-destructive/5">
                  <span className="text-muted-foreground">{t('pay_late_ded')}</span>
                  <span className="text-destructive">-{fmt(payrollData.late_ded)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40 bg-destructive/5">
                  <span className="text-muted-foreground">{t('pay_sso')}</span>
                  <span className="text-destructive">-{fmt(payrollData.sso)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40 bg-destructive/5">
                  <span className="text-muted-foreground">{t('pay_tax')}</span>
                  <span className="text-destructive">-{fmt(payrollData.tax)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40 bg-destructive/5">
                  <span className="text-muted-foreground">{t('pay_other_ded')}</span>
                  <span className="text-destructive">-{fmt(payrollData.other_ded)}</span>
                </div>
                <div className="px-3 py-3 flex justify-between items-center border-t-2 border-primary/30 bg-primary/5">
                  <span className="font-semibold text-sm">{t('pay_net')}</span>
                  <span className="font-bold text-base text-primary">{fmt(payrollData.net_pay)} THB</span>
                </div>
              </div>
              <Button size="sm" variant="outline" className="w-full mt-3 h-9" onClick={handlePrintPayroll}>
                <Download className="h-3.5 w-3.5 mr-2" />
                {t('payMyDownloadPdf')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* 공지사항 - order-1 on mobile (first), order-2 on desktop */}
      <Card className="shadow-sm order-1 md:order-2">
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

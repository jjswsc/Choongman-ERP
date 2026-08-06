"use client"
import { appAlert, appConfirm, appPrompt } from "@/lib/app-message"

import * as React from "react"
import {
  CalendarIcon,
  Search,
  ShieldCheck,
  MessageSquarePlus,
  Building2,
  User,
  Trash2,
  Download,
  PauseCircle,
  CheckCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { AdminDesktopOnly, AdminMobileOnly, AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getWorkLogManagerReport,
  updateWorkLogManagerCheck,
  updateWorkLogPriority,
  deleteWorkLogItem,
  getWorkLogOfficeOptions,
  translateTexts,
  type WorkLogManagerItem,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { formatWorkLogStaffSelectLabel, formatWorkLogStaffNickname } from "@/lib/work-log-name"
import { useAuth } from "@/lib/auth-context"
import { canReviewWorkLog } from "@/lib/permissions"
import {
  WORK_LOG_PRIORITIES,
  downloadCsv,
  formatWorkLogDateMonthDay,
  workLogReviewBadgeClass,
  workLogWorkTypeBadgeClass,
  workLogWorkTypeSortRank,
} from "@/lib/work-log-shared"

type WorkLogStaffOpt = { id: number; name: string; displayName: string; store?: string; job?: string }

type Props = {
  onPendingChange?: (count: number) => void
}

export function WorklogApproval({ onPendingChange }: Props) {
  const { auth } = useAuth()
  const canEdit = canReviewWorkLog(auth?.role || "")
  const { lang } = useLang()
  const t = useT(lang)
  const [contentTransMap, setContentTransMap] = React.useState<Record<string, string>>({})
  const [startStr, setStartStr] = React.useState(() => getBangkokTodayDateString())
  const [endStr, setEndStr] = React.useState(() => getBangkokTodayDateString())
  const [deptFilter, setDeptFilter] = React.useState("all")
  const [employeeFilter, setEmployeeFilter] = React.useState("all")
  const [storeFilter, setStoreFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [workTypeFilter, setWorkTypeFilter] = React.useState<string>("all")
  const [contentSearch, setContentSearch] = React.useState("")
  const [depts, setDepts] = React.useState<string[]>([])
  const [stores, setStores] = React.useState<string[]>([])
  const [staffList, setStaffList] = React.useState<WorkLogStaffOpt[]>([])
  const [list, setList] = React.useState<WorkLogManagerItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [updating, setUpdating] = React.useState<string | null>(null)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    getWorkLogOfficeOptions().then((r) => {
      setDepts(r.depts || [])
      setStores(r.stores || [])
      setStaffList((r.staff || []) as WorkLogStaffOpt[])
    })
  }, [])

  const staffOptions = React.useMemo(
    () =>
      staffList
        .filter((s) => {
          if (storeFilter !== "all" && s.store !== storeFilter) return false
          if (deptFilter !== "all" && s.job !== deptFilter) return false
          return true
        })
        .map((s) => ({ ...s, label: formatWorkLogStaffSelectLabel(s) })),
    [staffList, storeFilter, deptFilter]
  )

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getWorkLogManagerReport({
        startStr,
        endStr,
        dept: deptFilter,
        employee: employeeFilter,
        status: statusFilter,
        store: storeFilter,
      })
      setList(res)
      const pending = res.filter((it) => it.managerCheck === "대기").length
      onPendingChange?.(pending)
      setSelectedIds(new Set())
    } catch {
      setList([])
      onPendingChange?.(0)
    } finally {
      setLoading(false)
    }
  }, [startStr, endStr, deptFilter, employeeFilter, statusFilter, storeFilter, onPendingChange])

  const handleSearch = () => {
    setHasSearched(true)
    void loadData()
  }

  const contentTransMapRef = React.useRef<Record<string, string>>({})

  React.useEffect(() => {
    contentTransMapRef.current = {}
    setContentTransMap({})
  }, [lang])

  const texts = React.useMemo(() => {
    const contents = list.map((it) => (it.content || "").trim()).filter(Boolean)
    const comments = list
      .map((it) => (it.managerComment || "").trim())
      .filter((c) => c && !c.startsWith("⚡"))
    return Array.from(new Set([...contents, ...comments]))
  }, [list])

  React.useEffect(() => {
    if (texts.length === 0) return
    let cancelled = false
    const CHUNK = 8
    const handle = setTimeout(() => {
      void (async () => {
        // contentTransMap을 deps에 넣지 않음 → 청크 반영 중 effect가 재실행되어 취소되지 않음
        while (!cancelled) {
          const missing = texts.filter((txt) => !(txt in contentTransMapRef.current))
          if (missing.length === 0) return
          const chunk = missing.slice(0, CHUNK)
          try {
            const translated = await translateTexts(chunk, lang)
            if (cancelled) return
            const patch: Record<string, string> = {}
            chunk.forEach((txt, i) => {
              patch[txt] = translated[i] ?? txt
            })
            contentTransMapRef.current = { ...contentTransMapRef.current, ...patch }
            setContentTransMap((prev) => ({ ...prev, ...patch }))
          } catch {
            if (cancelled) return
            // 실패해도 같은 청크 재시도 루프에 빠지지 않도록 원문으로 채움
            const patch: Record<string, string> = {}
            chunk.forEach((txt) => {
              patch[txt] = txt
            })
            contentTransMapRef.current = { ...contentTransMapRef.current, ...patch }
            setContentTransMap((prev) => ({ ...prev, ...patch }))
          }
        }
      })()
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [texts, lang])

  const getTransContent = (content: string) =>
    (content && contentTransMap[content]) || content || "-"

  const formatManagerComment = (comment: string) => {
    if (!comment) return ""
    return comment
      .replace(/이월됨/g, t("workLogCarriedOver"))
      .replace(/부터/g, t("workLogFrom"))
  }

  const getTransComment = (comment: string) => {
    const trimmed = (comment || "").trim()
    if (!trimmed) return ""
    if (trimmed.startsWith("⚡")) return formatManagerComment(trimmed)
    return contentTransMap[trimmed] || formatManagerComment(trimmed)
  }

  const getWorkTypeLabel = (status: string) => {
    const s = (status || "").trim()
    if (s === "Finish") return t("workLogTypeFinish")
    if (s === "Continue" || s === "Carry Over") return t("workLogTypeContinue")
    if (s === "Today") return t("workLogTypeToday")
    return s || "-"
  }

  const getReviewStatusLabel = (item: WorkLogManagerItem): string => {
    const check = item.managerCheck || ""
    const comment = (item.managerComment || "").trim()
    const hasComment = !!comment && !comment.startsWith("⚡")
    if (check === "대기") return t("workLogReviewWaitShort")
    if (check === "승인") return hasComment ? t("workLogStatusCommented") : t("workLogReviewOk")
    if (check === "보류") return t("workLogStatusHold")
    if (check === "반려") return t("workLogStatusRejected")
    return check
  }

  const handlePriorityChange = async (id: string, priority: string) => {
    if (!canEdit) return
    setUpdating(id)
    try {
      const res = await updateWorkLogPriority({ id, priority })
      if (res.success) await loadData()
      else
        await appAlert(
          (res as { messageKey?: string; message?: string }).messageKey
            ? t((res as { messageKey?: string }).messageKey!)
            : translateApiMessage((res as { message?: string }).message, t) || t("workLogSaveFail")
        )
    } catch {
      await appAlert(t("workLogProcessError"))
    } finally {
      setUpdating(null)
    }
  }

  const patchStatus = async (
    id: string,
    status: string,
    comment?: string
  ): Promise<boolean> => {
    setUpdating(id)
    try {
      const res = await updateWorkLogManagerCheck({
        id,
        status,
        comment: comment?.trim() || undefined,
      })
      if (res.success) {
        await loadData()
        return true
      }
      await appAlert(
        (res as { messageKey?: string }).messageKey
          ? t((res as { messageKey?: string }).messageKey!)
          : translateApiMessage(res.message, t) || t("workLogProcessError")
      )
      return false
    } catch {
      await appAlert(t("workLogProcessError"))
      return false
    } finally {
      setUpdating(null)
    }
  }

  const handleConfirm = (id: string) => {
    if (!canEdit) return
    void patchStatus(id, "승인")
  }

  const handleHold = (id: string) => {
    if (!canEdit) return
    void patchStatus(id, "보류")
  }

  const handleAddComment = async (id: string, existingComment?: string) => {
    if (!canEdit) return
    const comment = await appPrompt(t("workLogCommentPrompt"), existingComment ?? "")
    if (comment === null) return
    void patchStatus(id, "승인", comment)
  }

  const handleDelete = async (id: string) => {
    if (!canEdit) return
    if (!(await appConfirm(t("workLogDeleteConfirm")))) return
    setUpdating(id)
    try {
      const res = await deleteWorkLogItem({ id })
      if (res.success) await loadData()
      else
        await appAlert(
          (res as { messageKey?: string; message?: string }).messageKey
            ? t((res as { messageKey?: string }).messageKey!)
            : translateApiMessage((res as { message?: string }).message, t) || t("workLogDeleteFail")
        )
    } catch {
      await appAlert(t("workLogDeleteFail"))
    } finally {
      setUpdating(null)
    }
  }

  const handleBulkApprove = async () => {
    if (!canEdit || selectedIds.size === 0) return
    const msg = t("workLogBulkApproveConfirm").replace("{count}", String(selectedIds.size))
    if (!(await appConfirm(msg))) return
    for (const id of selectedIds) {
      await updateWorkLogManagerCheck({ id, status: "승인" })
    }
    await loadData()
  }

  const filteredList = React.useMemo(() => {
    const q = (contentSearch || "").trim().toLowerCase()
    if (!q) return list
    return list.filter((it) => {
      const content = (it.content || "").toLowerCase()
      const name = (it.name || "").toLowerCase()
      const dept = (it.dept || "").toLowerCase()
      const row = staffList.find((s) => s.name === it.name || s.displayName === it.name)
      const labelHay = (row ? formatWorkLogStaffSelectLabel(row) : "").toLowerCase()
      return content.includes(q) || name.includes(q) || dept.includes(q) || labelHay.includes(q)
    })
  }, [list, contentSearch, staffList])

  const filteredByWorkType = React.useMemo(() => {
    if (!workTypeFilter || workTypeFilter === "all") return filteredList
    if (workTypeFilter === "Continue") {
      return filteredList.filter(
        (it) => (it.status || "").trim() === "Continue" || (it.status || "").trim() === "Carry Over"
      )
    }
    return filteredList.filter((it) => (it.status || "").trim() === workTypeFilter)
  }, [filteredList, workTypeFilter])

  const sortedList = React.useMemo(() => {
    return [...filteredByWorkType].sort((a, b) => {
      const pendingA = a.managerCheck === "대기" ? 0 : 1
      const pendingB = b.managerCheck === "대기" ? 0 : 1
      if (pendingA !== pendingB) return pendingA - pendingB
      const dateCmp = (a.date || "").localeCompare(b.date || "")
      if (dateCmp !== 0) return dateCmp
      const typeCmp =
        workLogWorkTypeSortRank(a.status, a.progress) - workLogWorkTypeSortRank(b.status, b.progress)
      if (typeCmp !== 0) return typeCmp
      const deptCmp = (a.dept || "").localeCompare(b.dept || "")
      if (deptCmp !== 0) return deptCmp
      return (a.name || "").localeCompare(b.name || "")
    })
  }, [filteredByWorkType])

  const pendingItems = sortedList.filter((it) => it.managerCheck === "대기")

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const employeeLabel = (name: string) => {
    const row = staffList.find((s) => s.name === name || s.displayName === name)
    return row ? formatWorkLogStaffNickname(row) : name
  }

  const handleExportCsv = () => {
    if (sortedList.length === 0) return
    downloadCsv(
      `work-log-review_${startStr}_${endStr}.csv`,
      [
        t("workLogColDate"),
        t("workLogDept"),
        t("workLogColEmployee"),
        t("workLogColWorkType"),
        t("workLogColContent"),
        t("workLogPriority"),
        t("workLogColProgress"),
        t("workLogColReviewStatus"),
      ],
      sortedList.map((it) => [
        it.date,
        it.dept === "기타" ? t("workLogOther") : it.dept,
        employeeLabel(it.name),
        getWorkTypeLabel(it.status),
        it.content,
        it.priority,
        `${it.progress}%`,
        getReviewStatusLabel(it),
      ])
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {!canEdit && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2.5 text-xs text-warning">
          {t("workLogViewOnlyHint")}
        </div>
      )}

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-primary" />
              {t("workLogPeriod")}
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={startStr}
                onChange={(e) => {
                  setStartStr(e.target.value)
                  setHasSearched(false)
                }}
                className="h-9 w-32 text-xs shrink-0"
              />
              <span className="text-xs text-muted-foreground shrink-0">~</span>
              <Input
                type="date"
                value={endStr}
                onChange={(e) => {
                  setEndStr(e.target.value)
                  setHasSearched(false)
                }}
                className="h-9 w-32 text-xs shrink-0"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              {t("workLogDept")}
            </label>
            <Select
              value={deptFilter}
              onValueChange={(v) => {
                setDeptFilter(v)
                setEmployeeFilter("all")
                setHasSearched(false)
              }}
            >
              <SelectTrigger className="h-9 w-28 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {depts.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {stores.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {t("workLogStore")}
              </label>
              <Select
                value={storeFilter}
                onValueChange={(v) => {
                  setStoreFilter(v)
                  setEmployeeFilter("all")
                  setHasSearched(false)
                }}
              >
                <SelectTrigger className="h-9 w-28 text-xs shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("all")}</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              {t("workLogEmployee")}
            </label>
            <Select
              value={employeeFilter}
              onValueChange={(v) => {
                setEmployeeFilter(v)
                setHasSearched(false)
              }}
            >
              <SelectTrigger className="h-9 w-32 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Search className="h-3.5 w-3.5 text-primary" />
              {t("search")}
            </label>
            <Input
              type="text"
              placeholder={t("workLogSearchPlaceholder")}
              value={contentSearch}
              onChange={(e) => setContentSearch(e.target.value)}
              className="h-9 w-36 text-xs min-w-0"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">{t("workLogStatus")}</label>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v)
                setHasSearched(false)
              }}
            >
              <SelectTrigger className="h-9 w-28 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                <SelectItem value="대기">{t("workLogStatusWait")}</SelectItem>
                <SelectItem value="승인">{t("workLogStatusOkCommented")}</SelectItem>
                <SelectItem value="보류">{t("workLogStatusHold")}</SelectItem>
                <SelectItem value="반려">{t("workLogStatusRejected")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">{t("workLogColWorkType")}</label>
            <Select value={workTypeFilter} onValueChange={setWorkTypeFilter}>
              <SelectTrigger className="h-9 w-28 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                <SelectItem value="Finish">{t("workLogTypeFinish")}</SelectItem>
                <SelectItem value="Continue">{t("workLogTypeContinue")}</SelectItem>
                <SelectItem value="Today">{t("workLogTypeToday")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={handleSearch} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("workLogSearch")}
          </Button>
          </div>
          {sortedList.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 px-3 text-xs"
              onClick={handleExportCsv}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t("workLogExportCsv")}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 border-b bg-muted/30 px-6 py-3">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">{t("workLogApprovalTitle")}</h3>
          {pendingItems.length > 0 && (
            <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning">
              {t("workLogPendingCount")} {pendingItems.length}
            </span>
          )}
          {canEdit && selectedIds.size > 0 && (
            <Button size="sm" className="ml-auto h-8 text-xs" onClick={() => void handleBulkApprove()}>
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              {t("workLogBulkApprove")} ({selectedIds.size})
            </Button>
          )}
        </div>
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : !hasSearched ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("orderSearchHint") || "조회 버튼을 눌러 주세요."}
            </div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("workLogNoResult")}</div>
          ) : sortedList.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("workLogNoSearchResult")}</div>
          ) : (
            <>
            <AdminDesktopOnly>
            <AdminTableScroll hint={false}>
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/10">
                  {canEdit && (
                    <th className="w-10 px-3 py-2 text-center text-[11px] font-bold text-muted-foreground">
                      ✓
                    </th>
                  )}
                  <th className="px-4 py-2 text-center text-[11px] font-bold text-muted-foreground">{t("workLogColDate")}</th>
                  <th className="px-4 py-2 text-center text-[11px] font-bold text-muted-foreground">{t("workLogDept")}</th>
                  <th className="px-4 py-2 text-center text-[11px] font-bold text-muted-foreground">{t("workLogColEmployee")}</th>
                  <th className="px-4 py-2 text-center text-[11px] font-bold text-muted-foreground">
                    {t("workLogColWorkType")}
                  </th>
                  <th className="min-w-[320px] px-4 py-2 text-center text-[11px] font-bold text-muted-foreground">{t("workLogColContent")}</th>
                  <th className="px-4 py-2 text-center text-[11px] font-bold text-muted-foreground">
                    {t("workLogPriority")}
                  </th>
                  <th className="px-4 py-2 text-center text-[11px] font-bold text-muted-foreground">
                    {t("workLogColProgress")}
                  </th>
                  <th className="px-4 py-2 text-center text-[11px] font-bold text-muted-foreground">
                    {t("workLogColReviewStatus")}
                  </th>
                  <th className="w-[4.75rem] px-2 py-2 text-center text-[11px] font-bold text-muted-foreground">
                    {t("workLogColAction")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedList.map((it) => {
                  const hasComment =
                    !!it.managerComment?.trim() && !it.managerComment.startsWith("⚡")
                  const isPending = it.managerCheck === "대기"
                  return (
                    <tr key={it.id} className="border-b last:border-b-0 hover:bg-muted/5 align-top">
                      {canEdit && (
                        <td className="px-3 py-2 text-center">
                          {isPending ? (
                            <Checkbox
                              checked={selectedIds.has(it.id)}
                              onCheckedChange={() => toggleSelect(it.id)}
                              aria-label="select"
                            />
                          ) : null}
                        </td>
                      )}
                      <td className="px-4 py-2 text-xs text-center tabular-nums whitespace-nowrap">
                        {formatWorkLogDateMonthDay(it.date)}
                      </td>
                      <td className="px-4 py-2 text-xs text-center whitespace-nowrap">
                        {it.dept === "기타" ? t("workLogOther") : it.dept}
                      </td>
                      <td className="px-4 py-2 text-xs font-medium text-center whitespace-nowrap">{employeeLabel(it.name)}</td>
                      <td className="px-4 py-2 text-center">
                        <span
                          className={cn(
                            "inline-flex rounded px-2 py-0.5 text-[10px] font-semibold",
                            workLogWorkTypeBadgeClass(it.status)
                          )}
                        >
                          {getWorkTypeLabel(it.status)}
                        </span>
                      </td>
                      <td className="px-4 py-2 min-w-[320px]">
                        <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                          {getTransContent(it.content || "")}
                        </p>
                        {it.managerComment && (
                          <p className="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
                            {getTransComment(it.managerComment)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Select
                          value={it.priority || "_none"}
                          onValueChange={(v) => handlePriorityChange(it.id, v === "_none" ? "" : v)}
                          disabled={!canEdit || updating === it.id}
                        >
                          <SelectTrigger className="h-7 w-20 mx-auto text-[10px]">
                            <SelectValue placeholder={t("workLogPriority")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">-</SelectItem>
                            {WORK_LOG_PRIORITIES.map((p) => (
                              <SelectItem key={p.value} value={p.value}>
                                {t(p.key)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2 text-center text-xs font-bold tabular-nums">{it.progress}%</td>
                      <td className="px-4 py-2 text-center">
                        <span
                          className={cn(
                            "inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold",
                            workLogReviewBadgeClass(it.managerCheck, hasComment)
                          )}
                        >
                          {getReviewStatusLabel(it)}
                        </span>
                      </td>
                      <td className="w-[4.75rem] px-2 py-2">
                        {canEdit ? (
                          <div className="mx-auto grid w-fit grid-cols-2 gap-1">
                            {isPending ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 shrink-0 p-0 text-success"
                                  onClick={() => handleConfirm(it.id)}
                                  disabled={updating === it.id}
                                  title={t("workLogConfirmBtn")}
                                >
                                  ✓
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 shrink-0 p-0 text-primary"
                                  onClick={() => void handleAddComment(it.id, it.managerComment)}
                                  disabled={updating === it.id}
                                  title={t("workLogCommentBtn")}
                                >
                                  <MessageSquarePlus className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 shrink-0 p-0 text-warning"
                                  onClick={() => handleHold(it.id)}
                                  disabled={updating === it.id}
                                  title={t("workLogHoldBtn")}
                                >
                                  <PauseCircle className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 shrink-0 p-0 text-destructive"
                                  onClick={() => void handleDelete(it.id)}
                                  disabled={updating === it.id}
                                  title={t("workLogDeleteBtn")}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 shrink-0 p-0 text-primary"
                                  onClick={() => void handleAddComment(it.id, it.managerComment)}
                                  disabled={updating === it.id}
                                  title={t("workLogCommentBtn")}
                                >
                                  <MessageSquarePlus className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 shrink-0 p-0 text-destructive"
                                  onClick={() => void handleDelete(it.id)}
                                  disabled={updating === it.id}
                                  title={t("workLogDeleteBtn")}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </AdminTableScroll>
            </AdminDesktopOnly>
            <AdminMobileOnly className="divide-y divide-border/60">
              {sortedList.map((it) => {
                const hasComment =
                  !!it.managerComment?.trim() && !it.managerComment.startsWith("⚡")
                const isPending = it.managerCheck === "대기"
                return (
                  <div key={it.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start gap-2">
                      {canEdit && isPending ? (
                        <Checkbox
                          checked={selectedIds.has(it.id)}
                          onCheckedChange={() => toggleSelect(it.id)}
                          className="mt-1"
                          aria-label="select"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold tabular-nums">
                            {formatWorkLogDateMonthDay(it.date)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {it.dept === "기타" ? t("workLogOther") : it.dept} · {employeeLabel(it.name)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex rounded px-2 py-0.5 text-[10px] font-semibold",
                              workLogWorkTypeBadgeClass(it.status)
                            )}
                          >
                            {getWorkTypeLabel(it.status)}
                          </span>
                          <span
                            className={cn(
                              "inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold",
                              workLogReviewBadgeClass(it.managerCheck, hasComment)
                            )}
                          >
                            {getReviewStatusLabel(it)}
                          </span>
                          <span className="text-xs font-bold tabular-nums">{it.progress}%</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                          {getTransContent(it.content || "")}
                        </p>
                        {it.managerComment ? (
                          <p className="text-[10px] text-muted-foreground whitespace-pre-wrap">
                            {getTransComment(it.managerComment)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={it.priority || "_none"}
                        onValueChange={(v) => handlePriorityChange(it.id, v === "_none" ? "" : v)}
                        disabled={!canEdit || updating === it.id}
                      >
                        <SelectTrigger className="h-9 w-[7rem] text-xs">
                          <SelectValue placeholder={t("workLogPriority")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">-</SelectItem>
                          {WORK_LOG_PRIORITIES.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {t(p.key)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {canEdit ? (
                        <>
                          {isPending ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 gap-1 text-xs text-success"
                                onClick={() => handleConfirm(it.id)}
                                disabled={updating === it.id}
                              >
                                ✓ {t("workLogConfirmBtn")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 gap-1 text-xs"
                                onClick={() => void handleAddComment(it.id, it.managerComment)}
                                disabled={updating === it.id}
                              >
                                <MessageSquarePlus className="h-3.5 w-3.5" />
                                {t("workLogCommentBtn")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 gap-1 text-xs text-warning"
                                onClick={() => handleHold(it.id)}
                                disabled={updating === it.id}
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                                {t("workLogHoldBtn")}
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 gap-1 text-xs"
                              onClick={() => void handleAddComment(it.id, it.managerComment)}
                              disabled={updating === it.id}
                            >
                              <MessageSquarePlus className="h-3.5 w-3.5" />
                              {t("workLogCommentBtn")}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 gap-1 text-xs text-destructive"
                            onClick={() => void handleDelete(it.id)}
                            disabled={updating === it.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("workLogDeleteBtn")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </AdminMobileOnly>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

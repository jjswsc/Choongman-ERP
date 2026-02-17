"use client"

import * as React from "react"
import {
  CalendarIcon,
  Search,
  ShieldCheck,
  CheckCircle2,
  MessageSquarePlus,
  Building2,
  User,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

function defaultStartStr() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function WorklogApproval() {
  const { lang } = useLang()
  const t = useT(lang)
  const [contentTransMap, setContentTransMap] = React.useState<Record<string, string>>({})
  const [startStr, setStartStr] = React.useState(defaultStartStr)
  const [endStr, setEndStr] = React.useState(todayStr)
  const [deptFilter, setDeptFilter] = React.useState("all")
  const [employeeFilter, setEmployeeFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [depts, setDepts] = React.useState<string[]>([])
  const [staffList, setStaffList] = React.useState<{ name: string; displayName: string }[]>([])
  const [list, setList] = React.useState<WorkLogManagerItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [updating, setUpdating] = React.useState<string | null>(null)

  React.useEffect(() => {
    getWorkLogOfficeOptions().then((r) => {
      setDepts(r.depts || [])
      setStaffList(r.staff || [])
    })
  }, [])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getWorkLogManagerReport({
        startStr,
        endStr,
        dept: deptFilter,
        employee: employeeFilter,
        status: statusFilter,
      })
      setList(res)
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [startStr, endStr, deptFilter, employeeFilter, statusFilter])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    const contents = [...new Set(list.map((it) => it.content).filter(Boolean))]
    const comments = list
      .map((it) => (it.managerComment || "").trim())
      .filter((c) => c && !c.startsWith("⚡"))
    const texts = [...new Set([...contents, ...comments])]
    if (texts.length === 0) {
      setContentTransMap({})
      return
    }
    let cancelled = false
    translateTexts(texts, lang).then((translated) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      texts.forEach((txt, i) => { map[txt] = translated[i] ?? txt })
      setContentTransMap(map)
    }).catch(() => setContentTransMap({}))
    return () => { cancelled = true }
  }, [list, lang])

  const getTransContent = (content: string) => (content && contentTransMap[content]) || content || "-"
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
  const getReviewStatusDisplay = (item: WorkLogManagerItem) => {
    const check = item.managerCheck || ""
    const comment = (item.managerComment || "").trim()
    const hasComment = !!comment && !comment.startsWith("⚡")
    if (check === "대기") return t("statusPending")
    if (check === "승인") return hasComment ? t("workLogStatusCommented") : t("workLogStatusConfirmed")
    return check
  }
  const PRIORITIES = [
    { value: "긴급", key: "workLogPriorityUrgent" },
    { value: "상", key: "workLogPriorityHigh" },
    { value: "중", key: "workLogPriorityMedium" },
    { value: "하", key: "workLogPriorityLow" },
  ] as const

  const handlePriorityChange = async (id: string, priority: string) => {
    setUpdating(id)
    try {
      const res = await updateWorkLogPriority({ id, priority })
      if (res.success) loadData()
      else alert((res as { messageKey?: string; message?: string }).messageKey ? t((res as { messageKey?: string }).messageKey!) : translateApiMessage((res as { message?: string }).message, t) || t("workLogSaveFail"))
    } catch {
      alert(t("workLogProcessError"))
    } finally {
      setUpdating(null)
    }
  }

  const handleConfirm = async (id: string) => {
    setUpdating(id)
    try {
      const res = await updateWorkLogManagerCheck({ id, status: "승인" })
      if (res.success) loadData()
      else alert((res as { messageKey?: string }).messageKey ? t((res as { messageKey?: string }).messageKey!) : (translateApiMessage(res.message, t) || t("workLogProcessError")))
    } catch {
      alert(t("workLogProcessError"))
    } finally {
      setUpdating(null)
    }
  }

  const handleAddComment = async (id: string) => {
    const comment = prompt(t("workLogCommentPrompt"))
    if (comment === null) return
    setUpdating(id)
    try {
      const res = await updateWorkLogManagerCheck({
        id,
        status: "승인",
        comment: comment.trim() || undefined,
      })
      if (res.success) loadData()
      else alert((res as { messageKey?: string }).messageKey ? t((res as { messageKey?: string }).messageKey!) : (translateApiMessage(res.message, t) || t("workLogProcessError")))
    } catch {
      alert(t("workLogProcessError"))
    } finally {
      setUpdating(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t("workLogDeleteConfirm"))) return
    setUpdating(id)
    try {
      const res = await deleteWorkLogItem({ id })
      if (res.success) loadData()
      else alert((res as { messageKey?: string; message?: string }).messageKey ? t((res as { messageKey?: string }).messageKey!) : (translateApiMessage((res as { message?: string }).message, t) || t("workLogDeleteFail")))
    } catch {
      alert(t("workLogDeleteFail"))
    } finally {
      setUpdating(null)
    }
  }

  const pendingItems = list.filter((it) => it.managerCheck === "대기")
  const byDept = React.useMemo(() => {
    const map: Record<string, Record<string, WorkLogManagerItem[]>> = {}
    for (const it of list) {
      const d = it.dept || "기타"
      const n = it.name || ""
      if (!map[d]) map[d] = {}
      if (!map[d][n]) map[d][n] = []
      map[d][n].push(it)
    }
    return map
  }, [list])

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-primary" />
              {t("workLogPeriod")}
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className="h-9 w-36 text-xs"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <Input
                type="date"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                className="h-9 w-36 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              {t("workLogDept")}
            </label>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-9 w-32 text-xs">
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
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              {t("workLogEmployee")}
            </label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.name} value={s.displayName || s.name}>
                    {s.displayName || s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">{t("workLogStatus")}</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                <SelectItem value="대기">{t("statusPending")}</SelectItem>
                <SelectItem value="승인">{t("workLogStatusConfirmed")} / {t("workLogStatusCommented")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={loadData} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("workLogSearch")}
          </Button>
        </div>
      </div>

      {/* Table by dept/employee */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 border-b bg-muted/30 px-6 py-3">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">{t("workLogApprovalTitle")}</h3>
          {pendingItems.length > 0 && (
            <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning">
              {t("workLogPendingCount")} {pendingItems.length}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("workLogNoResult")}
            </div>
          ) : (
            <div className="divide-y">
              {Object.entries(byDept).map(([dept, byName]) => (
                <div key={dept}>
                  {Object.entries(byName).map(([name, items]) => (
                    <div key={`${dept}-${name}`} className="border-b last:border-b-0">
                      <div className="bg-muted/20 px-5 py-2 text-xs font-bold text-muted-foreground">
                        {(dept === "기타" ? t("workLogOther") : dept)} · {staffList.find((s) => s.name === name || s.displayName === name)?.displayName || name}
                      </div>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b bg-muted/10">
                            <th className="px-5 py-2 text-[11px] font-bold text-muted-foreground text-center w-32 whitespace-nowrap">{t("workLogColDate")}</th>
                            <th className="px-5 py-2 text-[11px] font-bold text-muted-foreground text-center">{t("workLogColContent")}</th>
                            <th className="px-5 py-2 text-[11px] font-bold text-muted-foreground text-center w-16">{t("workLogPriority")}</th>
                            <th className="px-5 py-2 text-[11px] font-bold text-muted-foreground text-center w-20">{t("workLogColProgress")}</th>
                            <th className="px-5 py-2 text-[11px] font-bold text-muted-foreground text-center w-24">{t("workLogColReviewStatus")}</th>
                            <th className="px-5 py-2 text-[11px] font-bold text-muted-foreground text-center w-36">{t("workLogColAction")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => (
                            <tr key={it.id} className="border-b last:border-b-0 hover:bg-muted/5">
                              <td className="px-5 py-2 text-xs tabular-nums text-center whitespace-nowrap">{it.date}</td>
                              <td className="px-5 py-2">
                                <p className="text-sm text-foreground">{getTransContent(it.content || "")}</p>
                                {it.managerComment && (
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">{getTransComment(it.managerComment)}</p>
                                )}
                              </td>
                              <td className="px-5 py-2 text-center">
                                <Select
                                  value={it.priority || "_none"}
                                  onValueChange={(v) => handlePriorityChange(it.id, v === "_none" ? "" : v)}
                                  disabled={updating === it.id}
                                >
                                  <SelectTrigger className="h-7 w-20 mx-auto text-[10px]">
                                    <SelectValue placeholder={t("workLogPriority")} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_none">-</SelectItem>
                                    {PRIORITIES.map((p) => (
                                      <SelectItem key={p.value} value={p.value}>
                                        {t(p.key)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-5 py-2 text-center">
                                <span className="text-xs font-bold tabular-nums">{it.progress}%</span>
                              </td>
                              <td className="px-5 py-2 text-center">
                                <span
                                  className={cn(
                                    "inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold",
                                    it.managerCheck === "승인" && (it.managerComment?.trim() && !it.managerComment.startsWith("⚡") ? "bg-primary/10 text-primary" : "bg-success/10 text-success"),
                                    it.managerCheck === "대기" && "bg-warning/10 text-warning"
                                  )}
                                >
                                  {getReviewStatusDisplay(it)}
                                </span>
                              </td>
                              <td className="px-5 py-2">
                                <div className="flex flex-row items-center gap-2">
                                  {it.managerCheck === "대기" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[10px] text-success shrink-0"
                                        onClick={() => handleConfirm(it.id)}
                                        disabled={updating === it.id}
                                      >
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        {t("workLogConfirmBtn")}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[10px] text-primary shrink-0"
                                        onClick={() => handleAddComment(it.id)}
                                        disabled={updating === it.id}
                                      >
                                        <MessageSquarePlus className="mr-1 h-3 w-3" />
                                        {t("workLogCommentBtn")}
                                      </Button>
                                    </>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px] text-destructive hover:text-destructive shrink-0"
                                    onClick={() => handleDelete(it.id)}
                                    disabled={updating === it.id}
                                    title={t("workLogDeleteBtn")}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

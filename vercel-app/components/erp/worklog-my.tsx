"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import {
  CalendarIcon,
  User,
  CheckCircle2,
  ArrowRightFromLine,
  Play,
  Plus,
  Save,
  LogOut,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getWorkLogStaffList,
  getWorkLogData,
  saveWorkLogData,
  submitDailyClose,
  translateTexts,
  type WorkLogItem,
  type WorkLogData,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { formatWorkLogStaffSelectLabel } from "@/lib/work-log-name"
import { normalizeWorkLogContent, workLogContentKey } from "@/lib/work-log-dedupe"

const PRIORITIES = [
  { value: "긴급", key: "workLogPriorityUrgent" },
  { value: "상", key: "workLogPriorityHigh" },
  { value: "중", key: "workLogPriorityMedium" },
  { value: "하", key: "workLogPriorityLow" },
] as const

/** 슬라이더 조정 후 자동 저장 대기(ms) */
const PROGRESS_AUTO_SAVE_MS = 700

interface WorklogMyProps {
  userName: string
  /** 로그인 세션의 employees.id — 저장·조회 시 이름 오매칭 방지 */
  employeeId?: number
}

export function WorklogMy({ userName, employeeId }: WorklogMyProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [startStr, setStartStr] = React.useState(() => getBangkokTodayDateString())
  const [endStr, setEndStr] = React.useState(() => getBangkokTodayDateString())
  const [selectedStaff, setSelectedStaff] = React.useState(userName)
  const [staffList, setStaffList] = React.useState<{ id: number; name: string; displayName: string }[]>([])
  const [_data, setData] = React.useState<WorkLogData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [localFinish, setLocalFinish] = React.useState<WorkLogItem[]>([])
  const [localContinue, setLocalContinue] = React.useState<WorkLogItem[]>([])
  const [localToday, setLocalToday] = React.useState<WorkLogItem[]>([])
  const [selectedContinueIds, setSelectedContinueIds] = React.useState<Set<string>>(new Set())
  const [contentTransMap, setContentTransMap] = React.useState<Record<string, string>>({})
  const [hasSearched, setHasSearched] = React.useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle")
  const localFinishRef = React.useRef(localFinish)
  const localContinueRef = React.useRef(localContinue)
  const localTodayRef = React.useRef(localToday)
  const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSaveGenRef = React.useRef(0)
  const persistChainRef = React.useRef(Promise.resolve())
  const unfinishedCount = React.useMemo(() => {
    const continueCount = localContinue.filter((it) => {
      const hasContent = Boolean((it.content || "").trim())
      const progress = Number(it.progress) || 0
      return hasContent && progress < 100
    }).length
    const todayCount = localToday.filter((it) => {
      const hasContent = Boolean((it.content || "").trim())
      const progress = Number(it.progress) || 0
      return hasContent && progress < 100
    }).length
    return continueCount + todayCount
  }, [localContinue, localToday])

  React.useEffect(() => {
    localFinishRef.current = localFinish
    localContinueRef.current = localContinue
    localTodayRef.current = localToday
  }, [localFinish, localContinue, localToday])

  const cancelPendingAutoSave = React.useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    autoSaveGenRef.current += 1
    setAutoSaveStatus("idle")
  }, [])

  React.useEffect(() => () => cancelPendingAutoSave(), [cancelPendingAutoSave])

  React.useEffect(() => {
    if (userName) setSelectedStaff(userName)
  }, [userName])

  React.useEffect(() => {
    if (staffList.length > 0 && selectedStaff && !staffList.some((s) => s.name === selectedStaff)) {
      const match = staffList.find((s) => s.displayName === selectedStaff || s.name === selectedStaff)
      if (match) setSelectedStaff(match.name)
    }
  }, [staffList, selectedStaff])

  React.useEffect(() => {
    getWorkLogStaffList().then((r) => setStaffList(r.staff || []))
  }, [])

  // 직원은 로그인 사용자로 고정
  React.useEffect(() => {
    if (userName) setSelectedStaff(userName)
  }, [userName])

  const loadData = React.useCallback(async (opts?: { quiet?: boolean }) => {
    if (!selectedStaff) return
    cancelPendingAutoSave()
    if (!opts?.quiet) setLoading(true)
    try {
      const res = await getWorkLogData({
        dateStr: endStr,
        name: selectedStaff,
        ...(employeeId != null && employeeId > 0 ? { employeeId } : {}),
      })
      setData(res)
      setLocalFinish(res.finish || [])
      setLocalContinue(res.continueItems || [])
      setLocalToday(res.todayItems || [])
    } catch {
      setData(null)
      setLocalFinish([])
      setLocalContinue([])
      setLocalToday([])
    } finally {
      if (!opts?.quiet) setLoading(false)
    }
  }, [endStr, selectedStaff, employeeId, cancelPendingAutoSave])

  const buildTodayLogsForSave = React.useCallback((): WorkLogItem[] => {
    return localTodayRef.current
      .filter((it) => Boolean(normalizeWorkLogContent(it.content)))
      .map((it) => ({
        ...it,
        progress: Number(it.progress) || 0,
      }))
  }, [])

  const buildAllLogs = React.useCallback((): WorkLogItem[] => {
    const finish = localFinishRef.current
    const cont = localContinueRef.current
    const today = localTodayRef.current
    return [
      ...finish.map((it) => ({ ...it, type: undefined })),
      ...cont.map((it) => ({
        ...it,
        type: "continue" as const,
        progress: Number(it.progress) || 0,
      })),
      ...today.map((it) => ({ ...it, type: undefined })),
    ].filter((it) => it.content || it.id)
  }, [])

  const runPersistWorkLogProgress = React.useCallback(
    async (opts?: { silent?: boolean; reload?: boolean; todayOnly?: boolean }) => {
      const silent = opts?.silent ?? false
      const reload = opts?.reload ?? !silent
      const todayOnly = opts?.todayOnly ?? false
      if (!selectedStaff || !hasSearched) return false
      if (!silent && unfinishedCount > 0) {
        const proceed = await appConfirm(
          `미완료 업무가 ${unfinishedCount}건 있습니다.\n` +
            `Save Progress만 하면 Continue가 생성되지 않습니다.\n` +
            `익일 Continue 생성을 원하면 Daily Close를 눌러주세요.\n\n` +
            `그래도 Save Progress를 진행할까요?`
        )
        if (!proceed) return false
      }
      if (silent) setAutoSaveStatus("saving")
      else setSaving(true)
      try {
        const logs = todayOnly ? buildTodayLogsForSave() : buildAllLogs()
        if (todayOnly && logs.length === 0) return true

        const res = await saveWorkLogData({
          date: endStr,
          name: selectedStaff,
          logs,
          ...(employeeId != null && employeeId > 0 ? { employeeId } : {}),
        })
        if (res.success) {
          if (reload) await loadData({ quiet: silent })
          return true
        }
        if (!silent) {
          const r = res as { messageKey?: string; message?: string }
          await appAlert(
            r.messageKey
              ? t(r.messageKey)
              : translateApiMessage(r.message, t) || t("workLogSaveFail")
          )
        }
        return false
      } catch {
        if (!silent) await appAlert(t("workLogSaveError"))
        return false
      } finally {
        if (!silent) setSaving(false)
      }
    },
    [
      selectedStaff,
      hasSearched,
      unfinishedCount,
      endStr,
      employeeId,
      buildAllLogs,
      buildTodayLogsForSave,
      loadData,
      t,
    ]
  )

  const persistWorkLogProgress = React.useCallback(
    (opts?: { silent?: boolean; reload?: boolean; todayOnly?: boolean }) => {
      const task = runPersistWorkLogProgress(opts)
      const chained = persistChainRef.current.then(() => task, () => task)
      persistChainRef.current = chained.then(
        () => undefined,
        () => undefined
      )
      return chained
    },
    [runPersistWorkLogProgress]
  )

  const scheduleAutoSaveProgress = React.useCallback(() => {
    if (!hasSearched || !selectedStaff) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null
      const gen = ++autoSaveGenRef.current
      void (async () => {
        setAutoSaveStatus("saving")
        const ok = await persistWorkLogProgress({
          silent: true,
          reload: true,
          todayOnly: true,
        })
        if (gen !== autoSaveGenRef.current) return
        setAutoSaveStatus(ok ? "saved" : "error")
        if (ok) {
          setTimeout(() => {
            setAutoSaveStatus((s) => (s === "saved" ? "idle" : s))
          }, 2000)
        }
      })()
    }, PROGRESS_AUTO_SAVE_MS)
  }, [hasSearched, selectedStaff, persistWorkLogProgress])

  const handleSearch = () => {
    setHasSearched(true)
    loadData()
  }

  const contentsToTranslate = React.useMemo(() => {
    const set = new Set<string>()
    for (const it of localFinish) {
      if (it.content?.trim()) set.add(it.content.trim())
      const c = it.managerComment?.trim()
      if (c && !c.startsWith("⚡")) set.add(c)
    }
    for (const it of localContinue) {
      if (it.content?.trim()) set.add(it.content.trim())
      const c = it.managerComment?.trim()
      if (c && !c.startsWith("⚡")) set.add(c)
    }
    for (const it of localToday) {
      if (it.content?.trim()) set.add(it.content.trim())
      const c = it.managerComment?.trim()
      if (c && !c.startsWith("⚡")) set.add(c)
    }
    return Array.from(set)
  }, [localFinish, localContinue, localToday])

  // 언어가 바뀌면 이전 언어로 번역된 캐시는 버린다
  React.useEffect(() => {
    setContentTransMap({})
  }, [lang])

  React.useEffect(() => {
    if (contentsToTranslate.length === 0) return
    const missing = contentsToTranslate.filter((txt) => !(txt in contentTransMap))
    if (missing.length === 0) return
    let cancelled = false
    const handle = setTimeout(() => {
      translateTexts(missing, lang).then((translated) => {
        if (cancelled) return
        setContentTransMap((prev) => {
          const next = { ...prev }
          missing.forEach((txt, i) => { next[txt] = translated[i] ?? txt })
          return next
        })
      }).catch(() => { /* 실패 시 원문 표시 유지 */ })
    }, 350)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [contentsToTranslate.join("\u241E"), lang, contentTransMap])

  const getTransContent = (content: string) => (content?.trim() && contentTransMap[content.trim()]) || content || t("workLogNoContent")

  const addNewContinue = () => {
    setLocalContinue((prev) => [
      ...prev,
      {
        id: `_temp_${Date.now()}`,
        content: "",
        progress: 0,
        status: "Continue",
        priority: "중",
      },
    ])
  }

  const toggleSelectContinue = (id: string) => {
    setSelectedContinueIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const moveSelectedToToday = () => {
    if (selectedContinueIds.size === 0) return
    const toMove = localContinue.filter((it) => selectedContinueIds.has(it.id || ""))
    const toKeep = localContinue.filter((it) => !selectedContinueIds.has(it.id || ""))
    setLocalContinue(toKeep)
    setLocalToday((prev) => {
      const existingKeys = new Set(prev.map((it) => workLogContentKey(it.content)))
      const added = toMove
        .filter((it) => !existingKeys.has(workLogContentKey(it.content)))
        .map((it) => ({
          ...it,
          status: "Today",
          progress: Number(it.progress) || 0,
        }))
      const next = [...prev, ...added]
      localTodayRef.current = next
      return next
    })
    setSelectedContinueIds(new Set())
  }

  const updateContent = (
    setList: React.Dispatch<React.SetStateAction<WorkLogItem[]>>,
    idOrIndex: string | number,
    content: string
  ) => {
    setList((prev) => {
      if (typeof idOrIndex === 'number') {
        return prev.map((it, i) => (i === idOrIndex ? { ...it, content } : it))
      }
      return prev.map((it) => (it.id === idOrIndex ? { ...it, content } : it))
    })
  }

  const updatePriority = (
    setList: React.Dispatch<React.SetStateAction<WorkLogItem[]>>,
    idOrIndex: string | number,
    priority: string
  ) => {
    setList((prev) => {
      if (typeof idOrIndex === 'number') {
        return prev.map((it, i) => (i === idOrIndex ? { ...it, priority } : it))
      }
      return prev.map((it) => (it.id === idOrIndex ? { ...it, priority } : it))
    })
  }

  const formatManagerComment = (comment: string) => {
    if (!comment) return ""
    return comment
      .replace(/이월됨/g, t("workLogCarriedOver") || "Carried over")
      .replace(/부터/g, t("workLogFrom") || "from")
  }

  const getTransComment = (comment: string) => {
    const trimmed = comment?.trim()
    if (!trimmed) return ""
    if (trimmed.startsWith("⚡")) return formatManagerComment(trimmed)
    return contentTransMap[trimmed] || formatManagerComment(trimmed)
  }

  const ManagerFeedback = ({ item }: { item: WorkLogItem }) => {
    const confirmed = item.managerCheck === "승인"
    const rawComment = item.managerComment?.trim() || ""
    const isCarryOverMsg = rawComment.startsWith("⚡")
    const hasComment = !!rawComment && !isCarryOverMsg
    if (!confirmed && !hasComment) return null
    return (
      <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs">
        {confirmed && (
          <span className="inline-flex items-center gap-1 font-semibold text-primary">
            ✓ {t("workLogReviewConfirmed")}
          </span>
        )}
        {hasComment && (
          <p className="mt-1 text-foreground">
            <span className="font-semibold text-muted-foreground">{t("workLogManagerFeedback")}:</span>{" "}
            {getTransComment(rawComment)}
          </p>
        )}
      </div>
    )
  }

  const handleTodayProgressChange = (index: number, progress: number) => {
    setLocalToday((prev) => {
      const next = prev.map((it, i) =>
        i === index
          ? { ...it, progress, status: progress >= 100 ? "Finish" : it.status }
          : it
      )
      localTodayRef.current = next
      return next
    })
    scheduleAutoSaveProgress()
  }

  const handleSaveProgress = async () => {
    if (!selectedStaff) return
    cancelPendingAutoSave()
    await persistWorkLogProgress({ silent: false, reload: true })
  }

  const handleDailyClose = async () => {
    if (!selectedStaff) return
    cancelPendingAutoSave()
    if (!await appConfirm(t("workLogDailyCloseConfirm"))) return
    setSaving(true)
    try {
      const toClose = [...localContinue, ...localToday].filter((it) => it.content || it.id)
      const res = await submitDailyClose({
        date: endStr,
        name: selectedStaff,
        logs: toClose,
        ...(employeeId != null && employeeId > 0 ? { employeeId } : {}),
      })
      if (res.success) {
        loadData()
        await appAlert((res as { messageKey?: string }).messageKey ? t((res as { messageKey?: string }).messageKey!) : (translateApiMessage(res.message, t) || t("workLogCloseDone")))
      } else {
        const r = res as { messageKey?: string; message?: string }
        await appAlert(r.message ? `${t(r.messageKey || "workLogCloseFail")}: ${translateApiMessage(r.message, t)}` : t(r.messageKey || "workLogCloseFail"))
      }
    } catch (_e) {
      await appAlert(t("workLogCloseError"))
    } finally {
      setSaving(false)
    }
  }

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
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={startStr}
                onChange={(e) => {
                  cancelPendingAutoSave()
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
                  cancelPendingAutoSave()
                  setEndStr(e.target.value)
                  setHasSearched(false)
                }}
                className="h-9 w-32 text-xs shrink-0"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              {t("workLogEmployee")}
            </label>
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-xs font-medium">
              {(() => {
                const row = staffList.find(
                  (s) => s.name === selectedStaff || s.displayName === selectedStaff
                )
                return row ? formatWorkLogStaffSelectLabel(row) : selectedStaff || userName
              })()}
            </div>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={handleSearch} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("workLogSearch")}
          </Button>
          <Button size="sm" variant="outline" className="h-9 px-4 text-xs font-semibold" onClick={handleSaveProgress} disabled={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {t("workLogSaveProgress")}
          </Button>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={handleDailyClose} disabled={saving}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            {t("workLogDailyClose")}
          </Button>
        </div>
      </div>

      {!hasSearched ? (
        <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
          {t("orderSearchHint") || "조회 버튼을 눌러 주세요."}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center rounded-xl border bg-card py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* 직렬 배치: Finish → Continue → Today */}
          {/* Finish Work */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 border-b bg-success/5 px-5 py-3">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <h3 className="text-sm font-bold text-foreground">{t("workLogFinishWork")}</h3>
            </div>
            <div className="min-h-[80px] max-h-64 overflow-y-auto p-4 space-y-2">
              {localFinish.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("workLogNoFinish")}</p>
              ) : (
                localFinish.map((it) => (
                  <div key={it.id} className="rounded-lg border bg-background p-3 text-sm">
                    <p className="font-medium text-foreground whitespace-pre-wrap">{getTransContent(it.content || "")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{it.progress}%</p>
                    <ManagerFeedback item={it} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Continue Work */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 border-b bg-warning/5 px-5 py-3">
              <ArrowRightFromLine className="h-4 w-4 text-warning" />
              <h3 className="text-sm font-bold text-foreground">{t("workLogContinueWork")}</h3>
              <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={addNewContinue} title={t("workLogAddTask")}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {selectedContinueIds.size > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border-b">
                <Button size="sm" className="h-7 text-xs" onClick={moveSelectedToToday}>
                  <Play className="mr-1 h-3 w-3" />
                  {t("workLogStartToday")} ({selectedContinueIds.size})
                </Button>
              </div>
            )}
            <div className="min-h-[80px] max-h-64 overflow-y-auto p-4 space-y-2">
              {localContinue.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("workLogNoContinue")}</p>
              ) : (
                localContinue.map((it) => (
                  <div key={it.id} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={selectedContinueIds.has(it.id || "")}
                        onChange={() => toggleSelectContinue(it.id || "")}
                        className="mt-2.5 h-4 w-4 shrink-0"
                      />
                      <Textarea
                        value={it.content}
                        onChange={(e) => updateContent(setLocalContinue, it.id, e.target.value)}
                        placeholder={t("workLogTaskPlaceholder")}
                        className="min-h-[36px] text-xs flex-1 resize-y"
                        rows={1}
                      />
                      <Select
                        value={it.priority || ""}
                        onValueChange={(v) => updatePriority(setLocalContinue, it.id, v)}
                      >
                        <SelectTrigger className="h-8 w-20 shrink-0 text-xs">
                          <SelectValue placeholder={t("workLogPriority")} />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {t(p.key)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs font-bold text-muted-foreground">
                      {Number(it.progress) || 0}% · {t("workLogProgressHint")}
                    </p>
                    {it.managerComment?.startsWith("⚡") && (
                      <p className="mt-1 text-[10px] text-muted-foreground">{formatManagerComment(it.managerComment)}</p>
                    )}
                    <ManagerFeedback item={it} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Today Work */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 border-b bg-primary/5 px-5 py-3">
              <Play className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">{t("workLogTodayWork")}</h3>
              {autoSaveStatus !== "idle" && (
                <span
                  className={`ml-auto text-[10px] font-medium tabular-nums ${
                    autoSaveStatus === "error" ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {autoSaveStatus === "saving"
                    ? t("loading")
                    : autoSaveStatus === "saved"
                      ? t("workLogSaveDone")
                      : t("workLogSaveFail")}
                </span>
              )}
            </div>
            <div className="min-h-[80px] max-h-64 overflow-y-auto p-4 space-y-2">
              {localToday.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("workLogNoToday")}</p>
              ) : (
                localToday.map((it, idx) => (
                  <div key={it.id || `new-${idx}`} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <Textarea
                        value={it.content}
                        onChange={(e) => updateContent(setLocalToday, idx, e.target.value)}
                        placeholder={t("workLogTaskPlaceholder")}
                        className="min-h-[36px] text-xs flex-1 resize-y"
                        rows={1}
                      />
                      <Select
                        value={it.priority || ""}
                        onValueChange={(v) => updatePriority(setLocalToday, idx, v)}
                      >
                        <SelectTrigger className="h-8 w-20 shrink-0 text-xs">
                          <SelectValue placeholder={t("workLogPriority")} />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {t(p.key)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={it.progress}
                        onChange={(e) => handleTodayProgressChange(idx, Number(e.target.value))}
                        className="h-2 flex-1"
                      />
                      <span className="text-xs font-bold w-8">{it.progress}%</span>
                    </div>
                    <ManagerFeedback item={it} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

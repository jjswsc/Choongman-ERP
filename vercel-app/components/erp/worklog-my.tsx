"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams } from "next/navigation"
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
  Trash2,
  BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getWorkLogStaffList,
  getWorkLogData,
  saveWorkLogData,
  submitDailyClose,
  deleteWorkLogItem,
  translateTexts,
  type WorkLogItem,
  type WorkLogData,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { formatWorkLogStaffSelectLabel } from "@/lib/work-log-name"
import {
  isEphemeralWorkLogId,
  normalizeWorkLogContent,
  workLogContentKey,
} from "@/lib/work-log-dedupe"
import { WORK_LOG_PRIORITIES } from "@/lib/work-log-shared"
import {
  WorklogKpiCard,
  WorklogManagerFeedback,
  WorklogPriorityChip,
  WorklogProgressBar,
} from "./worklog-shared-ui"
import { WorklogPeriodPanel } from "./worklog-period-panel"

const PROGRESS_AUTO_SAVE_MS = 700

function mergeEphemeralDrafts(serverItems: WorkLogItem[], localItems: WorkLogItem[]): WorkLogItem[] {
  const drafts = localItems.filter((it) => isEphemeralWorkLogId(it.id))
  if (drafts.length === 0) return serverItems
  const serverKeys = new Set(
    serverItems.map((it) => workLogContentKey(it.content)).filter(Boolean)
  )
  const extra = drafts.filter((it) => {
    const key = workLogContentKey(it.content)
    return !key || !serverKeys.has(key)
  })
  return [...serverItems, ...extra]
}

function resolveWorkLogItemForSave(
  item: WorkLogItem,
  draftIdMap: Map<string, string>
): WorkLogItem {
  const id = String(item.id || "").trim()
  if (isEphemeralWorkLogId(id)) {
    const persisted = draftIdMap.get(id)
    if (persisted) return { ...item, id: persisted }
  }
  return item
}

function applySavedWorkLogIds(
  items: WorkLogItem[],
  sentLogs: WorkLogItem[],
  savedIds: { id: string; content: string }[],
  draftIdMap: Map<string, string>
): WorkLogItem[] {
  if (savedIds.length === 0) return items

  const clientToSaved = new Map<string, string>()
  for (let i = 0; i < sentLogs.length; i++) {
    const sent = sentLogs[i]
    const saved = savedIds[i]
    if (!saved?.id) continue
    const clientId = String(sent.id || "").trim()
    if (!clientId) continue
    clientToSaved.set(clientId, saved.id)
    if (isEphemeralWorkLogId(clientId)) draftIdMap.set(clientId, saved.id)
  }

  return items.map((it) => {
    const id = String(it.id || "").trim()
    const mapped = clientToSaved.get(id)
    if (mapped) return { ...it, id: mapped }
    if (!isEphemeralWorkLogId(id)) return it
    const fromDraft = draftIdMap.get(id)
    if (fromDraft) return { ...it, id: fromDraft }
    const key = workLogContentKey(it.content)
    if (!key) return it
    const hit = savedIds.find((s) => workLogContentKey(s.content) === key)
    return hit ? { ...it, id: hit.id } : it
  })
}

function shouldAutoSaveWorkLogItem(id: string | undefined | null): boolean {
  return !isEphemeralWorkLogId(id)
}

function WorklogSection({
  tone,
  icon,
  title,
  headerExtra,
  children,
}: {
  tone: "success" | "warning" | "primary"
  icon: React.ReactNode
  title: string
  headerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  const headerBg =
    tone === "success" ? "bg-success/5" : tone === "warning" ? "bg-warning/5" : "bg-primary/5"
  return (
    <div className="flex min-h-0 flex-col rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className={cn("flex items-center gap-2.5 border-b px-4 py-3", headerBg)}>
        {icon}
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {headerExtra}
      </div>
      <div className="min-h-[120px] flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
    </div>
  )
}

interface WorklogMyProps {
  userName: string
  employeeId?: number
}

export function WorklogMy({ userName, employeeId }: WorklogMyProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()
  const aiTaskPrefillApplied = React.useRef(false)
  const [dateStr, setDateStr] = React.useState(() => getBangkokTodayDateString())
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
  const [viewMode, setViewMode] = React.useState<"day" | "period">("day")
  const [autoSaveStatus, setAutoSaveStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle")
  const localFinishRef = React.useRef(localFinish)
  const localContinueRef = React.useRef(localContinue)
  const localTodayRef = React.useRef(localToday)
  const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSaveGenRef = React.useRef(0)
  const persistChainRef = React.useRef(Promise.resolve())
  const draftPersistedIdRef = React.useRef(new Map<string, string>())

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

  const avgProgress = React.useMemo(() => {
    const active = [...localContinue, ...localToday].filter((it) => (it.content || "").trim())
    if (active.length === 0) return 0
    const sum = active.reduce((a, it) => a + (Number(it.progress) || 0), 0)
    return Math.round(sum / active.length)
  }, [localContinue, localToday])

  React.useEffect(() => {
    localFinishRef.current = localFinish
    localContinueRef.current = localContinue
    localTodayRef.current = localToday
  }, [localFinish, localContinue, localToday])

  React.useEffect(() => {
    if (aiTaskPrefillApplied.current) return
    const taskTitle = searchParams.get("aiTaskTitle")
    if (!taskTitle?.trim()) return
    aiTaskPrefillApplied.current = true
    const taskDesc = searchParams.get("aiTaskDesc") || ""
    const content = taskDesc.trim() ? `${taskTitle.trim()}\n${taskDesc.trim()}` : taskTitle.trim()
    setLocalToday((prev) => [
      ...prev,
      {
        id: `_temp_ai_${Date.now()}`,
        content,
        progress: 0,
        status: "Today",
        priority: "중",
      },
    ])
    setHasSearched(true)
  }, [searchParams])

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
    getWorkLogStaffList().then((r) => setStaffList(r.staff || []))
  }, [])

  React.useEffect(() => {
    if (staffList.length > 0 && selectedStaff && !staffList.some((s) => s.name === selectedStaff)) {
      const match = staffList.find((s) => s.displayName === selectedStaff || s.name === selectedStaff)
      if (match) setSelectedStaff(match.name)
    }
  }, [staffList, selectedStaff])

  const loadData = React.useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!selectedStaff) return
      cancelPendingAutoSave()
      draftPersistedIdRef.current.clear()
      if (!opts?.quiet) setLoading(true)
      try {
        const res = await getWorkLogData({
          dateStr,
          name: selectedStaff,
          ...(employeeId != null && employeeId > 0 ? { employeeId } : {}),
        })
        setData(res)
        setLocalFinish(res.finish || [])
        setLocalContinue(mergeEphemeralDrafts(res.continueItems || [], localContinueRef.current))
        setLocalToday(mergeEphemeralDrafts(res.todayItems || [], localTodayRef.current))
      } catch {
        setData(null)
        setLocalFinish([])
        setLocalContinue([])
        setLocalToday([])
      } finally {
        if (!opts?.quiet) setLoading(false)
      }
    },
    [dateStr, selectedStaff, employeeId, cancelPendingAutoSave]
  )

  const buildTodayLogsForSave = React.useCallback((): WorkLogItem[] => {
    const draftMap = draftPersistedIdRef.current
    return localTodayRef.current
      .filter((it) => Boolean(normalizeWorkLogContent(it.content)))
      .map((it) => {
        const resolved = resolveWorkLogItemForSave(it, draftMap)
        return {
          ...resolved,
          progress: Number(resolved.progress) || 0,
        }
      })
  }, [])

  const buildAllLogs = React.useCallback((): WorkLogItem[] => {
    const finish = localFinishRef.current
    const cont = localContinueRef.current
    const today = localTodayRef.current
    const draftMap = draftPersistedIdRef.current
    return [
      ...finish.map((it) => ({ ...resolveWorkLogItemForSave(it, draftMap), type: undefined })),
      ...cont.map((it) => {
        const resolved = resolveWorkLogItemForSave(it, draftMap)
        return {
          ...resolved,
          type: "continue" as const,
          progress: Number(resolved.progress) || 0,
        }
      }),
      ...today.map((it) => ({ ...resolveWorkLogItemForSave(it, draftMap), type: undefined })),
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
          t("workLogSaveUnfinishedConfirm").replace("{count}", String(unfinishedCount))
        )
        if (!proceed) return false
      }
      if (silent) setAutoSaveStatus("saving")
      else setSaving(true)
      try {
        const logs = todayOnly ? buildTodayLogsForSave() : buildAllLogs()
        if (todayOnly && logs.length === 0) return true

        const res = await saveWorkLogData({
          date: dateStr,
          name: selectedStaff,
          logs,
          ...(employeeId != null && employeeId > 0 ? { employeeId } : {}),
        })
        if (res.success) {
          const savedIds = (res as { savedIds?: { id: string; content: string }[] }).savedIds
          if (savedIds?.length) {
            const draftMap = draftPersistedIdRef.current
            const nextContinue = applySavedWorkLogIds(
              localContinueRef.current,
              logs,
              savedIds,
              draftMap
            )
            const nextToday = applySavedWorkLogIds(localTodayRef.current, logs, savedIds, draftMap)
            localContinueRef.current = nextContinue
            localTodayRef.current = nextToday
            setLocalContinue(nextContinue)
            setLocalToday(nextToday)
          }
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
      dateStr,
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

  const scheduleAutoSaveProgress = React.useCallback(
    (opts?: { todayOnly?: boolean }) => {
      if (!hasSearched || !selectedStaff) return
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = setTimeout(() => {
        autoSaveTimerRef.current = null
        const gen = ++autoSaveGenRef.current
        void (async () => {
          setAutoSaveStatus("saving")
          const ok = await persistWorkLogProgress({
            silent: true,
            reload: false,
            todayOnly: opts?.todayOnly ?? false,
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
    },
    [hasSearched, selectedStaff, persistWorkLogProgress]
  )

  const handleSearch = () => {
    setHasSearched(true)
    void loadData()
  }

  // 표시용 번역만: Finish 본문 + 매니저 코멘트 (편집 중인 Continue/Today 원문은 제외)
  const contentsToTranslate = React.useMemo(() => {
    const set = new Set<string>()
    for (const it of localFinish) {
      if (it.content?.trim()) set.add(it.content.trim())
    }
    for (const it of [...localFinish, ...localContinue, ...localToday]) {
      const c = it.managerComment?.trim()
      if (c && !c.startsWith("⚡")) set.add(c)
    }
    return Array.from(set)
  }, [localFinish, localContinue, localToday])

  React.useEffect(() => {
    setContentTransMap({})
  }, [lang])

  React.useEffect(() => {
    if (contentsToTranslate.length === 0) return
    const missing = contentsToTranslate.filter((txt) => !(txt in contentTransMap))
    if (missing.length === 0) return
    let cancelled = false
    const handle = setTimeout(() => {
      translateTexts(missing, lang)
        .then((translated) => {
          if (cancelled) return
          setContentTransMap((prev) => {
            const next = { ...prev }
            missing.forEach((txt, i) => {
              next[txt] = translated[i] ?? txt
            })
            return next
          })
        })
        .catch(() => {})
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [contentsToTranslate.join("\u241E"), lang, contentTransMap])

  const getTransContent = (content: string) =>
    (content?.trim() && contentTransMap[content.trim()]) || content || t("workLogNoContent")

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

  const addNewToday = () => {
    setLocalToday((prev) => [
      ...prev,
      {
        id: `_temp_${Date.now()}`,
        content: "",
        progress: 0,
        status: "Today",
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
    scheduleAutoSaveProgress({ todayOnly: false })
  }

  const updateContent = (
    setList: React.Dispatch<React.SetStateAction<WorkLogItem[]>>,
    idOrIndex: string | number,
    content: string,
    todayOnly: boolean
  ) => {
    setList((prev) => {
      if (typeof idOrIndex === "number") {
        return prev.map((it, i) => (i === idOrIndex ? { ...it, content } : it))
      }
      return prev.map((it) => (it.id === idOrIndex ? { ...it, content } : it))
    })
    const itemId = typeof idOrIndex === "string" ? idOrIndex : undefined
    if (!shouldAutoSaveWorkLogItem(itemId)) return
    scheduleAutoSaveProgress({ todayOnly })
  }

  const updatePriority = (
    setList: React.Dispatch<React.SetStateAction<WorkLogItem[]>>,
    idOrIndex: string | number,
    priority: string,
    todayOnly: boolean
  ) => {
    setList((prev) => {
      if (typeof idOrIndex === "number") {
        return prev.map((it, i) => (i === idOrIndex ? { ...it, priority } : it))
      }
      return prev.map((it) => (it.id === idOrIndex ? { ...it, priority } : it))
    })
    const itemId = typeof idOrIndex === "string" ? idOrIndex : undefined
    if (!shouldAutoSaveWorkLogItem(itemId)) return
    scheduleAutoSaveProgress({ todayOnly })
  }

  const handleContinueProgressChange = (id: string, progress: number) => {
    setLocalContinue((prev) => {
      const next = prev.map((it) =>
        it.id === id ? { ...it, progress, status: progress >= 100 ? "Finish" : it.status } : it
      )
      localContinueRef.current = next
      return next
    })
    if (!shouldAutoSaveWorkLogItem(id)) return
    scheduleAutoSaveProgress({ todayOnly: false })
  }

  const handleTodayProgressChange = (id: string, progress: number) => {
    setLocalToday((prev) => {
      const next = prev.map((it) =>
        it.id === id ? { ...it, progress, status: progress >= 100 ? "Finish" : it.status } : it
      )
      localTodayRef.current = next
      return next
    })
    if (!shouldAutoSaveWorkLogItem(id)) return
    scheduleAutoSaveProgress({ todayOnly: true })
  }

  const handleDeleteOwn = async (id: string | undefined, list: "continue" | "today") => {
    if (!id) return
    if (!(await appConfirm(t("workLogDeleteConfirm")))) return
    if (!id.startsWith("_temp_")) {
      try {
        const res = await deleteWorkLogItem({ id })
        if (!res.success) {
          await appAlert(t("workLogDeleteFail"))
          return
        }
      } catch {
        await appAlert(t("workLogDeleteFail"))
        return
      }
    }
    if (list === "continue") {
      setLocalContinue((prev) => prev.filter((it) => it.id !== id))
    } else {
      setLocalToday((prev) => prev.filter((it) => it.id !== id))
    }
    void loadData({ quiet: true })
  }

  const handleSaveProgress = async () => {
    if (!selectedStaff) return
    cancelPendingAutoSave()
    await persistWorkLogProgress({ silent: false, reload: true })
  }

  const handleDailyClose = async () => {
    if (!selectedStaff) return
    cancelPendingAutoSave()
    if (!(await appConfirm(t("workLogDailyCloseConfirm")))) return
    setSaving(true)
    try {
      const toClose = [...localContinue, ...localToday].filter((it) => it.content || it.id)
      const res = await submitDailyClose({
        date: dateStr,
        name: selectedStaff,
        logs: toClose,
        ...(employeeId != null && employeeId > 0 ? { employeeId } : {}),
      })
      if (res.success) {
        await loadData()
        await appAlert(
          (res as { messageKey?: string }).messageKey
            ? t((res as { messageKey?: string }).messageKey!)
            : translateApiMessage(res.message, t) || t("workLogCloseDone")
        )
      } else {
        const r = res as { messageKey?: string; message?: string }
        await appAlert(
          r.message
            ? `${t(r.messageKey || "workLogCloseFail")}: ${translateApiMessage(r.message, t)}`
            : t(r.messageKey || "workLogCloseFail")
        )
      }
    } catch {
      await appAlert(t("workLogCloseError"))
    } finally {
      setSaving(false)
    }
  }

  const staffLabel = (() => {
    const row = staffList.find((s) => s.name === selectedStaff || s.displayName === selectedStaff)
    return row ? formatWorkLogStaffSelectLabel(row) : selectedStaff || userName
  })()

  return (
    <div className="relative flex flex-col gap-6 pb-20">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              {t("workLogViewMode")}
            </label>
            <Select
              value={viewMode}
              onValueChange={(v) => {
                cancelPendingAutoSave()
                setViewMode(v as "day" | "period")
                if (v === "day") setHasSearched(false)
              }}
            >
              <SelectTrigger className="h-9 w-28 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t("workLogViewModeDay")}</SelectItem>
                <SelectItem value="period">{t("workLogViewModePeriod")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {viewMode === "day" && (
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-primary" />
              {t("workLogDateSelect")}
            </label>
            <Input
              type="date"
              value={dateStr}
              onChange={(e) => {
                cancelPendingAutoSave()
                setDateStr(e.target.value)
                setHasSearched(false)
              }}
              className="h-9 w-36 text-xs shrink-0"
            />
          </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              {t("workLogEmployee")}
            </label>
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-xs font-medium">
              {staffLabel}
            </div>
          </div>
          {viewMode === "day" && (
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={handleSearch} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("workLogSearch")}
          </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {viewMode === "period" ? t("workLogPeriodViewHint") : t("workLogFlowHint")}
        </p>
      </div>

      {viewMode === "period" ? (
        <WorklogPeriodPanel
          employeeId={employeeId}
          employeeName={selectedStaff}
          embedded
          onDatePick={(d) => {
            setDateStr(d)
            setViewMode("day")
            setHasSearched(false)
          }}
        />
      ) : !hasSearched ? (
        <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
          {t("orderSearchHint") || "조회 버튼을 눌러 주세요."}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center rounded-xl border bg-card py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <WorklogKpiCard
              icon={
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
              }
              label={t("workLogFinishWork")}
              value={localFinish.length}
              tone="success"
            />
            <WorklogKpiCard
              icon={
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
                  <ArrowRightFromLine className="h-4 w-4 text-warning" />
                </div>
              }
              label={t("workLogContinueWork")}
              value={localContinue.length}
              tone="warning"
            />
            <WorklogKpiCard
              icon={
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Play className="h-4 w-4 text-primary" />
                </div>
              }
              label={t("workLogTodayWork")}
              value={localToday.length}
              tone="primary"
            />
            <WorklogKpiCard
              icon={
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
              }
              label={t("workLogSummaryAvg")}
              value={`${avgProgress}%`}
            />
          </div>

          <div className="flex flex-col gap-5">
            <WorklogSection
              tone="success"
              icon={<CheckCircle2 className="h-4 w-4 text-success" />}
              title={t("workLogFinishWork")}
            >
              {localFinish.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("workLogNoFinish")}</p>
              ) : (
                localFinish.map((it) => (
                  <div key={it.id} className="rounded-lg border bg-background p-3 text-sm">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="font-medium text-foreground whitespace-pre-wrap flex-1">
                        {getTransContent(it.content || "")}
                      </p>
                      <WorklogPriorityChip priority={it.priority} />
                    </div>
                    <WorklogProgressBar value={it.progress} />
                    <WorklogManagerFeedback item={it} getTransComment={getTransComment} t={t} />
                  </div>
                ))
              )}
            </WorklogSection>

            <WorklogSection
              tone="warning"
              icon={<ArrowRightFromLine className="h-4 w-4 text-warning" />}
              title={t("workLogContinueWork")}
              headerExtra={
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 px-2 text-xs"
                  onClick={addNewContinue}
                  title={t("workLogAddTask")}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              }
            >
              {selectedContinueIds.size > 0 && (
                <div className="mb-2 flex items-center gap-2 rounded-md bg-warning/10 px-2 py-1.5">
                  <Button size="sm" className="h-7 text-xs" onClick={moveSelectedToToday}>
                    <Play className="mr-1 h-3 w-3" />
                    {t("workLogStartToday")} ({selectedContinueIds.size})
                  </Button>
                </div>
              )}
              {localContinue.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("workLogNoContinue")}</p>
              ) : (
                localContinue.map((it) => (
                  <div key={it.id} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <Checkbox
                        checked={selectedContinueIds.has(it.id || "")}
                        onCheckedChange={() => toggleSelectContinue(it.id || "")}
                        className="mt-2 shrink-0"
                      />
                      <Textarea
                        value={it.content}
                        onChange={(e) => updateContent(setLocalContinue, it.id, e.target.value, false)}
                        placeholder={t("workLogTaskPlaceholder")}
                        className="min-h-[5.5rem] text-sm flex-1 resize-y"
                        rows={4}
                      />
                      <div className="flex shrink-0 flex-col gap-1">
                        <Select
                          value={it.priority || ""}
                          onValueChange={(v) => updatePriority(setLocalContinue, it.id, v, false)}
                        >
                          <SelectTrigger className="h-8 w-20 text-xs">
                            <SelectValue placeholder={t("workLogPriority")} />
                          </SelectTrigger>
                          <SelectContent>
                            {WORK_LOG_PRIORITIES.map((p) => (
                              <SelectItem key={p.value} value={p.value}>
                                {t(p.key)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-1 text-destructive"
                          onClick={() => void handleDeleteOwn(it.id, "continue")}
                          title={t("workLogDeleteOwn")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <WorklogProgressBar
                      value={it.progress}
                      onChange={(v) => handleContinueProgressChange(it.id, v)}
                    />
                    {it.managerComment?.startsWith("⚡") && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatManagerComment(it.managerComment)}
                      </p>
                    )}
                    <WorklogManagerFeedback item={it} getTransComment={getTransComment} t={t} />
                  </div>
                ))
              )}
            </WorklogSection>

            <WorklogSection
              tone="primary"
              icon={<Play className="h-4 w-4 text-primary" />}
              title={t("workLogTodayWork")}
              headerExtra={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 px-2 text-xs"
                    onClick={addNewToday}
                    title={t("workLogTodayAdd")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  {autoSaveStatus !== "idle" && (
                    <span
                      className={cn(
                        "text-[10px] font-medium tabular-nums",
                        autoSaveStatus === "error" ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {autoSaveStatus === "saving"
                        ? t("loading")
                        : autoSaveStatus === "saved"
                          ? t("workLogSaveDone")
                          : t("workLogSaveFail")}
                    </span>
                  )}
                </>
              }
            >
              {localToday.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("workLogNoToday")}</p>
              ) : (
                localToday.map((it) => (
                  <div key={it.id} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <Textarea
                        value={it.content}
                        onChange={(e) => updateContent(setLocalToday, it.id, e.target.value, true)}
                        placeholder={t("workLogTaskPlaceholder")}
                        className="min-h-[5.5rem] text-sm flex-1 resize-y"
                        rows={4}
                      />
                      <div className="flex shrink-0 flex-col gap-1">
                        <Select
                          value={it.priority || ""}
                          onValueChange={(v) => updatePriority(setLocalToday, it.id, v, true)}
                        >
                          <SelectTrigger className="h-8 w-20 text-xs">
                            <SelectValue placeholder={t("workLogPriority")} />
                          </SelectTrigger>
                          <SelectContent>
                            {WORK_LOG_PRIORITIES.map((p) => (
                              <SelectItem key={p.value} value={p.value}>
                                {t(p.key)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-1 text-destructive"
                          onClick={() => void handleDeleteOwn(it.id, "today")}
                          title={t("workLogDeleteOwn")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <WorklogProgressBar value={it.progress} onChange={(v) => handleTodayProgressChange(it.id, v)} />
                    <WorklogManagerFeedback item={it} getTransComment={getTransComment} t={t} />
                  </div>
                ))
              )}
            </WorklogSection>
          </div>
        </>
      )}

      {hasSearched && !loading && viewMode === "day" && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:left-[var(--sidebar-width,0px)]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
            {unfinishedCount > 0 && (
              <span className="mr-auto text-xs text-warning">
                {t("workLogInProgress")}: {unfinishedCount}
              </span>
            )}
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => void handleSaveProgress()} disabled={saving}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {t("workLogStickySave")}
            </Button>
            <Button size="sm" className="h-9 text-xs" onClick={() => void handleDailyClose()} disabled={saving}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              {t("workLogStickyClose")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

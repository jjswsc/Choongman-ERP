"use client"

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
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getWorkLogStaffList,
  getWorkLogData,
  saveWorkLogData,
  submitDailyClose,
  translateTexts,
  type WorkLogItem,
  type WorkLogData,
} from "@/lib/api-client"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

interface WorklogMyProps {
  userName: string
}

export function WorklogMy({ userName }: WorklogMyProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [dateStr, setDateStr] = React.useState(todayStr)
  const [selectedStaff, setSelectedStaff] = React.useState(userName)
  const [staffList, setStaffList] = React.useState<{ name: string; displayName: string }[]>([])
  const [data, setData] = React.useState<WorkLogData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [localFinish, setLocalFinish] = React.useState<WorkLogItem[]>([])
  const [localContinue, setLocalContinue] = React.useState<WorkLogItem[]>([])
  const [localToday, setLocalToday] = React.useState<WorkLogItem[]>([])
  const [selectedContinueIds, setSelectedContinueIds] = React.useState<Set<string>>(new Set())
  const [contentTransMap, setContentTransMap] = React.useState<Record<string, string>>({})

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

  const loadData = React.useCallback(async () => {
    if (!selectedStaff) return
    setLoading(true)
    try {
      const res = await getWorkLogData({ dateStr, name: selectedStaff })
      setData(res)
      setLocalFinish(res.finish || [])
      setLocalContinue((res.continueItems || []).map((it) => ({ ...it, progress: 0 })))
      setLocalToday(res.todayItems || [])
    } catch {
      setData(null)
      setLocalFinish([])
      setLocalContinue([])
      setLocalToday([])
    } finally {
      setLoading(false)
    }
  }, [dateStr, selectedStaff])

  React.useEffect(() => {
    if (selectedStaff) loadData()
  }, [selectedStaff, dateStr, loadData])

  const contentsToTranslate = React.useMemo(() => {
    const set = new Set<string>()
    for (const it of localFinish) if (it.content?.trim()) set.add(it.content.trim())
    for (const it of localContinue) if (it.content?.trim()) set.add(it.content.trim())
    for (const it of localToday) if (it.content?.trim()) set.add(it.content.trim())
    return Array.from(set)
  }, [localFinish, localContinue, localToday])

  React.useEffect(() => {
    if (contentsToTranslate.length === 0) {
      setContentTransMap({})
      return
    }
    let cancelled = false
    translateTexts(contentsToTranslate, lang).then((translated) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      contentsToTranslate.forEach((txt, i) => { map[txt] = translated[i] ?? txt })
      setContentTransMap(map)
    }).catch(() => setContentTransMap({}))
    return () => { cancelled = true }
  }, [contentsToTranslate.join("\u241E"), lang])

  const getTransContent = (content: string) => (content?.trim() && contentTransMap[content.trim()]) || content || t("workLogNoContent")

  const updateProgress = (
    list: WorkLogItem[],
    setList: React.Dispatch<React.SetStateAction<WorkLogItem[]>>,
    id: string,
    progress: number
  ) => {
    setList((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, progress, status: progress >= 100 ? "Finish" : it.status } : it
      )
    )
  }

  const addNewContinue = () => {
    setLocalContinue((prev) => [
      ...prev,
      {
        id: `_temp_${Date.now()}`,
        content: "",
        progress: 0,
        status: "Continue",
        priority: "",
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
    setLocalToday((prev) => [
      ...prev,
      ...toMove.map((it) => ({ ...it, status: "Today", progress: 0 })),
    ])
    setSelectedContinueIds(new Set())
  }

  const removeItem = (
    list: WorkLogItem[],
    setList: React.Dispatch<React.SetStateAction<WorkLogItem[]>>,
    id: string
  ) => {
    if (!id) {
      setList((prev) => prev.filter((_, i) => prev.length - 1 !== i))
      return
    }
    setList((prev) => prev.filter((it) => it.id !== id))
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

  const formatManagerComment = (comment: string) => {
    if (!comment) return ""
    return comment
      .replace(/이월됨/g, t("workLogCarriedOver") || "Carried over")
      .replace(/부터/g, t("workLogFrom") || "from")
  }

  const updateProgressByIndex = (
    setList: React.Dispatch<React.SetStateAction<WorkLogItem[]>>,
    index: number,
    progress: number
  ) => {
    setList((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, progress, status: progress >= 100 ? "Finish" : it.status } : it
      )
    )
  }

  const handleSaveProgress = async () => {
    if (!selectedStaff) return
    setSaving(true)
    try {
      const allLogs: WorkLogItem[] = [
        ...localFinish.map((it) => ({ ...it, type: undefined })),
        ...localContinue.map((it) => ({ ...it, type: "continue" as const, progress: 0 })),
        ...localToday.map((it) => ({ ...it, type: undefined })),
      ].filter((it) => it.content || it.id)
      const res = await saveWorkLogData({
        date: dateStr,
        name: selectedStaff,
        logs: allLogs,
      })
      if (res.success) {
        loadData()
      } else {
        alert(res.message || t("workLogSaveFail"))
      }
    } catch (e) {
      alert(t("workLogSaveError"))
    } finally {
      setSaving(false)
    }
  }

  const handleDailyClose = async () => {
    if (!selectedStaff) return
        if (!confirm(t("workLogDailyCloseConfirm"))) return
    setSaving(true)
    try {
      const toClose = [...localContinue, ...localToday].filter((it) => it.content || it.id)
      const res = await submitDailyClose({
        date: dateStr,
        name: selectedStaff,
        logs: toClose,
      })
      if (res.success) {
        loadData()
        alert(res.message || t("workLogCloseDone"))
      } else {
        alert(res.message || t("workLogCloseFail"))
      }
    } catch (e) {
      alert(t("workLogCloseError"))
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
              {t("workLogDate")}
            </label>
            <Input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="h-9 w-40 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              {t("workLogEmployee")}
            </label>
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-xs font-medium">
              {staffList.find((s) => s.name === selectedStaff || s.displayName === selectedStaff)?.displayName || selectedStaff || userName}
            </div>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={loadData} disabled={loading}>
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

      {loading ? (
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      {it.progress}% · {formatManagerComment(it.managerComment || "")}
                    </p>
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
                    </div>
                    <p className="text-xs font-bold text-muted-foreground">{t("workLogProgressHint")}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{formatManagerComment(it.managerComment || "")}</p>
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
            </div>
            <div className="min-h-[80px] max-h-64 overflow-y-auto p-4 space-y-2">
              {localToday.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("workLogNoToday")}</p>
              ) : (
                localToday.map((it, idx) => (
                  <div key={it.id || `new-${idx}`} className="rounded-lg border bg-background p-3">
                    <Textarea
                      value={it.content}
                      onChange={(e) => updateContent(setLocalToday, idx, e.target.value)}
                      placeholder="업무 내용 (엔터로 줄바꿈)"
                      className="mb-2 min-h-[36px] text-xs resize-y"
                      rows={1}
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={it.progress}
                        onChange={(e) => updateProgressByIndex(setLocalToday, idx, Number(e.target.value))}
                        className="h-2 flex-1"
                      />
                      <span className="text-xs font-bold w-8">{it.progress}%</span>
                    </div>
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

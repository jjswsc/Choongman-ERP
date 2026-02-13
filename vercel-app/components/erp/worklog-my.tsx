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
import {
  getWorkLogStaffList,
  getWorkLogData,
  saveWorkLogData,
  submitDailyClose,
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

  const loadData = React.useCallback(async () => {
    if (!selectedStaff) return
    setLoading(true)
    try {
      const res = await getWorkLogData({ dateStr, name: selectedStaff })
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
      setLoading(false)
    }
  }, [dateStr, selectedStaff])

  React.useEffect(() => {
    if (selectedStaff) loadData()
  }, [selectedStaff, dateStr, loadData])

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
      ...toMove.map((it) => ({ ...it, status: "Today" })),
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
        ...localContinue.map((it) => ({ ...it, type: "continue" as const })),
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
        alert(res.message || "저장 실패")
      }
    } catch (e) {
      alert("저장 중 오류 발생")
    } finally {
      setSaving(false)
    }
  }

  const handleDailyClose = async () => {
    if (!selectedStaff) return
    if (!confirm("업무를 마감하시겠습니까?\n• 100% 완료 업무 → Finish Work로 이동\n• 미완료 업무 → 다음날 Continue Work로 자동 이월")) return
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
        alert(res.message || "마감 완료!")
      } else {
        alert(res.message || "마감 실패")
      }
    } catch (e) {
      alert("마감 중 오류 발생")
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
              날짜
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
              직원
            </label>
            <Select value={selectedStaff || undefined} onValueChange={setSelectedStaff}>
              <SelectTrigger className="h-9 w-40 text-xs">
                <SelectValue placeholder="직원 선택" />
              </SelectTrigger>
              <SelectContent>
                {userName && !staffList.some((s) => s.name === userName || s.displayName === userName) && (
                  <SelectItem key="_me" value={userName}>
                    {userName}
                  </SelectItem>
                )}
                {staffList.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.displayName || s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={loadData} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            조회
          </Button>
          <Button size="sm" variant="outline" className="h-9 px-4 text-xs font-semibold" onClick={handleSaveProgress} disabled={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            진행상황 저장
          </Button>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={handleDailyClose} disabled={saving}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            업무 끝내기
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
              <h3 className="text-sm font-bold text-foreground">Finish Work</h3>
            </div>
            <div className="min-h-[80px] max-h-64 overflow-y-auto p-4 space-y-2">
              {localFinish.length === 0 ? (
                <p className="text-xs text-muted-foreground">완료된 업무가 없습니다.</p>
              ) : (
                localFinish.map((it) => (
                  <div key={it.id} className="rounded-lg border bg-background p-3 text-sm">
                    <p className="font-medium text-foreground whitespace-pre-wrap">{it.content || "(내용 없음)"}</p>
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
              <h3 className="text-sm font-bold text-foreground">Continue Work</h3>
              <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={addNewContinue} title="업무 추가">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {selectedContinueIds.size > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border-b">
                <Button size="sm" className="h-7 text-xs" onClick={moveSelectedToToday}>
                  <Play className="mr-1 h-3 w-3" />
                  선택한 업무 오늘 시작하기 ({selectedContinueIds.size})
                </Button>
              </div>
            )}
            <div className="min-h-[80px] max-h-64 overflow-y-auto p-4 space-y-2">
              {localContinue.length === 0 ? (
                <p className="text-xs text-muted-foreground">이월된 업무가 없습니다. + 버튼으로 추가하세요.</p>
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
                        placeholder="업무 내용 (엔터로 줄바꿈)"
                        className="min-h-[36px] text-xs flex-1 resize-y"
                        rows={1}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={it.progress}
                        onChange={(e) => updateProgress(localContinue, setLocalContinue, it.id, Number(e.target.value))}
                        className="h-2 flex-1"
                      />
                      <span className="text-xs font-bold w-8">{it.progress}%</span>
                    </div>
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
              <h3 className="text-sm font-bold text-foreground">Today Work</h3>
            </div>
            <div className="min-h-[80px] max-h-64 overflow-y-auto p-4 space-y-2">
              {localToday.length === 0 ? (
                <p className="text-xs text-muted-foreground">Continue Work에서 선택 후 &quot;오늘 시작하기&quot;로 가져오세요.</p>
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
